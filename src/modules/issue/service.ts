import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { rankAfter, rankBetween } from "@/lib/rank";
import { requireMembership } from "@/lib/tenancy";
import { enqueueNotification } from "@/lib/queue";
import { runIssueStatusAutomations } from "@/modules/advanced/service";
import * as repo from "./repo";
import type { CreateCommentInput, CreateIssueInput, IssueFilters, MoveIssueInput, UpdateIssueInput, AddReferenceInput } from "./schemas";
import { tiptapDoc } from "./schemas";

function parseIssueKey(issueKey: string) {
  const m = /^([A-Z][A-Z0-9]*)-(\d+)$/.exec(issueKey.toUpperCase());
  if (!m) throw new AppError("NOT_FOUND", "Issue not found");
  return { projectKey: m[1], number: Number(m[2]) };
}

function textFromDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.text === "string") parts.push(rec.text);
    if (Array.isArray(rec.content)) rec.content.forEach(walk);
  };
  walk(doc);
  return parts.join(" ");
}

export function issueDisplayKey(issue: { project: { key: string }; number: number }) {
  return `${issue.project.key}-${issue.number}`;
}

export function issueDescriptionText(issue: { description: unknown }) {
  return textFromDoc(issue.description);
}

export async function listProjects(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return repo.listProjects(workspaceId);
}

export async function getIssueContext(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  const [projects, members, labels] = await Promise.all([
    repo.listProjects(workspaceId),
    repo.listWorkspaceMembers(workspaceId),
    repo.listLabels(workspaceId),
  ]);
  return { projects, members, labels };
}

export async function listIssues(userId: string, workspaceId: string, filters: IssueFilters = {}) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return repo.listIssues(workspaceId, filters);
}

export async function getIssueByKey(userId: string, workspaceId: string, issueKey: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  const parsed = parseIssueKey(issueKey);
  const issue = await repo.findIssueByKey(workspaceId, parsed.projectKey, parsed.number);
  if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
  const activity = await repo.listActivity(issue.id);
  return { issue, activity };
}

async function syncLabels(tx: Prisma.TransactionClient, workspaceId: string, issueId: string, names: string[]) {
  await tx.issueLabel.deleteMany({ where: { issueId } });
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const name of unique) {
    const label = await tx.label.upsert({
      where: { workspaceId_name: { workspaceId, name } },
      update: {},
      create: { workspaceId, name },
    });
    await tx.issueLabel.create({ data: { issueId, labelId: label.id } });
  }
}

export async function createIssue(userId: string, workspaceId: string, input: CreateIssueInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const project = await repo.getProject(workspaceId, input.projectId, tx);
    if (!project) throw new AppError("NOT_FOUND", "Project not found");
    const statusId = input.statusId ?? project.statuses[0]?.id;
    if (!statusId || !project.statuses.some((s) => s.id === statusId)) {
      throw new AppError("VALIDATION", "Status is not part of this project");
    }
    if (input.assigneeId) {
      const member = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: input.assigneeId, workspaceId } } });
      if (!member) throw new AppError("VALIDATION", "Assignee is not a workspace member");
    }

    const updated = await tx.project.update({
      where: { id: project.id },
      data: { issueCounter: { increment: 1 } },
      select: { issueCounter: true },
    });
    const maxIssue = await tx.issue.aggregate({ where: { projectId: project.id }, _max: { number: true } });
    const last = await tx.issue.findFirst({
      where: { workspaceId, projectId: project.id, statusId, deletedAt: null },
      orderBy: { rank: "desc" },
      select: { rank: true },
    });
    const nextNumber = Math.max(updated.issueCounter, (maxIssue._max.number ?? 0) + 1);
    if (nextNumber !== updated.issueCounter) {
      await tx.project.update({ where: { id: project.id }, data: { issueCounter: nextNumber } });
    }
    const issue = await tx.issue.create({
      data: {
        workspaceId,
        projectId: project.id,
        number: nextNumber,
        type: input.type,
        title: input.title,
        description: tiptapDoc(input.descriptionText),
        statusId,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        reporterId: userId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        storyPoints: input.storyPoints ?? null,
        rank: rankAfter(last?.rank ?? null),
      },
      include: repo.issueInclude,
    });
    await syncLabels(tx, workspaceId, issue.id, input.labels);
    await tx.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issue.id, action: "created", payload: { key: `${project.key}-${issue.number}`, title: issue.title } } });
    const created = await tx.issue.findUniqueOrThrow({ where: { id: issue.id }, include: repo.issueInclude });
    if (created.assigneeId && created.assigneeId !== userId) {
      await enqueueNotification({ workspaceId, userId: created.assigneeId, type: "assigned", payload: { issueId: created.id, key: `${project.key}-${created.number}`, title: created.title } });
    }
    return created;
  });
}


