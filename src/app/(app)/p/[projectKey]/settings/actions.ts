"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as adv from "@/modules/advanced/service";
import { savedFilterSchema, statusSchema } from "@/modules/advanced/schemas";

async function ctx(projectKey: string) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) throw new Error("No active workspace");
  const project = await prisma.project.findFirstOrThrow({ where: { workspaceId: active.id, key: projectKey.toUpperCase() } });
  return { user, workspaceId: active.id, project };
}

export async function createStatusAction(projectKey: string, formData: FormData) {
  const { user, workspaceId, project } = await ctx(projectKey);
  await adv.createStatus(user.id, workspaceId, project.id, statusSchema.parse({ name: String(formData.get("name") || ""), category: String(formData.get("category") || "TODO") }));
  revalidatePath(`/p/${projectKey}/settings`);
}

export async function createSavedFilterAction(projectKey: string, formData: FormData) {
  const { user, workspaceId, project } = await ctx(projectKey);
  await adv.createSavedFilter(user.id, workspaceId, savedFilterSchema.parse({
    projectId: project.id,
    name: String(formData.get("name") || ""),
    scope: String(formData.get("scope") || "PRIVATE"),
    filters: {
      statusId: String(formData.get("statusId") || "") || undefined,
      type: String(formData.get("type") || "") || undefined,
      showJira: String(formData.get("showJira") || "") || undefined,
    },
  }));
  revalidatePath(`/p/${projectKey}/settings`);
  revalidatePath(`/p/${projectKey}/issues`);
}
