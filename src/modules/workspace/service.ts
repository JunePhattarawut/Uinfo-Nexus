import { AppError } from "@/lib/errors";
import { requireMembership } from "@/lib/tenancy";
import * as repo from "./repo";
import type { AddMemberInput, CreateWorkspaceInput, UpdateMemberRoleInput } from "./schemas";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listMyWorkspaces(userId: string) {
  return repo.listWorkspacesForUser(userId);
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const ws = await repo.findWorkspaceForUser(userId, workspaceId);
  if (!ws) throw new AppError("NOT_FOUND", "Workspace not found");
  return ws;
}

export function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  return repo.createWorkspaceWithOwner(userId, input.name, slugify(input.name));
}

export async function listMembers(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return repo.listMembers(workspaceId);
}

export async function addMember(userId: string, workspaceId: string, input: AddMemberInput) {
  await requireMembership(userId, workspaceId, "ADMIN");

  const target = await repo.findUserByEmail(input.email);
  if (!target) throw new AppError("NOT_FOUND", "No user with that email");

  const existing = await repo.findMember(workspaceId, target.id);
  if (existing) throw new AppError("CONFLICT", "User is already a member");

  return repo.addMember(workspaceId, target.id, input.role);
}

export async function updateMemberRole(
  actorId: string,
  workspaceId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput,
) {
  await requireMembership(actorId, workspaceId, "ADMIN");

  const target = await repo.findMember(workspaceId, targetUserId);
  if (!target) throw new AppError("NOT_FOUND", "Member not found");

  // Never leave a workspace without an OWNER.
  if (target.role === "OWNER" && input.role !== "OWNER") {
    const owners = await repo.countOwners(workspaceId);
    if (owners <= 1) throw new AppError("CONFLICT", "Workspace must keep at least one owner");
  }

  return repo.updateMemberRole(workspaceId, targetUserId, input.role);
}

export async function removeMember(actorId: string, workspaceId: string, targetUserId: string) {
  // Members may remove themselves (leave); otherwise ADMIN+ required.
  if (actorId !== targetUserId) {
    await requireMembership(actorId, workspaceId, "ADMIN");
  } else {
    await requireMembership(actorId, workspaceId, "VIEWER");
  }

  const target = await repo.findMember(workspaceId, targetUserId);
  if (!target) throw new AppError("NOT_FOUND", "Member not found");

  if (target.role === "OWNER") {
    const owners = await repo.countOwners(workspaceId);
    if (owners <= 1) throw new AppError("CONFLICT", "Workspace must keep at least one owner");
  }

  return repo.removeMember(workspaceId, targetUserId);
}
