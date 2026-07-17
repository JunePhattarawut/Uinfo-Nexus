"use server";

import { revalidatePath } from "next/cache";
import { actionGuard } from "@/lib/rbac";
import { createSprintSchema, moveToSprintSchema } from "@/modules/agile/schemas";
import * as agile from "@/modules/agile/service";

export async function createSprintAction(projectKey: string, projectId: string, formData: FormData) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  await agile.createSprint(ctx.user.id, ctx.workspace.id, createSprintSchema.parse({
    projectId,
    name: String(formData.get("name") || ""),
    goal: String(formData.get("goal") || ""),
    startDate: formData.get("startDate") ? new Date(String(formData.get("startDate"))).toISOString() : null,
    endDate: formData.get("endDate") ? new Date(String(formData.get("endDate"))).toISOString() : null,
  }));
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function startSprintAction(projectKey: string, sprintId: string) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  await agile.startSprint(ctx.user.id, ctx.workspace.id, sprintId);
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function completeSprintAction(projectKey: string, sprintId: string) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  await agile.completeSprint(ctx.user.id, ctx.workspace.id, sprintId);
  revalidatePath(`/p/${projectKey}/backlog`);
}

export async function moveToSprintAction(projectKey: string, issueId: string, sprintId: string | null) {
  const ctx = await actionGuard("issue:edit");
  if (!ctx) return;
  await agile.moveIssueToSprint(ctx.user.id, ctx.workspace.id, moveToSprintSchema.parse({ issueId, sprintId }));
  revalidatePath(`/p/${projectKey}/backlog`);
}
