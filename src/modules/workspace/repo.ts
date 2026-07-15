// Repo layer: the ONLY place that touches Prisma for workspace data (HANDOFF §6).
// Every function is scoped by userId membership and/or workspaceId — no exceptions.
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export function listWorkspacesForUser(userId: string) {
  return prisma.workspace.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { projects: true, spaces: true, memberships: true } } },
  });
}

export function findWorkspaceForUser(userId: string, workspaceId: string) {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, memberships: { some: { userId } } },
    include: { _count: { select: { projects: true, spaces: true, memberships: true } } },
  });
}

export function createWorkspaceWithOwner(userId: string, name: string, slug: string) {
  return prisma.workspace.create({
    data: {
      name,
      slug,
      memberships: { create: { userId, role: "OWNER" } },
    },
  });
}

export function listMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
  return prisma.membership.create({ data: { workspaceId, userId, role } });
}

export function findMember(workspaceId: string, userId: string) {
  return prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  return prisma.membership.update({
    where: { userId_workspaceId: { userId, workspaceId } },
    data: { role },
  });
}

export function removeMember(workspaceId: string, userId: string) {
  return prisma.membership.delete({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export function countOwners(workspaceId: string) {
  return prisma.membership.count({ where: { workspaceId, role: "OWNER" } });
}
