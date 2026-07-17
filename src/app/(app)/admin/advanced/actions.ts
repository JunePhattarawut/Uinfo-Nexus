"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import * as adv from "@/modules/advanced/service";
import { automationSchema, statusSchema, webhookSchema } from "@/modules/advanced/schemas";

async function ctx() {
  const rbac = await actionGuard("admin:access");
  if (!rbac) return null;
  return { user: rbac.user, workspaceId: rbac.workspace.id };
}

function statusInput(formData: FormData) {
  return statusSchema.parse({ name: String(formData.get("name") || ""), category: String(formData.get("category") || "TODO") });
}

export async function createStatusAction(formData: FormData) {
  const c = await ctx();
  if (!c) return;
  await adv.createStatus(c.user.id, c.workspaceId, String(formData.get("projectId") || ""), statusInput(formData));
  revalidatePath("/admin/advanced");
}

export async function updateStatusAction(formData: FormData) {
  const c = await ctx();
  if (!c) return;
  await adv.updateStatus(c.user.id, c.workspaceId, String(formData.get("projectId") || ""), String(formData.get("statusId") || ""), statusInput(formData));
  revalidatePath("/admin/advanced");
}

export async function createWebhookAction(formData: FormData) {
  const c = await ctx();
  if (!c) return;
  await adv.createWebhook(c.user.id, c.workspaceId, webhookSchema.parse({
    name: String(formData.get("name") || ""),
    url: String(formData.get("url") || ""),
    events: String(formData.get("events") || "issue.updated").split(",").map((s) => s.trim()).filter(Boolean),
    secret: String(formData.get("secret") || "") || null,
  }));
  revalidatePath("/admin/advanced");
}

export async function createAutomationAction(formData: FormData) {
  const c = await ctx();
  if (!c) return;
  await adv.createAutomation(c.user.id, c.workspaceId, automationSchema.parse({ name: String(formData.get("name") || ""), trigger: "issue.status.done", action: "notify.reporter", enabled: true }));
  revalidatePath("/admin/advanced");
}

export async function deliverPendingWebhooksAction() {
  const c = await ctx();
  if (!c) return;
  await adv.deliverPendingWebhooks(c.user.id, c.workspaceId);
  revalidatePath("/admin/advanced");
}

export async function rebuildSearchIndexAction() {
  const c = await ctx();
  if (!c) return;
  await adv.rebuildSearchIndex(c.user.id, c.workspaceId);
  revalidatePath("/admin/advanced");
}
