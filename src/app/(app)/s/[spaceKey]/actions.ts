"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { attachmentStorageKey, putAttachmentObject } from "@/lib/object-storage";
import * as codex from "@/modules/codex/service";
import { createPageCommentSchema, createPageSchema, createSpaceSchema, movePageSchema, updatePageSchema } from "@/modules/codex/schemas";

export async function createSpaceAction(formData: FormData) {
  const ctx = await actionGuard("space:create");
  if (!ctx) return;
  const space = await codex.createSpace(ctx.user.id, ctx.workspace.id, createSpaceSchema.parse({ key: String(formData.get("key") || ""), name: String(formData.get("name") || ""), description: String(formData.get("description") || "") }));
  revalidatePath("/"); redirect(`/s/${space.key}`);
}

export async function createPageAction(spaceKey: string, spaceId: string, formData: FormData) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  const emoji = String(formData.get("emoji") || "").trim();
  const page = await codex.createPage(ctx.user.id, ctx.workspace.id, createPageSchema.parse({ spaceId, parentId: String(formData.get("parentId") || "") || null, title: String(formData.get("title") || ""), emoji: emoji || null, contentText: String(formData.get("contentText") || "") }));
  revalidatePath(`/s/${spaceKey}`); redirect(`/s/${spaceKey}/pages/${page.id}`);
}

export async function updatePageAction(spaceKey: string, pageId: string, formData: FormData) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  const emoji = String(formData.get("emoji") || "").trim();
  await codex.updatePage(ctx.user.id, ctx.workspace.id, pageId, updatePageSchema.parse({ title: String(formData.get("title") || ""), emoji: emoji || null, contentText: String(formData.get("contentText") || ""), publish: formData.get("publish") === "on" }));
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function lockPageAction(spaceKey: string, pageId: string) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.lockPage(ctx.user.id, ctx.workspace.id, pageId); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function unlockPageAction(spaceKey: string, pageId: string) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.unlockPage(ctx.user.id, ctx.workspace.id, pageId); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function restoreVersionAction(spaceKey: string, pageId: string, version: number) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.restoreVersion(ctx.user.id, ctx.workspace.id, pageId, version); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function renamePageByFormAction(spaceKey: string, formData: FormData) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  const pageId = String(formData.get("pageId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!pageId || !title) return;
  await codex.updatePage(ctx.user.id, ctx.workspace.id, pageId, updatePageSchema.parse({ title }));
  revalidatePath(`/s/${spaceKey}`);
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function movePageAction(spaceKey: string, pageId: string, parentId: string | null) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.movePage(ctx.user.id, ctx.workspace.id, pageId, movePageSchema.parse({ parentId })); revalidatePath(`/s/${spaceKey}`);
}

export async function addPageCommentAction(spaceKey: string, pageId: string, formData: FormData) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.addPageComment(ctx.user.id, ctx.workspace.id, pageId, createPageCommentSchema.parse({ bodyText: String(formData.get("bodyText") || "") })); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function deletePageAction(spaceKey: string, pageId: string) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  await codex.deletePage(ctx.user.id, ctx.workspace.id, pageId);
  revalidatePath(`/s/${spaceKey}`);
  redirect(`/s/${spaceKey}`);
}

export async function updateSpaceAction(spaceKey: string, formData: FormData) {
  const ctx = await actionGuard("space:create");
  if (!ctx) return;
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const iconEmoji = String(formData.get("iconEmoji") || "").trim();
  await codex.updateSpace(ctx.user.id, ctx.workspace.id, spaceKey, { name: name || undefined, description, iconEmoji: iconEmoji || undefined });
  revalidatePath(`/s/${spaceKey}`);
  revalidatePath("/spaces");
}

export async function addAttachmentAction(spaceKey: string, pageId: string, formData: FormData) {
  const ctx = await actionGuard("page:edit");
  if (!ctx) return;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) throw new Error("Attachment file is required");
  if (file.size > 10 * 1024 * 1024) throw new Error("Attachment exceeds 10 MB limit");
  await codex.getPage(ctx.user.id, ctx.workspace.id, pageId);
  const mimeType = file.type || "application/octet-stream";
  const key = attachmentStorageKey(ctx.workspace.id, "page", pageId, file.name);
  await putAttachmentObject({ key, file, contentType: mimeType });
  await prisma.attachment.create({ data: { workspaceId: ctx.workspace.id, pageId, filename: file.name, mimeType, size: file.size, storageKey: key } });
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