function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  return String(value);
}

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "None";
  return new Date(value).toISOString().slice(0, 10);
}

function labelNames(issue: { labels: { label: { name: string } }[] }) {
  return issue.labels.map((x) => x.label.name).sort().join(", ") || "None";
}

function addChange(changes: Array<{ field: string; from: string; to: string }>, field: string, from: unknown, to: unknown) {
  const before = valueLabel(from);
  const after = valueLabel(to);
  if (before !== after) changes.push({ field, from: before, to: after });
}

export async function updateIssue(userId: string, workspaceId: string, issueId: string, input: UpdateIssueInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const existing = await repo.findIssueById(workspaceId, issueId, tx);
    if (!existing) throw new AppError("NOT_FOUND", "Issue not found");
    if (input.statusId) {
      const status = await tx.status.findFirst({ where: { id: input.statusId, projectId: existing.projectId } });
      if (!status) throw new AppError("VALIDATION", "Status is not part of this project");
    }
    if (input.assigneeId) {
      const member = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: input.assigneeId, workspaceId } } });
      if (!member) throw new AppError("VALIDATION", "Assignee is not a workspace member");
    }
    const data: Prisma.IssueUpdateInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.descriptionText !== undefined ? { description: tiptapDoc(input.descriptionText) } : {}),
      ...(input.statusId ? { status: { connect: { id: input.statusId } } } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assignee: input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true } } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
    };
    const updated = await tx.issue.update({ where: { id: issueId }, data, include: repo.issueInclude });
    if (input.labels) await syncLabels(tx, workspaceId, issueId, input.labels);
    const finalIssue = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, include: repo.issueInclude });
    const changes: Array<{ field: string; from: string; to: string }> = [];
    if (input.title !== undefined) addChange(changes, "Title", existing.title, finalIssue.title);
    if (input.type !== undefined) addChange(changes, "Issue type", existing.type, finalIssue.type);
    if (input.descriptionText !== undefined) addChange(changes, "Description", issueDescriptionText(existing) || "None", issueDescriptionText(finalIssue) || "None");
    if (input.statusId !== undefined) addChange(changes, "Status", existing.status.name, finalIssue.status.name);
    if (input.priority !== undefined) addChange(changes, "Priority", existing.priority, finalIssue.priority);
    if (input.assigneeId !== undefined) addChange(changes, "Assignee", existing.assignee?.name ?? "None", finalIssue.assignee?.name ?? "None");
    if (input.dueDate !== undefined) addChange(changes, "Due date", dateLabel(existing.dueDate), dateLabel(finalIssue.dueDate));
    if (input.storyPoints !== undefined) addChange(changes, "Story points", existing.storyPoints ?? "None", finalIssue.storyPoints ?? "None");
    if (input.labels) addChange(changes, "Labels", labelNames(existing), labelNames(finalIssue));
    if (changes.length > 0) {
      await tx.activityLog.create({
        data: {
          workspaceId,
          actorId: userId,
          entityType: "issue",
          entityId: issueId,
          action: input.statusId && input.statusId !== existing.statusId ? "status_changed" : "updated",
          payload: { beforeStatusId: existing.statusId, afterStatusId: finalIssue.statusId, changes },
        },
      });
    }
    if (input.assigneeId && input.assigneeId !== existing.assigneeId && input.assigneeId !== userId) {
      await enqueueNotification({ workspaceId, userId: input.assigneeId, type: "assigned", payload: { issueId, key: issueDisplayKey(finalIssue), title: finalIssue.title } });
    }
    if (input.statusId && input.statusId !== existing.statusId) {
      await runIssueStatusAutomations(workspaceId, userId, issueId, finalIssue.status.category);
    }
    return finalIssue;
  });
}

