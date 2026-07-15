import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

export const issueInclude = {
  project: { select: { id: true, key: true, name: true } },
  status: { select: { id: true, name: true, category: true, position: true } },
  assignee: { select: { id: true, name: true, email: true } },
  reporter: { select: { id: true, name: true, email: true } },
  labels: { include: { label: true } },
  pageLinks: { include: { page: { include: { space: { select: { key: true, name: true } } } } } },
  attachments: { orderBy: { createdAt: "desc" } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.IssueInclude;

export function listProjects(workspaceId: string) {
  return prisma.project.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
}

export function getProject(workspaceId: string, projectId: string, db: Db = prisma) {
  return db.project.findFirst({
    where: { id: projectId, workspaceId },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
}

export function getProjectByKey(workspaceId: string, key: string, db: Db = prisma) {
  return db.project.findFirst({
    where: { workspaceId, key: key.toUpperCase() },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
}

export function listWorkspaceMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId },
    orderBy: { user: { name: "asc" } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export function listLabels(workspaceId: string) {
  return prisma.label.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export function listIssues(workspaceId: string, filters: {
  projectKey?: string;
  statusId?: string;
  type?: Prisma.EnumIssueTypeFilter<"Issue"> | string;
  assigneeId?: string;
  label?: string;
} = {}) {
  return prisma.issue.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      ...(filters.projectKey ? { project: { key: filters.projectKey.toUpperCase() } } : {}),
      ...(filters.statusId ? { statusId: filters.statusId } : {}),
      ...(filters.type ? { type: filters.type as Prisma.EnumIssueTypeFilter<"Issue"> } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.label ? { labels: { some: { label: { name: filters.label } } } } : {}),
    },
    orderBy: [{ project: { key: "asc" } }, { status: { position: "asc" } }, { rank: "asc" }],
    include: issueInclude,
  });
}

export function findIssueByKey(workspaceId: string, projectKey: string, number: number) {
  return prisma.issue.findFirst({
    where: { workspaceId, project: { key: projectKey.toUpperCase() }, number, deletedAt: null },
    include: { ...issueInclude, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } } },
  });
}

export function findIssueById(workspaceId: string, issueId: string, db: Db = prisma) {
  return db.issue.findFirst({ where: { workspaceId, id: issueId, deletedAt: null }, include: issueInclude });
}

export function listStatusIssues(workspaceId: string, statusId: string, db: Db = prisma) {
  return db.issue.findMany({
    where: { workspaceId, statusId, deletedAt: null },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true },
  });
}

export function listActivity(issueId: string) {
  return prisma.activityLog.findMany({
    where: { entityType: "issue", entityId: issueId },
    orderBy: { createdAt: "desc" },
  });
}
