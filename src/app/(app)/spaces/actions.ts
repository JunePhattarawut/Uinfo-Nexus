"use server";

import { redirect } from "next/navigation";
import { actionGuard } from "@/lib/rbac";
import * as codex from "@/modules/codex/service";
import { createSpaceSchema } from "@/modules/codex/schemas";

export async function createSpaceAction(formData: FormData) {
  const ctx = await actionGuard("space:create");
  if (!ctx) return;
  const space = await codex.createSpace(ctx.user.id, ctx.workspace.id, createSpaceSchema.parse({
    key: String(formData.get("key") || ""),
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    iconEmoji: String(formData.get("iconEmoji") || "📄"),
  }));
  redirect(`/s/${space.key}`);
}
