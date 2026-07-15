import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type Resource = { type: "workspace"; workspaceId: string } | { type: "project"; workspaceId: string; projectId: string } | { type: "space"; workspaceId: string; spaceId: string } | { type: "page"; workspaceId: string; pageId: string } | { type: "issue"; workspaceId: string; issueId: string };
type Action = "read" | "create" | "edit" | "delete" | "admin" | "export";

const rank: Record<WorkspaceRole, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 };
const minRole: Record<Action, WorkspaceRole> = { read: "VIEWER", create: "MEMBER", edit: "MEMBER", delete: "ADMIN", admin: "ADMIN", export: "ADMIN" };

export async function membershipRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, select: { role: true } });
  return (membership?.role as WorkspaceRole | undefined) ?? null;
}

export async function can(userId: string, action: Action, resource: Resource): Promise<boolean> {
  const role = await membershipRole(userId, resource.workspaceId);
  if (!role) return false;
  if (action === "read") return true;
  if (rank[role] >= rank[minRole[action]]) return true;
  if (resource.type === "project" && (action === "edit" || action === "create")) {
    const pm = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: resource.projectId, userId } } });
    return Boolean(pm);
  }
  return false;
}

export async function requireCan(userId: string, action: Action, resource: Resource) {
  if (!(await can(userId, action, resource))) throw new AppError(action === "read" ? "NOT_FOUND" : "FORBIDDEN", "Permission denied");
}

export async function batchCanWorkspace(userId: string, action: Action, workspaceId: string, resourceIds: string[]) {
  const allowed = await can(userId, action, { type: "workspace", workspaceId });
  return new Map(resourceIds.map((id) => [id, allowed]));
}
