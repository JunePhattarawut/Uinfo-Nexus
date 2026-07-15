import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireCan } from "@/lib/policy";
import { requireMembership } from "@/lib/tenancy";
import { enqueueNotification } from "@/lib/queue";
import { collectWorkspaceSearchDocuments, rebuildWorkspaceSearchIndex } from "@/modules/search/service";
import type { AutomationInput, SavedFilterInput, StatusInput, WebhookInput } from "./schemas";

export async function listSavedFilters(userId: string, workspaceId: string, projectId?: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return prisma.savedFilter.findMany({ where: { workspaceId, ...(projectId ? { projectId } : {}), OR: [{ ownerId: userId }, { scope: "WORKSPACE" }] }, orderBy: { name: "asc" } });
}

export async function createSavedFilter(userId: string, workspaceId: string, input: SavedFilterInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  if (input.projectId) await requireCan(userId, "read", { type: "project", workspaceId, projectId: input.projectId });
  return prisma.savedFilter.create({ data: { workspaceId, ownerId: userId, projectId: input.projectId ?? null, name: input.name, scope: input.scope, filters: input.filters as Prisma.InputJsonValue } });
}

export async function listStatuses(userId: string, workspaceId: string, projectId: string) {
  await requireCan(userId, "read", { type: "project", workspaceId, projectId });
  return prisma.status.findMany({ where: { projectId }, orderBy: { position: "asc" } });
}

export async function createStatus(userId: string, workspaceId: string, projectId: string, input: StatusInput) {
  await requireCan(userId, "admin", { type: "project", workspaceId, projectId });
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw new AppError("NOT_FOUND", "Project not found");
  const max = await prisma.status.findFirst({ where: { projectId }, orderBy: { position: "desc" } });
  return prisma.status.create({ data: { projectId, name: input.name, category: input.category, position: (max?.position ?? 0) + 1 } });
}

export async function updateStatus(userId: string, workspaceId: string, projectId: string, statusId: string, input: StatusInput) {
  await requireCan(userId, "admin", { type: "project", workspaceId, projectId });
  const status = await prisma.status.findFirst({ where: { id: statusId, projectId, project: { workspaceId } } });
  if (!status) throw new AppError("NOT_FOUND", "Status not found");
  return prisma.status.update({ where: { id: statusId }, data: { name: input.name, category: input.category } });
}

export async function createWebhook(userId: string, workspaceId: string, input: WebhookInput) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  return prisma.webhookEndpoint.create({ data: { workspaceId, name: input.name, url: input.url, events: input.events, secret: input.secret ?? null } });
}

export async function listWebhooks(userId: string, workspaceId: string) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  return prisma.webhookEndpoint.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } } });
}

export async function enqueueWebhookDeliveries(workspaceId: string, event: string, payload: Prisma.InputJsonValue) {
  const hooks = await prisma.webhookEndpoint.findMany({ where: { workspaceId, enabled: true, events: { has: event } } });
  for (const hook of hooks) {
    await prisma.webhookDelivery.create({ data: { webhookId: hook.id, event, payload } });
  }
}

export async function listAutomations(userId: string, workspaceId: string) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  return prisma.automationRule.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}

export async function createAutomation(userId: string, workspaceId: string, input: AutomationInput) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  return prisma.automationRule.create({ data: { workspaceId, name: input.name, trigger: input.trigger, action: input.action, enabled: input.enabled } });
}

export async function runIssueStatusAutomations(workspaceId: string, actorId: string, issueId: string, statusCategory: string) {
  await enqueueWebhookDeliveries(workspaceId, "issue.updated", { issueId, actorId, statusCategory });
  if (statusCategory !== "DONE") return;
  const rules = await prisma.automationRule.findMany({ where: { workspaceId, trigger: "issue.status.done", action: "notify.reporter", enabled: true } });
  if (!rules.length) return;
  const issue = await prisma.issue.findFirst({ where: { id: issueId, workspaceId }, include: { project: true } });
  if (!issue || issue.reporterId === actorId) return;
  await prisma.notification.create({ data: { workspaceId, userId: issue.reporterId, type: "automation.issue_done", payload: { issueId, key: `${issue.project.key}-${issue.number}`, title: issue.title } } });
  await enqueueNotification({ workspaceId, userId: issue.reporterId, type: "automation.issue_done", payload: { issueId, key: `${issue.project.key}-${issue.number}`, title: issue.title } });
}

