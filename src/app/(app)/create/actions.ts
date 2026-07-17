"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionGuard } from "@/lib/rbac";
import * as issueService from "@/modules/issue/service";
import { createIssueSchema } from "@/modules/issue/schemas";

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

export async function createWorkItemAction(formData: FormData) {
  const ctx = await actionGuard("issue:create");
  if (!ctx) return;
  const input = createIssueSchema.parse({
    projectId: String(formData.get("projectId")),
    type: String(formData.get("type") || "TASK"),
    title: String(formData.get("title") || ""),
    descriptionText: String(formData.get("descriptionText") || ""),
    priority: String(formData.get("priority") || "MEDIUM"),
    assigneeId: nullable(formData.get("assigneeId")),
    labels: labelsFrom(formData.get("labels")),
    dueDate: nullable(formData.get("dueDate")) ? new Date(String(formData.get("dueDate"))).toISOString() : null,
    storyPoints: nullable(formData.get("storyPoints")),
  });
  const issue = await issueService.createIssue(ctx.user.id, ctx.workspace.id, input);
  const projectKey = issue.project.key;
  revalidatePath(`/p/${projectKey}/issues`);
  redirect(`/p/${projectKey}/issues/${issueService.issueDisplayKey(issue)}`);
}