export async function moveIssue(userId: string, workspaceId: string, issueId: string, input: MoveIssueInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const issue = await repo.findIssueById(workspaceId, issueId, tx);
    if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
    const status = await tx.status.findFirst({ where: { id: input.statusId, projectId: issue.projectId } });
    if (!status) throw new AppError("VALIDATION", "Status is not part of this project");
    const before = input.beforeIssueId ? await tx.issue.findFirst({ where: { id: input.beforeIssueId, workspaceId, statusId: input.statusId }, select: { rank: true } }) : null;
    const after = input.afterIssueId ? await tx.issue.findFirst({ where: { id: input.afterIssueId, workspaceId, statusId: input.statusId }, select: { rank: true } }) : null;
    const rank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    const updated = await tx.issue.update({ where: { id: issueId }, data: { statusId: input.statusId, rank }, include: repo.issueInclude });
    await tx.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issueId, action: issue.statusId === input.statusId ? "updated" : "status_changed", payload: { beforeStatusId: issue.statusId, afterStatusId: input.statusId, changes: [{ field: "Status", from: issue.status.name, to: updated.status.name }], rank } } });
    if (issue.statusId !== input.statusId) {
      await runIssueStatusAutomations(workspaceId, userId, issueId, updated.status.category);
    }
    return updated;
  });
}

export async function addComment(userId: string, workspaceId: string, issueId: string, input: CreateCommentInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const issue = await repo.findIssueById(workspaceId, issueId, tx);
    if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
    const comment = await tx.comment.create({
      data: { issueId, authorId: userId, body: tiptapDoc(input.bodyText) },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    await tx.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issueId, action: "commented", payload: { commentId: comment.id, bodyText: input.bodyText.slice(0, 200) } } });
    const members = await tx.membership.findMany({ where: { workspaceId }, include: { user: true } });
    for (const member of members) {
      if (member.userId === userId) continue;
      const mentionName = `@${member.user.name.split(" ")[0]}`.toLowerCase();
      const mentionEmail = `@${member.user.email}`.toLowerCase();
      const text = input.bodyText.toLowerCase();
      if (text.includes(mentionName) || text.includes(mentionEmail)) {
        await enqueueNotification({ workspaceId, userId: member.userId, type: "mentioned", payload: { issueId, key: issueDisplayKey(issue), commentId: comment.id } });
      }
    }
    return comment;
  });
}

type IssueReference = {
  id: string;
  type: "link";
  title: string;
  url: string;
  source: string;
  note?: string;
  createdAt: string;
  createdBy: string;
};

function referencesFromCustomFields(customFields: unknown): IssueReference[] {
  if (!customFields || typeof customFields !== "object") return [];
  const value = (customFields as Record<string, unknown>).references;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is IssueReference => Boolean(item && typeof item === "object" && (item as Record<string, unknown>).type === "link"));
}

export function issueExternalReferences(issue: { customFields: unknown }) {
  return referencesFromCustomFields(issue.customFields);
}

export async function addExternalReference(userId: string, workspaceId: string, issueId: string, input: AddReferenceInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const issue = await repo.findIssueById(workspaceId, issueId, tx);
    if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
    const current = issue.customFields && typeof issue.customFields === "object" ? { ...(issue.customFields as Record<string, unknown>) } : {};
    const references = referencesFromCustomFields(current);
    const reference: IssueReference = {
      id: crypto.randomUUID(),
      type: "link",
      title: input.title,
      url: input.url,
      source: input.source || "External link",
      note: input.note || undefined,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    };
    current.references = [reference, ...references];
    const updated = await tx.issue.update({ where: { id: issueId }, data: { customFields: current as Prisma.InputJsonValue }, include: repo.issueInclude });
    await tx.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issueId, action: "reference_added", payload: reference as unknown as Prisma.InputJsonValue } });
    return updated;
  });
}

export async function linkPageReference(userId: string, workspaceId: string, issueId: string, pageId: string) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const [issue, page] = await Promise.all([
      repo.findIssueById(workspaceId, issueId, tx),
      tx.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null }, include: { space: true } }),
    ]);
    if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
    if (!page) throw new AppError("NOT_FOUND", "Page not found");
    await tx.issuePageLink.upsert({ where: { issueId_pageId: { issueId, pageId } }, update: {}, create: { issueId, pageId } });
    await tx.activityLog.create({ data: { workspaceId, actorId: userId, entityType: "issue", entityId: issueId, action: "page_reference_added", payload: { pageId, title: page.title, space: page.space.key } } });
    return page;
  });
}
