import type { IssuePriority, IssueType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireCan } from "@/lib/policy";
import { requireMembership } from "@/lib/tenancy";
import { rankAfter } from "@/lib/rank";

type JsonRecord = Record<string, unknown>;

export type JiraUser = {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
};

export type JiraProject = {
  id: string;
  key: string;
  name: string;
  self?: string;
  lead?: JiraUser;
  projectTypeKey?: string;
  simplified?: boolean;
};

export type JiraIssue = {
  id: string;
  key: string;
  self?: string;
  fields: JsonRecord & {
    summary?: string;
    description?: unknown;
    issuetype?: { name?: string };
    priority?: { name?: string } | null;
    status?: { id?: string; name?: string; statusCategory?: { key?: string; name?: string } };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    labels?: string[];
    duedate?: string | null;
    parent?: { id?: string; key?: string };
    comment?: { comments?: JiraComment[] };
    attachment?: JiraAttachment[];
  };
};

export type JiraComment = {
  id: string;
  body?: unknown;
  author?: JiraUser;
  created?: string;
  updated?: string;
};

export type JiraAttachment = {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  content?: string;
};

export type JiraConnectionInput = {
  siteUrl: string;
  email?: string;
  apiToken?: string;
};

export type JiraIssuePlanContext = {
  projectKey: string;
  projectId: string;
  statusMap: Record<string, string>;
  userMap: Record<string, string>;
  fallbackReporterId: string;
  sourceBaseUrl?: string;
};

export type WorkhubIssuePlan = {
  issue: {
    projectId: string;
    number: number;
    type: IssueType;
    title: string;
    description: Prisma.InputJsonValue;
    statusId: string | null;
    priority: IssuePriority;
    assigneeId: string | null;
    reporterId: string;
    dueDate: Date | null;
    storyPoints: number | null;
    parentJiraKey: string | null;
    customFields: Prisma.InputJsonValue;
  };
  labels: string[];
  comments: Array<{ sourceId: string; authorAccountId?: string; body: Prisma.InputJsonValue; created?: string }>;
  attachments: JiraAttachment[];
  warnings: string[];
};

export function normalizeJiraBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(trimmed)) throw new AppError("VALIDATION", "Jira site URL must start with https://");
  return trimmed;
}

export function normalizeJiraProjectKey(key: string) {
  const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!/^[A-Z][A-Z0-9]*$/.test(normalized)) throw new AppError("VALIDATION", `Invalid Jira project key: ${key}`);
  return normalized;
}

export function jiraIssueTypeToWorkhub(name?: string): IssueType {
  const value = (name ?? "").toLowerCase();
  if (value.includes("epic")) return "EPIC";
  if (value.includes("story")) return "STORY";
  if (value.includes("bug") || value.includes("defect")) return "BUG";
  if (value.includes("sub")) return "SUBTASK";
  return "TASK";
}

export function jiraPriorityToWorkhub(name?: string | null): IssuePriority {
  const value = (name ?? "").toLowerCase();
  if (value.includes("highest") || value.includes("blocker") || value.includes("critical")) return "HIGHEST";
  if (value === "high" || value.includes("major")) return "HIGH";
  if (value.includes("low") && !value.includes("lowest")) return "LOW";
  if (value.includes("minor")) return "LOW";
  if (value.includes("lowest") || value.includes("trivial")) return "LOWEST";
  return "MEDIUM";
}

function textNode(text: string, marks?: unknown[]) {
  return marks?.length ? { type: "text", text, marks } : { type: "text", text };
}

function marksFromAdf(node: JsonRecord) {
  const marks = Array.isArray(node.marks) ? node.marks : [];
  return marks.map((mark) => {
    const rec = mark as JsonRecord;
    if (rec.type === "link") return { type: "link", attrs: rec.attrs ?? {} };
    return { type: String(rec.type ?? "textStyle") };
  });
}

function inlineContent(content: unknown): unknown[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((child) => {
    if (!child || typeof child !== "object") return [];
    const rec = child as JsonRecord;
    if (rec.type === "text") return [textNode(String(rec.text ?? ""), marksFromAdf(rec))];
    if (rec.type === "hardBreak") return [{ type: "hardBreak" }];
    if (rec.type === "mention") return [textNode(`@${String((rec.attrs as JsonRecord | undefined)?.text ?? (rec.attrs as JsonRecord | undefined)?.id ?? "mention")}`)];
    return inlineContent(rec.content);
  });
}

