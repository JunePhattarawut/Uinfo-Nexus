"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("members:invite");
  if (!ctx) return;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawRole = String(formData.get("role") ?? "MEMBER");
  // Only OWNER may assign the OWNER role
  const role = (rawRole === "OWNER" && ctx.role !== "OWNER" ? "MEMBER" : rawRole) as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  if (!email) return;

  let invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) {
    const tempPassword = Math.random().toString(36).slice(2, 10);
    invitee = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0] ?? email,
        passwordHash: await hashPassword(tempPassword),
      },
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: invitee.id, workspaceId: ctx.workspace.id } },
  });
  if (existing) return;

  await prisma.membership.create({
    data: { userId: invitee.id, workspaceId: ctx.workspace.id, role },
  });
  revalidatePath("/settings/members");
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("members:changeRole");
  if (!ctx) return;

  const memberId = String(formData.get("memberId") ?? "");
  const rawRole = String(formData.get("role") ?? "");
  // Only OWNER may assign the OWNER role
  const role = (rawRole === "OWNER" && ctx.role !== "OWNER" ? "MEMBER" : rawRole) as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  if (!role) return;

  // Prevent demoting the last OWNER
  if (rawRole !== "OWNER") {
    const target = await prisma.membership.findUnique({ where: { id: memberId } });
    if (target?.role === "OWNER") {
      const ownerCount = await prisma.membership.count({
        where: { workspaceId: ctx.workspace.id, role: "OWNER" },
      });
      if (ownerCount <= 1) return; // cannot demote the only owner
    }
  }

  await prisma.membership.update({ where: { id: memberId }, data: { role } });
  revalidatePath("/settings/members");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("members:remove");
  if (!ctx) return;

  const memberId = String(formData.get("memberId") ?? "");
  const membership = await prisma.membership.findUnique({ where: { id: memberId } });
  if (!membership || membership.userId === ctx.user.id) return;
  // Only OWNER can remove another OWNER; ADMIN cannot
  if (membership.role === "OWNER" && ctx.role !== "OWNER") return;
  // Prevent removing the last OWNER
  if (membership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: { workspaceId: ctx.workspace.id, role: "OWNER" },
    });
    if (ownerCount <= 1) return;
  }

  await prisma.membership.delete({ where: { id: memberId } });
  revalidatePath("/settings/members");
}
