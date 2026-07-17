"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { attachmentStorageKey, putAttachmentObject } from "@/lib/object-storage";
import * as issueService from "@/modules/issue/service";
import { createIssueSchema, createCommentSchema, updateIssueSchema, moveIssueSchema, addReferenceSchema } from "@/modules/issue/schemas";

function labelsFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function nullable(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

export async function createIssueAction(projectKey: string, formData: FormData) {
  const ctx = await actionGuard("issue:create");
  if (!ctx) return;
  const input = createIssueSchema.parse({
    projectId: String(formData.get("projectId")),
    type: String(formData.get("type") || "TASK"),
    title: String(formData.get("title") || ""),
    descriptionText: String(formData.get("descriptionText") || ""),
    statusId: nullable(formData.get("statusId")) ?? undefined,
    priority: String(formData.get("priority") || "MEDIUM"),
    assigneeId: nullable(formData.get("assigneeId")),
    labels: labelsFrom(formData.get("labels")),
    dueDate: nullable(formData.get("dueDate")) ? new Date(String(formData.get("dueDate"))).toISOString() : null,
    storyPoints: nullable(formData.get("storyPoints")),
  });
  const issue = await issueService.createIssue(ctx.user.id, ctx.workspace.id, input);
  revalidatePath(`/p/${projectKey}/issues`);
  redirect(`/p/${projectKey}/issues/${issueService.issueDisplayKey(issue)}`);
}

export async function setIssueDueDateAction(issueId: string, dateStr: string | null): Promise<void> {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  await prisma.issue.update({
    where: { id: issueId },
    data: { dueDate: dateStr ? new Date(dateStr) : null },
  });
  revalidatePath("/", "layout");
}

export async function updateIssueAction(projectKey: string, issueId: string, issueKey: string, formData: FormData) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  const input = updateIssueSchema.parse({
    type: String(formData.get("type") || "TASK"),
    title: String(formData.get("title") || ""),
    descriptionText: String(formData.get("descriptionText") || ""),
    statusId: nullable(formData.get("statusId")) ?? undefined,
    priority: String(formData.get("priority") || "MEDIUM"),
    assigneeId: nullable(formData.get("assigneeId")),
    labels: labelsFrom(formData.get("labels")),
    dueDate: nullable(formData.get("dueDate")) ? new Date(String(formData.get("dueDate"))).toISOString() : null,
    storyPoints: nullable(formData.get("storyPoints")),
  });
  await issueService.updateIssue(ctx.user.id, ctx.workspace.id, issueId, input);
  revalidatePath(`/p/${projectKey}/issues/${issueKey}`);
}

export async function addCommentAction(projectKey: string, issueId: string, issueKey: string, formData: FormData) {
  const ctx = await actionGuard("issue:comment");
  if (!ctx) return;
  const input = createCommentSchema.parse({ bodyText: String(formData.get("bodyText") || "") });
  await issueService.addComment(ctx.user.id, ctx.workspace.id, issueId, input);
  revalidatePath(`/p/${projectKey}/issues/${issueKey}`);
}

export async function addReferenceAction(projectKey: string, issueId: string, issueKey: string, formData: FormData) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  const pageId = nullable(formData.get("pageId"));
  if (pageId) {
    await issueService.linkPageReference(ctx.user.id, ctx.workspace.id, issueId, pageId);
  } else {
    const input = addReferenceSchema.parse({
      title: String(formData.get("title") || ""),
      url: String(formData.get("url") || ""),
      source: String(formData.get("source") || "External link"),
      note: String(formData.get("note") || ""),
    });
    await issueService.addExternalReference(ctx.user.id, ctx.workspace.id, issueId, input);
  }
  revalidatePath(`/p/${projectKey}/issues/${issueKey}`);
}

export async function moveIssueAction(projectKey: string, issueId: string, statusId: string) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  const input = moveIssueSchema.parse({ statusId });
  await issueService.moveIssue(ctx.user.id, ctx.workspace.id, issueId, input);
  revalidatePath(`/p/${projectKey}/issues`);
}

export async function uploadIssueAttachmentAction(projectKey: string, issueId: string, issueKey: string, formData: FormData) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) throw new Error("Attachment file is required");
  if (file.size > 10 * 1024 * 1024) throw new Error("Attachment exceeds 10 MB limit");
  const issue = await issueService.getIssueByKey(ctx.user.id, ctx.workspace.id, issueKey);
  if (issue.issue.id !== issueId) throw new Error("Issue mismatch");
  const key = attachmentStorageKey(ctx.workspace.id, "issue", issueId, file.name);
  const mimeType = file.type || "application/octet-stream";
  await putAttachmentObject({ key, file, contentType: mimeType });
  await prisma.attachment.create({
    data: { workspaceId: ctx.workspace.id, issueId, filename: file.name, mimeType, size: file.size, storageKey: key },
  });
  revalidatePath(`/p/${projectKey}/issues/${issueKey}`);
  revalidatePath(`/p/${projectKey}/issues`);
}
