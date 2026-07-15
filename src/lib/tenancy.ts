import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/**
 * Tenancy guard (HANDOFF D5, M0 step 5).
 * Every service touching tenant data MUST resolve access through this.
 * Non-members get NOT_FOUND (never reveal that a workspace exists).
 */
export async function requireMembership(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = "VIEWER",
) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) {
    throw new AppError("NOT_FOUND", "Workspace not found");
  }
  if (ROLE_ORDER[membership.role] < ROLE_ORDER[minRole]) {
    throw new AppError("FORBIDDEN", "You don't have permission to do this");
  }
  return membership;
}

export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}
