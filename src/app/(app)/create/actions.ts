"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as issueService from "@/modules/issue/service";
import { createIssueSchema } from "@/modules/issue/schemas";

async function activeWorkspaceId(userId: string) {
  const { active } = await getActiveWorkspace(userId);
  if (!active) throw new Error("No active workspace");
  return active.id;
}

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
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId(user.id);
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
  const issue = await issueService.createIssue(user.id, workspaceId, input);
  const projectKey = issue.project.key;
  revalidatePath(`/p/${projectKey}/issues`);
  redirect(`/p/${projectKey}/issues/${issueService.issueDisplayKey(issue)}`);
}
