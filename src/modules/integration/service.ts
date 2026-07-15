import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireCan } from "@/lib/policy";
import { requireMembership } from "@/lib/tenancy";
import { customFieldDefinitionSchema, issueCustomFieldValueSchema, type issueLinkSchema, type issuePageLinkSchema } from "./schemas";
import type { z } from "zod";

type IssuePageLinkInput = z.infer<typeof issuePageLinkSchema>;
type IssueLinkInput = z.infer<typeof issueLinkSchema>;

export async function linkIssuePage(userId: string, workspaceId: string, input: IssuePageLinkInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const [issue, page] = await Promise.all([
    prisma.issue.findFirst({ where: { id: input.issueId, workspaceId, deletedAt: null } }),
    prisma.page.findFirst({ where: { id: input.pageId, workspaceId, deletedAt: null } }),
  ]);
  if (!issue || !page) throw new AppError("NOT_FOUND", "Issue or page not found");
  await requireCan(userId, "edit", { type: "issue", workspaceId, issueId: issue.id });
  const link = await prisma.issuePageLink.upsert({
    where: { issueId_pageId: { issueId: issue.id, pageId: page.id } },
    create: { issueId: issue.id, pageId: page.id },
    update: {},
    include: { issue: { include: { project: true } }, page: { include: { space: true } } },
  });
  await prisma.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issue.id, action: "linked_page", payload: { pageId: page.id } } });
  return link;
}

export async function unlinkIssuePage(userId: string, workspaceId: string, input: IssuePageLinkInput) {
  await requireCan(userId, "edit", { type: "workspace", workspaceId });
  await prisma.issuePageLink.deleteMany({ where: { issueId: input.issueId, pageId: input.pageId, issue: { workspaceId }, page: { workspaceId } } });
}

export async function listIssuePageLinks(userId: string, workspaceId: string, issueId?: string, pageId?: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return prisma.issuePageLink.findMany({
    where: { ...(issueId ? { issueId } : {}), ...(pageId ? { pageId } : {}), issue: { workspaceId, deletedAt: null }, page: { workspaceId, deletedAt: null } },
    orderBy: { id: "asc" },
    include: { issue: { include: { project: true } }, page: { include: { space: true } } },
  });
}

export async function createIssueLink(userId: string, workspaceId: string, input: IssueLinkInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  if (input.sourceIssueId === input.targetIssueId) throw new AppError("VALIDATION", "Issue cannot link to itself");
  const [source, target] = await Promise.all([
    prisma.issue.findFirst({ where: { id: input.sourceIssueId, workspaceId, deletedAt: null } }),
    prisma.issue.findFirst({ where: { id: input.targetIssueId, workspaceId, deletedAt: null } }),
  ]);
  if (!source || !target) throw new AppError("NOT_FOUND", "Issue not found");
  const link = await prisma.issueLink.upsert({
    where: { sourceIssueId_targetIssueId_linkType: { sourceIssueId: input.sourceIssueId, targetIssueId: input.targetIssueId, linkType: input.linkType } },
    create: input,
    update: {},
    include: { source: { include: { project: true } }, target: { include: { project: true } } },
  });
  await prisma.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: source.id, action: "linked_issue", payload: { targetIssueId: target.id, linkType: input.linkType } } });
  return link;
}

export async function listIssueLinks(userId: string, workspaceId: string, issueId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return prisma.issueLink.findMany({
    where: { OR: [{ sourceIssueId: issueId }, { targetIssueId: issueId }], source: { workspaceId, deletedAt: null }, target: { workspaceId, deletedAt: null } },
    include: { source: { include: { project: true } }, target: { include: { project: true } } },
  });
}

export async function setCustomFieldDefinition(userId: string, workspaceId: string, projectId: string, input: unknown) {
  await requireCan(userId, "admin", { type: "project", workspaceId, projectId });
  const def = customFieldDefinitionSchema.parse(input);
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw new AppError("NOT_FOUND", "Project not found");
  const description = project.description ?? "";
  const current = description.startsWith("__customFields:") ? JSON.parse(description.slice("__customFields:".length)) : { description, fields: [] };
  const fields = [...(current.fields ?? []).filter((f: { key: string }) => f.key !== def.key), def];
  return prisma.project.update({ where: { id: projectId }, data: { description: `__customFields:${JSON.stringify({ description: current.description ?? description, fields })}` } });
}

export async function setIssueCustomField(userId: string, workspaceId: string, issueId: string, input: unknown) {
  const parsed = issueCustomFieldValueSchema.parse(input);
  await requireCan(userId, "edit", { type: "issue", workspaceId, issueId });
  const issue = await prisma.issue.findFirst({ where: { id: issueId, workspaceId, deletedAt: null } });
  if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
  const customFields = { ...((issue.customFields as Record<string, unknown>) ?? {}), [parsed.key]: parsed.value };
  return prisma.issue.update({ where: { id: issueId }, data: { customFields: customFields as Prisma.InputJsonValue } });
}
