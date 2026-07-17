"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";

export async function markAllReadAction() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return;
  await prisma.notification.updateMany({
    where: { userId: user.id, workspaceId: active.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markOneReadAction(notificationId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
