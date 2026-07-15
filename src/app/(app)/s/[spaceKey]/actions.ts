"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { attachmentStorageKey, putAttachmentObject } from "@/lib/object-storage";
import * as codex from "@/modules/codex/service";
import { createPageCommentSchema, createPageSchema, createSpaceSchema, movePageSchema, updatePageSchema } from "@/modules/codex/schemas";

async function ws(userId: string) { const { active } = await getActiveWorkspace(userId); if (!active) throw new Error("No active workspace"); return active.id; }

export async function createSpaceAction(formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id);
  const space = await codex.createSpace(user.id, workspaceId, createSpaceSchema.parse({ key: String(formData.get("key") || ""), name: String(formData.get("name") || ""), description: String(formData.get("description") || "") }));
  revalidatePath("/"); redirect(`/s/${space.key}`);
}

export async function createPageAction(spaceKey: string, spaceId: string, formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id);
  const page = await codex.createPage(user.id, workspaceId, createPageSchema.parse({ spaceId, parentId: String(formData.get("parentId") || "") || null, title: String(formData.get("title") || ""), contentText: String(formData.get("contentText") || "") }));
  revalidatePath(`/s/${spaceKey}`); redirect(`/s/${spaceKey}/pages/${page.id}`);
}

export async function updatePageAction(spaceKey: string, pageId: string, formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id);
  await codex.updatePage(user.id, workspaceId, pageId, updatePageSchema.parse({ title: String(formData.get("title") || ""), contentText: String(formData.get("contentText") || ""), publish: formData.get("publish") === "on" }));
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function lockPageAction(spaceKey: string, pageId: string) {
  const user = await requireUser(); const workspaceId = await ws(user.id); await codex.lockPage(user.id, workspaceId, pageId); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
export async function unlockPageAction(spaceKey: string, pageId: string) {
  const user = await requireUser(); const workspaceId = await ws(user.id); await codex.unlockPage(user.id, workspaceId, pageId); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
export async function restoreVersionAction(spaceKey: string, pageId: string, version: number) {
  const user = await requireUser(); const workspaceId = await ws(user.id); await codex.restoreVersion(user.id, workspaceId, pageId, version); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
export async function renamePageByFormAction(spaceKey: string, formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id);
  const pageId = String(formData.get("pageId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!pageId || !title) return;
  await codex.updatePage(user.id, workspaceId, pageId, updatePageSchema.parse({ title }));
  revalidatePath(`/s/${spaceKey}`);
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}

export async function movePageAction(spaceKey: string, pageId: string, parentId: string | null) {
  const user = await requireUser(); const workspaceId = await ws(user.id); await codex.movePage(user.id, workspaceId, pageId, movePageSchema.parse({ parentId })); revalidatePath(`/s/${spaceKey}`);
}
export async function addPageCommentAction(spaceKey: string, pageId: string, formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id); await codex.addPageComment(user.id, workspaceId, pageId, createPageCommentSchema.parse({ bodyText: String(formData.get("bodyText") || "") })); revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
export async function addAttachmentAction(spaceKey: string, pageId: string, formData: FormData) {
  const user = await requireUser(); const workspaceId = await ws(user.id);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) throw new Error("Attachment file is required");
  if (file.size > 10 * 1024 * 1024) throw new Error("Attachment exceeds 10 MB limit");
  await codex.getPage(user.id, workspaceId, pageId);
  const mimeType = file.type || "application/octet-stream";
  const key = attachmentStorageKey(workspaceId, "page", pageId, file.name);
  await putAttachmentObject({ key, file, contentType: mimeType });
  await prisma.attachment.create({ data: { workspaceId, pageId, filename: file.name, mimeType, size: file.size, storageKey: key } });
  revalidatePath(`/s/${spaceKey}/pages/${pageId}`);
}
