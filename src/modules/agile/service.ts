import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { rankAfter, rankBetween } from "@/lib/rank";
import { requireMembership } from "@/lib/tenancy";
import type { CreateSprintInput, MoveToSprintInput, UpdateSprintInput } from "./schemas";

const issueInclude = {
  project: { select: { id: true, key: true, name: true } },
  status: { select: { id: true, name: true, category: true, position: true } },
  assignee: { select: { id: true, name: true, email: true } },
  reporter: { select: { id: true, name: true, email: true } },
  children: { select: { id: true, type: true, status: { select: { category: true } } } },
} satisfies Prisma.IssueInclude;

export function issueDisplayKey(issue: { project: { key: string }; number: number }) {
  return `${issue.project.key}-${issue.number}`;
}

export async function getAgileBoard(userId: string, workspaceId: string, projectKey: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  const project = await prisma.project.findFirst({
    where: { workspaceId, key: projectKey.toUpperCase() },
    include: { statuses: { orderBy: { position: "asc" } }, sprints: { orderBy: [{ state: "asc" }, { createdAt: "desc" }] } },
  });
  if (!project) throw new AppError("NOT_FOUND", "Project not found");
  const [backlog, sprintIssues, epics] = await Promise.all([
    prisma.issue.findMany({ where: { workspaceId, projectId: project.id, sprintId: null, deletedAt: null }, orderBy: { rank: "asc" }, include: issueInclude }),
    prisma.issue.findMany({ where: { workspaceId, projectId: project.id, sprintId: { not: null }, deletedAt: null }, orderBy: [{ sprintId: "asc" }, { rank: "asc" }], include: issueInclude }),
    prisma.issue.findMany({ where: { workspaceId, projectId: project.id, type: "EPIC", deletedAt: null }, include: issueInclude, orderBy: { rank: "asc" } }),
  ]);
  const sprintTotals = new Map<string, number>();
  for (const issue of sprintIssues) {
    if (issue.sprintId) sprintTotals.set(issue.sprintId, (sprintTotals.get(issue.sprintId) ?? 0) + (issue.storyPoints ?? 0));
  }
  const epicRollups = epics.map((epic) => ({
    epic,
    totalChildren: epic.children.length,
    doneChildren: epic.children.filter((c) => c.status.category === "DONE").length,
  }));
  return { project, backlog, sprintIssues, sprintTotals, epicRollups };
}

export async function createSprint(userId: string, workspaceId: string, input: CreateSprintInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const project = await prisma.project.findFirst({ where: { id: input.projectId, workspaceId } });
  if (!project) throw new AppError("NOT_FOUND", "Project not found");
  return prisma.sprint.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      goal: input.goal || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
}

export async function updateSprint(userId: string, workspaceId: string, sprintId: string, input: UpdateSprintInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, project: { workspaceId } } });
  if (!sprint) throw new AppError("NOT_FOUND", "Sprint not found");
  return prisma.sprint.update({
    where: { id: sprintId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.goal !== undefined ? { goal: input.goal || null } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
    },
  });
}

export async function startSprint(userId: string, workspaceId: string, sprintId: string) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const sprint = await tx.sprint.findFirst({ where: { id: sprintId, project: { workspaceId } }, include: { project: true } });
    if (!sprint) throw new AppError("NOT_FOUND", "Sprint not found");
    const active = await tx.sprint.findFirst({ where: { projectId: sprint.projectId, state: "ACTIVE", id: { not: sprintId } } });
    if (active) throw new AppError("CONFLICT", "Only one ACTIVE sprint per project");
    return tx.sprint.update({ where: { id: sprintId }, data: { state: "ACTIVE", startDate: sprint.startDate ?? new Date() } });
  });
}

export async function completeSprint(userId: string, workspaceId: string, sprintId: string) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const sprint = await tx.sprint.findFirst({ where: { id: sprintId, project: { workspaceId } }, include: { project: { include: { statuses: true } } } });
    if (!sprint) throw new AppError("NOT_FOUND", "Sprint not found");
    const incomplete = await tx.issue.findMany({
      where: { sprintId, deletedAt: null, status: { category: { not: "DONE" } } },
      orderBy: { rank: "asc" },
      select: { id: true },
    });
    let last = await tx.issue.findFirst({ where: { workspaceId, projectId: sprint.projectId, sprintId: null, deletedAt: null }, orderBy: { rank: "desc" }, select: { rank: true } });
    for (const issue of incomplete) {
      const rank = rankAfter(last?.rank ?? null);
      await tx.issue.update({ where: { id: issue.id }, data: { sprintId: null, rank } });
      last = { rank };
    }
    await tx.sprint.update({ where: { id: sprintId }, data: { state: "CLOSED", endDate: sprint.endDate ?? new Date() } });
    return { returnedToBacklog: incomplete.length };
  });
}

export async function moveIssueToSprint(userId: string, workspaceId: string, input: MoveToSprintInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const issue = await tx.issue.findFirst({ where: { id: input.issueId, workspaceId, deletedAt: null } });
    if (!issue) throw new AppError("NOT_FOUND", "Issue not found");
    if (input.sprintId) {
      const sprint = await tx.sprint.findFirst({ where: { id: input.sprintId, projectId: issue.projectId } });
      if (!sprint || sprint.state === "CLOSED") throw new AppError("VALIDATION", "Sprint is not available");
    }
    const before = input.beforeIssueId ? await tx.issue.findFirst({ where: { id: input.beforeIssueId, workspaceId, sprintId: input.sprintId }, select: { rank: true } }) : null;
    const after = input.afterIssueId ? await tx.issue.findFirst({ where: { id: input.afterIssueId, workspaceId, sprintId: input.sprintId }, select: { rank: true } }) : null;
    let rank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    if (!input.beforeIssueId && !input.afterIssueId) {
      const last = await tx.issue.findFirst({ where: { workspaceId, projectId: issue.projectId, sprintId: input.sprintId, deletedAt: null, id: { not: issue.id } }, orderBy: { rank: "desc" }, select: { rank: true } });
      rank = rankAfter(last?.rank ?? null);
    }
    return tx.issue.update({ where: { id: input.issueId }, data: { sprintId: input.sprintId, rank }, include: issueInclude });
  });
}
