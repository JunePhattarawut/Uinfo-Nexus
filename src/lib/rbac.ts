// Server-side RBAC helpers — always runs in Node.js (never Edge).
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { can, type Permission, type WorkspaceRole } from "@/lib/permissions";

export type RbacContext = {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string };
  role: WorkspaceRole;
};

/** Fetch the workspace role for a user. Returns null if no membership. */
export async function getUserRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  return (m?.role ?? null) as WorkspaceRole | null;
}

/**
 * Resolves the current user + active workspace + role.
 * Use this in server components / pages to check permissions.
 * Does NOT throw on missing permission — caller checks `can(role, permission)`.
 */
export async function getRbacContext(): Promise<RbacContext & { role: WorkspaceRole | null }> {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) redirect("/");
  const role = await getUserRole(user.id, active.id);
  return { user, workspace: active, role } as RbacContext & { role: WorkspaceRole | null };
}

/**
 * Server-action guard — returns the RBAC context or null if the user lacks permission.
 * Use at the top of every "use server" action that mutates data.
 *
 * ```ts
 * const ctx = await actionGuard("issue:create");
 * if (!ctx) return;  // silently reject — permission denied
 * ```
 */
export async function actionGuard(permission: Permission): Promise<RbacContext | null> {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return null;
  const role = await getUserRole(user.id, active.id);
  if (!can(role, permission)) return null;
  return { user, workspace: active, role: role as WorkspaceRole };
}

/**
 * Page-level guard — redirects to /403 if the user lacks permission.
 * Use in server components (pages/layouts) that require a specific permission.
 */
export async function requirePermission(permission: Permission): Promise<RbacContext> {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) redirect("/");
  const role = await getUserRole(user.id, active.id);
  if (!can(role, permission)) redirect("/403");
  return { user, workspace: active, role: role as WorkspaceRole };
}
