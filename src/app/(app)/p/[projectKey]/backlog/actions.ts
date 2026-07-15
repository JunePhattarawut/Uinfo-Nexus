"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { createSprintSchema, moveToSprintSchema } from "@/modules/agile/schemas";
import * as agile from "@/modules/agile/service";

async function activeWorkspaceId(userId: string) {
  const { active } = await getActiveWorkspace(userId);
  if (!active) throw new Error("No active workspace");
  return active.id;
}

export async function createSprintAction(projectKey: string, projectId: string, formData: FormData) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId(user.id);
  await agile.createSprint(user.id, workspaceId, createSprintSchema.parse({
    projectId,
    name: String(formData.get("name") || ""),
    goal: String(formData.get("goal") || ""),
    startDate: formData.get("startDate") ? new Date(String(formData.get("startDate"))).toISOString() : null,
    endDate: formData.get("endDate") ? new Date(String(formData.get("endDate"))).toISOString() : null,
  }));
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function startSprintAction(projectKey: string, sprintId: string) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId(user.id);
  await agile.startSprint(user.id, workspaceId, sprintId);
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function completeSprintAction(projectKey: string, sprintId: string) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId(user.id);
  await agile.completeSprint(user.id, workspaceId, sprintId);
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function moveToSprintAction(projectKey: string, issueId: string, sprintId: string | null) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId(user.id);
  await agile.moveIssueToSprint(user.id, workspaceId, moveToSprintSchema.parse({ issueId, sprintId }));
  revalidatePath(`/p/${projectKey}/backlog`);
}
