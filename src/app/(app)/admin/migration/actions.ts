"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGuard } from "@/lib/rbac";
import * as migration from "@/modules/migration/jira";

const dryRunSchema = z.object({
  sourceUrl: z.string().url(),
  projectKeys: z.string().optional().default(""),
  issueLimit: z.coerce.number().int().min(1).max(1000).default(100),
});

async function ctx() {
  const rbac = await actionGuard("admin:access");
  if (!rbac) return null;
  return { user: rbac.user, workspaceId: rbac.workspace.id };
}

export async function createJiraDryRunAction(formData: FormData) {
  const c = await ctx();
  if (!c) return;
  const parsed = dryRunSchema.parse({
    sourceUrl: String(formData.get("sourceUrl") || ""),
    projectKeys: String(formData.get("projectKeys") || ""),
    issueLimit: formData.get("issueLimit") || 100,
  });
  await migration.createDryRunJob(c.user.id, c.workspaceId, {
    sourceUrl: parsed.sourceUrl,
    projectKeys: parsed.projectKeys.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
    issueLimit: parsed.issueLimit,
  });
  revalidatePath("/admin/migration");
}
