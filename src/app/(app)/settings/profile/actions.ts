"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/settings/profile");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8 || next !== confirm) return;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return;

  const valid = await bcrypt.compare(current, dbUser.passwordHash);
  if (!valid) return;

  const hash = await bcrypt.hash(next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  revalidatePath("/settings/profile");
}