function blockFromAdf(node: JsonRecord): JsonRecord[] {
  const content = node.content;
  switch (node.type) {
    case "heading":
      return [{ type: "heading", attrs: { level: Number((node.attrs as JsonRecord | undefined)?.level ?? 2) }, content: inlineContent(content) }];
    case "paragraph":
      return [{ type: "paragraph", content: inlineContent(content) }];
    case "bulletList":
    case "orderedList":
      return [{ type: node.type, content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "listItem":
      return [{ type: "listItem", content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "codeBlock":
      return [{ type: "codeBlock", attrs: node.attrs ?? {}, content: inlineContent(content) }];
    case "panel":
      return [{ type: "panel", attrs: node.attrs ?? {}, content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "table":
      return [{ type: "table", attrs: node.attrs ?? {}, content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "tableRow":
      return [{ type: "tableRow", attrs: node.attrs ?? {}, content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "tableHeader":
    case "tableCell":
      return [{ type: node.type, attrs: node.attrs ?? {}, content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "blockquote":
      return [{ type: "blockquote", content: Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [] }];
    case "rule":
      return [{ type: "horizontalRule" }];
    default: {
      const nested = Array.isArray(content) ? content.flatMap((item) => blockFromAdf(item as JsonRecord)) : [];
      return nested.length ? nested : [{ type: "paragraph", content: inlineContent(content) }];
    }
  }
}

export function plainTextToTiptapDoc(text: string): Prisma.InputJsonValue {
  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return { type: "doc", content: blocks.length ? blocks.map((line) => ({ type: "paragraph", content: [textNode(line)] })) : [{ type: "paragraph" }] } as Prisma.InputJsonValue;
}

export function adfToTiptapDoc(input: unknown): Prisma.InputJsonValue {
  if (!input) return plainTextToTiptapDoc("");
  if (typeof input === "string") return plainTextToTiptapDoc(input);
  if (typeof input !== "object") return plainTextToTiptapDoc(String(input));
  const rec = input as JsonRecord;
  if (rec.type !== "doc" || !Array.isArray(rec.content)) return plainTextToTiptapDoc(JSON.stringify(input));
  const content = rec.content.flatMap((node) => blockFromAdf(node as JsonRecord));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } as Prisma.InputJsonValue;
}

function extractStoryPoints(fields: JsonRecord) {
  const candidates = ["customfield_10016", "customfield_10026", "storyPoints", "Story Points"];
  for (const key of candidates) {
    const value = fields[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

export function buildJiraIssueImportPlan(issue: JiraIssue, ctx: JiraIssuePlanContext): WorkhubIssuePlan {
  const fields = issue.fields ?? {};
  const warnings: string[] = [];
  const statusName = fields.status?.name ?? "To Do";
  const statusId = ctx.statusMap[statusName] ?? null;
  if (!statusId) warnings.push(`Unmapped Jira status: ${statusName}`);

  const assigneeAccountId = fields.assignee?.accountId;
  const assigneeId = assigneeAccountId ? ctx.userMap[assigneeAccountId] ?? null : null;
  if (assigneeAccountId && !assigneeId) warnings.push(`Unmapped Jira assignee: ${assigneeAccountId}`);

  const reporterAccountId = fields.reporter?.accountId;
  const reporterId = (reporterAccountId ? ctx.userMap[reporterAccountId] : null) ?? ctx.fallbackReporterId;
  if (reporterAccountId && !ctx.userMap[reporterAccountId]) warnings.push(`Unmapped Jira reporter: ${reporterAccountId}; using fallback reporter`);

  const [, numberText] = issue.key.split("-");
  const storyPoints = extractStoryPoints(fields);
  const sourceUrl = ctx.sourceBaseUrl ? `${ctx.sourceBaseUrl.replace(/\/+$/, "")}/browse/${issue.key}` : issue.self?.replace(/\/rest\/api\/3\/issue\/.+$/, `/browse/${issue.key}`) ?? null;

  return {
    issue: {
      projectId: ctx.projectId,
      number: Number(numberText) || 0,
      type: jiraIssueTypeToWorkhub(fields.issuetype?.name),
      title: fields.summary?.trim() || issue.key,
      description: adfToTiptapDoc(fields.description),
      statusId,
      priority: jiraPriorityToWorkhub(fields.priority?.name),
      assigneeId,
      reporterId,
      dueDate: fields.duedate ? new Date(fields.duedate) : null,
      storyPoints,
      parentJiraKey: fields.parent?.key ?? null,
      customFields: {
        originalJiraKey: issue.key,
        originalJiraId: issue.id,
        originalJiraUrl: sourceUrl,
        jiraStatusName: statusName,
        jiraStatusId: fields.status?.id ?? null,
        jiraIssueType: fields.issuetype?.name ?? null,
        jiraStoryPoints: storyPoints,
        jiraRawSelf: issue.self ?? null,
      } as Prisma.InputJsonValue,
    },
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    comments: fields.comment?.comments?.map((comment) => ({ sourceId: comment.id, authorAccountId: comment.author?.accountId, body: adfToTiptapDoc(comment.body), created: comment.created })) ?? [],
    attachments: fields.attachment ?? [],
    warnings,
  };
}

export class JiraClient {
  private readonly siteUrl: string;
  private readonly authHeader?: string;

  constructor(input: JiraConnectionInput) {
    this.siteUrl = normalizeJiraBaseUrl(input.siteUrl);
    this.authHeader = input.email && input.apiToken ? `Basic ${Buffer.from(`${input.email}:${input.apiToken}`).toString("base64")}` : undefined;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.siteUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(this.authHeader ? { Authorization: this.authHeader } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) throw new AppError("INTERNAL", `Jira API ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }

  async testConnection() {
    return this.request<{ accountId: string; displayName: string; emailAddress?: string }>("/rest/api/3/myself");
  }

  async listProjects() {
    return this.request<JiraProject[]>("/rest/api/3/project/search?expand=lead").then((result) => Array.isArray(result) ? result : ((result as unknown as { values?: JiraProject[] }).values ?? []));
  }

  async searchIssues(jql: string, startAt = 0, maxResults = 50) {
    const params = new URLSearchParams({ jql, startAt: String(startAt), maxResults: String(maxResults), fields: "*all" });
    return this.request<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }>(`/rest/api/3/search?${params.toString()}`);
  }
}

export async function listImportJobs(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return prisma.importJob.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20, include: { errors: { orderBy: { createdAt: "desc" }, take: 5 } } });
}

export async function createDryRunJob(userId: string, workspaceId: string, input: { sourceUrl: string; projectKeys: string[]; issueLimit: number }) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  const sourceUrl = normalizeJiraBaseUrl(input.sourceUrl);
  const projectKeys = input.projectKeys.map(normalizeJiraProjectKey);
  const summary = {
    phase: "dry-run",
    sourceUrl,
    projectKeys,
    issueLimit: input.issueLimit,
    checks: [
      "Project/status/user mapping preview",
      "ADF to Tiptap conversion readiness",
      "External ID preservation via ExternalMapping",
      "Attachment metadata preservation; binary download requires API token",
    ],
    requiredEnv: ["JIRA_EMAIL", "JIRA_API_TOKEN"],
  };
  return prisma.importJob.create({
    data: {
      workspaceId,
      source: "JIRA",
      sourceUrl,
      name: `Jira dry-run: ${projectKeys.join(", ") || "all projects"}`,
      status: "DRY_RUN",
      dryRun: true,
      config: { projectKeys, issueLimit: input.issueLimit } as Prisma.InputJsonValue,
      summary: summary as Prisma.InputJsonValue,
      createdBy: userId,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
    include: { errors: true },
  });
}

export async function importJiraFixture(userId: string, workspaceId: string, input: { sourceUrl: string; project: JiraProject; issues: JiraIssue[]; dryRun?: boolean }) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  const dryRun = input.dryRun ?? true;
  const projectKey = normalizeJiraProjectKey(input.project.key);
  const statusNames = [...new Set(input.issues.map((i) => i.fields.status?.name ?? "To Do"))];
  const summary = { projects: 1, issues: input.issues.length, statuses: statusNames.length, dryRun };

  return prisma.$transaction(async (tx) => {
    const job = await tx.importJob.create({
      data: { workspaceId, source: "JIRA", sourceUrl: normalizeJiraBaseUrl(input.sourceUrl), name: `Jira import: ${projectKey}`, status: dryRun ? "DRY_RUN" : "RUNNING", dryRun, config: { projectKey } as Prisma.InputJsonValue, summary: summary as Prisma.InputJsonValue, createdBy: userId, startedAt: new Date() },
    });
    if (dryRun) return tx.importJob.update({ where: { id: job.id }, data: { status: "DRY_RUN", finishedAt: new Date() }, include: { errors: true } });

    const project = await tx.project.upsert({
      where: { workspaceId_key: { workspaceId, key: projectKey } },
      update: { name: input.project.name, description: `Migrated from Jira project ${input.project.key}` },
      create: { workspaceId, key: projectKey, name: input.project.name, description: `Migrated from Jira project ${input.project.key}` },
      include: { statuses: true },
    });
    const statusMap: Record<string, string> = {};
    for (const [position, name] of statusNames.entries()) {
      const existing = await tx.status.findFirst({ where: { projectId: project.id, name } });
      const category = name.toLowerCase().includes("done") ? "DONE" : name.toLowerCase().includes("progress") || name.toLowerCase().includes("review") ? "IN_PROGRESS" : "TODO";
      const status = existing ?? await tx.status.create({ data: { projectId: project.id, name, category, position: position + 1 } });
      statusMap[name] = status.id;
    }
    await tx.externalMapping.upsert({ where: { workspaceId_source_entityType_sourceId: { workspaceId, source: "JIRA", entityType: "project", sourceId: input.project.id } }, update: { localId: project.id, sourceKey: input.project.key }, create: { workspaceId, source: "JIRA", entityType: "project", sourceId: input.project.id, sourceKey: input.project.key, localType: "project", localId: project.id, sourceUrl: input.project.self } });

    for (const jiraIssue of input.issues) {
      const plan = buildJiraIssueImportPlan(jiraIssue, { projectKey, projectId: project.id, statusMap, userMap: {}, fallbackReporterId: userId, sourceBaseUrl: input.sourceUrl });
      if (!plan.issue.statusId) {
        await tx.importError.create({ data: { jobId: job.id, sourceKey: jiraIssue.key, entity: "issue", message: `Missing status mapping for ${jiraIssue.fields.status?.name}`, payload: jiraIssue as unknown as Prisma.InputJsonValue } });
        continue;
      }
      const last = await tx.issue.findFirst({ where: { workspaceId, projectId: project.id, statusId: plan.issue.statusId, deletedAt: null }, orderBy: { rank: "desc" }, select: { rank: true } });
      const created = await tx.issue.upsert({
        where: { projectId_number: { projectId: project.id, number: plan.issue.number } },
        update: { title: plan.issue.title, description: plan.issue.description, priority: plan.issue.priority, customFields: plan.issue.customFields },
        create: { workspaceId, projectId: project.id, number: plan.issue.number, type: plan.issue.type, title: plan.issue.title, description: plan.issue.description, statusId: plan.issue.statusId, priority: plan.issue.priority, assigneeId: null, reporterId: userId, dueDate: plan.issue.dueDate, storyPoints: plan.issue.storyPoints, rank: rankAfter(last?.rank ?? null), customFields: plan.issue.customFields },
      });
      await tx.externalMapping.upsert({ where: { workspaceId_source_entityType_sourceId: { workspaceId, source: "JIRA", entityType: "issue", sourceId: jiraIssue.id } }, update: { localId: created.id, sourceKey: jiraIssue.key }, create: { workspaceId, source: "JIRA", entityType: "issue", sourceId: jiraIssue.id, sourceKey: jiraIssue.key, localType: "issue", localId: created.id, sourceUrl: String((plan.issue.customFields as JsonRecord).originalJiraUrl ?? "") } });
    }

    return tx.importJob.update({ where: { id: job.id }, data: { status: "COMPLETED", finishedAt: new Date(), summary: summary as Prisma.InputJsonValue }, include: { errors: true } });
  });
}
