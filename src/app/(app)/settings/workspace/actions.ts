"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function updateWorkspaceAction(formData: FormData): Promise<void> {
  const ctx = await actionGuard("workspace:edit");
  if (!ctx) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { name } });
  revalidatePath("/settings/workspace");
}
