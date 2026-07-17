"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import * as adv from "@/modules/advanced/service";
import { savedFilterSchema, statusSchema } from "@/modules/advanced/schemas";

async function ctx(projectKey: string) {
  const rbac = await actionGuard("project:edit");
  if (!rbac) return null;
  const project = await prisma.project.findFirstOrThrow({ where: { workspaceId: rbac.workspace.id, key: projectKey.toUpperCase() } });
  return { user: rbac.user, workspaceId: rbac.workspace.id, project };
}

export async function createStatusAction(projectKey: string, formData: FormData) {
  const c = await ctx(projectKey);
  if (!c) return;
  await adv.createStatus(c.user.id, c.workspaceId, c.project.id, statusSchema.parse({ name: String(formData.get("name") || ""), category: String(formData.get("category") || "TODO") }));
  revalidatePath(`/p/${projectKey}/settings`);
}

export async function createSavedFilterAction(projectKey: string, formData: FormData) {
  const c = await ctx(projectKey);
  if (!c) return;
  await adv.createSavedFilter(c.user.id, c.workspaceId, savedFilterSchema.parse({
    projectId: c.project.id,
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
