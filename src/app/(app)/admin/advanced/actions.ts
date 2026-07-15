"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as adv from "@/modules/advanced/service";
import { automationSchema, statusSchema, webhookSchema } from "@/modules/advanced/schemas";

async function ctx() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) throw new Error("No active workspace");
  return { user, workspaceId: active.id };
}

function statusInput(formData: FormData) {
  return statusSchema.parse({ name: String(formData.get("name") || ""), category: String(formData.get("category") || "TODO") });
}

export async function createStatusAction(formData: FormData) {
  const { user, workspaceId } = await ctx();
  await adv.createStatus(user.id, workspaceId, String(formData.get("projectId") || ""), statusInput(formData));
  revalidatePath("/admin/advanced");
}

export async function updateStatusAction(formData: FormData) {
  const { user, workspaceId } = await ctx();
  await adv.updateStatus(user.id, workspaceId, String(formData.get("projectId") || ""), String(formData.get("statusId") || ""), statusInput(formData));
  revalidatePath("/admin/advanced");
}

export async function createWebhookAction(formData: FormData) {
  const { user, workspaceId } = await ctx();
  await adv.createWebhook(user.id, workspaceId, webhookSchema.parse({
    name: String(formData.get("name") || ""),
    url: String(formData.get("url") || ""),
    events: String(formData.get("events") || "issue.updated").split(",").map((s) => s.trim()).filter(Boolean),
    secret: String(formData.get("secret") || "") || null,
  }));
  revalidatePath("/admin/advanced");
}

export async function createAutomationAction(formData: FormData) {
  const { user, workspaceId } = await ctx();
  await adv.createAutomation(user.id, workspaceId, automationSchema.parse({ name: String(formData.get("name") || ""), trigger: "issue.status.done", action: "notify.reporter", enabled: true }));
  revalidatePath("/admin/advanced");
}

export async function deliverPendingWebhooksAction() {
  const { user, workspaceId } = await ctx();
  await adv.deliverPendingWebhooks(user.id, workspaceId);
  revalidatePath("/admin/advanced");
}

export async function rebuildSearchIndexAction() {
  const { user, workspaceId } = await ctx();
  await adv.rebuildSearchIndex(user.id, workspaceId);
  revalidatePath("/admin/advanced");
}
