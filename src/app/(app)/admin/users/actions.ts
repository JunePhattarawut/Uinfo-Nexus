"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";

/** Grant workspace access to a user that has no membership yet. */
export async function grantAccessAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("admin:users");
  if (!ctx) return;
  const userId = String(formData.get("userId") ?? "");
  const role = (String(formData.get("role") ?? "MEMBER")) as "ADMIN" | "MEMBER" | "VIEWER";
  if (!userId) return;

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId, workspaceId: ctx.workspace.id } },
    update: { role },
    create: { userId, workspaceId: ctx.workspace.id, role },
  });
  revalidatePath("/admin/users");
}

/** Change the workspace role of an existing member. */
export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("admin:users");
  if (!ctx) return;
  const targetUserId = String(formData.get("userId") ?? "");
  const role = (String(formData.get("role") ?? "MEMBER")) as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  if (!targetUserId || targetUserId === ctx.user.id) return; // cannot change own role

  await prisma.membership.update({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId: ctx.workspace.id } },
    data: { role },
  });
  revalidatePath("/admin/users");
}

/** Revoke workspace access (delete membership) without deleting the user. */
export async function revokeAccessAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("admin:users");
  if (!ctx) return;
  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId || targetUserId === ctx.user.id) return;

  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId: ctx.workspace.id } },
  });
  if (!m || m.role === "OWNER") return; // never revoke an OWNER
  await prisma.membership.delete({ where: { id: m.id } });
  revalidatePath("/admin/users");
}

/** Permanently delete a user account (cannot delete OWNER or self). */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("admin:users");
  if (!ctx) return;
  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId || targetUserId === ctx.user.id) return;

  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId: ctx.workspace.id } },
  });
  if (m?.role === "OWNER") return; // never delete an OWNER

  await prisma.user.delete({ where: { id: targetUserId } });
  revalidatePath("/admin/users");
}
