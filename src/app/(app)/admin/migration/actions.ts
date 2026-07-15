"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as migration from "@/modules/migration/jira";

const dryRunSchema = z.object({
  sourceUrl: z.string().url(),
  projectKeys: z.string().optional().default(""),
  issueLimit: z.coerce.number().int().min(1).max(1000).default(100),
});

async function ctx() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) throw new Error("No active workspace");
  return { user, workspaceId: active.id };
}

export async function createJiraDryRunAction(formData: FormData) {
  const { user, workspaceId } = await ctx();
  const parsed = dryRunSchema.parse({
    sourceUrl: String(formData.get("sourceUrl") || ""),
    projectKeys: String(formData.get("projectKeys") || ""),
    issueLimit: formData.get("issueLimit") || 100,
  });
  await migration.createDryRunJob(user.id, workspaceId, {
    sourceUrl: parsed.sourceUrl,
    projectKeys: parsed.projectKeys.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
    issueLimit: parsed.issueLimit,
  });
  revalidatePath("/admin/migration");
}
