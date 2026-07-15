"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as codex from "@/modules/codex/service";
import { createSpaceSchema } from "@/modules/codex/schemas";

export async function createSpaceAction(formData: FormData) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) throw new Error("No active workspace");
  const space = await codex.createSpace(user.id, active.id, createSpaceSchema.parse({
    key: String(formData.get("key") || ""),
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
  }));
  redirect(`/s/${space.key}`);
}