function webhookBody(delivery: { id: string; event: string; payload: unknown; webhook: { workspaceId: string } }) {
  return JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    workspaceId: delivery.webhook.workspaceId,
    createdAt: new Date().toISOString(),
    data: delivery.payload,
  });
}

function webhookSignature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function postWebhookDelivery(delivery: { id: string; event: string; payload: unknown; webhook: { workspaceId: string; url: string; secret: string | null } }) {
  const body = webhookBody(delivery);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "WorkHub-Webhooks/1.0",
    "x-workhub-event": delivery.event,
    "x-workhub-delivery": delivery.id,
    "x-workhub-timestamp": timestamp,
  };
  if (delivery.webhook.secret) headers["x-workhub-signature"] = webhookSignature(delivery.webhook.secret, timestamp, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(delivery.webhook.url, { method: "POST", headers, body, signal: controller.signal });
    const text = (await response.text()).slice(0, 1000);
    return {
      ok: response.ok,
      response: `${response.status} ${response.statusText}${text ? ` · ${text}` : ""}`.slice(0, 1200),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverPendingWebhooks(userId: string, workspaceId: string) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  const pending = await prisma.webhookDelivery.findMany({
    where: { webhook: { workspaceId }, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } },
    include: { webhook: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  for (const delivery of pending) {
    try {
      const result = await postWebhookDelivery(delivery);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.ok ? "DELIVERED" : "FAILED",
          attempts: { increment: 1 },
          response: result.response,
          deliveredAt: result.ok ? new Date() : null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attempts: { increment: 1 }, response: message.slice(0, 1200) },
      });
    }
  }
  return pending.length;
}

export async function sprintMetrics(userId: string, workspaceId: string, projectId: string) {
  await requireCan(userId, "read", { type: "project", workspaceId, projectId });
  const sprints = await prisma.sprint.findMany({ where: { projectId }, include: { issues: { include: { status: true } } }, orderBy: { createdAt: "desc" }, take: 10 });
  return sprints.map((s) => ({ id: s.id, name: s.name, state: s.state, total: s.issues.reduce((a, i) => a + (i.storyPoints ?? 0), 0), done: s.issues.filter((i) => i.status.category === "DONE").reduce((a, i) => a + (i.storyPoints ?? 0), 0), remaining: s.issues.filter((i) => i.status.category !== "DONE").reduce((a, i) => a + (i.storyPoints ?? 0), 0) }));
}

function safeUrlHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid URL";
  }
}

function externalSearchConfig() {
  const backend = (process.env.WORKHUB_SEARCH_BACKEND ?? "postgres").toLowerCase();
  const url = process.env.WORKHUB_SEARCH_URL || process.env.ELASTICSEARCH_URL || process.env.OPENSEARCH_URL || "";
  const index = process.env.WORKHUB_SEARCH_INDEX || "workhub_search";
  const hasApiKey = Boolean(process.env.WORKHUB_SEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY || process.env.OPENSEARCH_API_KEY);
  const hasBasicAuth = Boolean((process.env.WORKHUB_SEARCH_USERNAME || process.env.ELASTICSEARCH_USERNAME || process.env.OPENSEARCH_USERNAME) && (process.env.WORKHUB_SEARCH_PASSWORD || process.env.ELASTICSEARCH_PASSWORD || process.env.OPENSEARCH_PASSWORD));
  return { backend, url, index, hasApiKey, hasBasicAuth, configured: (backend === "elasticsearch" || backend === "opensearch") && Boolean(url) };
}

export async function searchOperationsStatus(userId: string, workspaceId: string) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  const config = externalSearchConfig();
  const documents = await collectWorkspaceSearchDocuments(workspaceId);
  const counts = documents.reduce<Record<string, number>>((acc, doc) => ({ ...acc, [doc.type]: (acc[doc.type] ?? 0) + 1 }), {});
  return {
    ...config,
    urlHost: config.url ? safeUrlHost(config.url) : "not configured",
    authMode: config.hasApiKey ? "API key" : config.hasBasicAuth ? "Basic auth" : "none",
    documentCount: documents.length,
    counts,
    canReindex: config.configured,
  };
}

export async function rebuildSearchIndex(userId: string, workspaceId: string) {
  return rebuildWorkspaceSearchIndex(userId, workspaceId);
}
