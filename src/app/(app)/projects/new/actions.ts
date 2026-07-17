"use server";

import { StatusCategory } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionGuard } from "@/lib/rbac";
import { prisma } from "@/lib/db";

const projectTemplateSchema = z.enum(["kanban", "scrum", "task", "bug", "imported"]);
const projectIconSchema = z.enum(["▦", "🛡️", "📋", "⚙️", "🚀", "📘"]);
const projectThemeSchema = z.enum(["nexus", "risk", "review", "ops"]);
const projectCoverSchema = z.enum(["blue", "green", "amber", "violet"]);

const createProjectSchema = z.object({
  key: z.string().trim().min(2).max(12).regex(/^[A-Z][A-Z0-9]*$/, "Use 2-12 uppercase letters/numbers, starting with a letter"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  template: projectTemplateSchema.default("kanban"),
  access: z.enum(["open", "private"]).default("open"),
  leadId: z.string().min(1).optional(),
  icon: projectIconSchema.default("▦"),
  theme: projectThemeSchema.default("nexus"),
});

type ProjectTemplate = z.infer<typeof projectTemplateSchema>;
type ProjectTheme = z.infer<typeof projectThemeSchema>;

const COVER_BY_THEME: Record<ProjectTheme, z.infer<typeof projectCoverSchema>> = {
  nexus: "blue",
  risk: "green",
  review: "amber",
  ops: "violet",
};

const STATUS_TEMPLATES: Record<ProjectTemplate, { name: string; category: StatusCategory }[]> = {
  kanban: [
    { name: "To Do", category: StatusCategory.TODO },
    { name: "In Progress", category: StatusCategory.IN_PROGRESS },
    { name: "Done", category: StatusCategory.DONE },
  ],
  scrum: [
    { name: "Backlog", category: StatusCategory.TODO },
    { name: "Selected for Development", category: StatusCategory.TODO },
    { name: "In Progress", category: StatusCategory.IN_PROGRESS },
    { name: "Done", category: StatusCategory.DONE },
  ],
  task: [
    { name: "To Do", category: StatusCategory.TODO },
    { name: "Doing", category: StatusCategory.IN_PROGRESS },
    { name: "Done", category: StatusCategory.DONE },
  ],
  bug: [
    { name: "Open", category: StatusCategory.TODO },
    { name: "Triaged", category: StatusCategory.TODO },
    { name: "In Progress", category: StatusCategory.IN_PROGRESS },
    { name: "Resolved", category: StatusCategory.DONE },
  ],
  imported: [
    { name: "To Do", category: StatusCategory.TODO },
    { name: "In Progress", category: StatusCategory.IN_PROGRESS },
    { name: "Review", category: StatusCategory.IN_PROGRESS },
    { name: "Done", category: StatusCategory.DONE },
  ],
};

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function createProjectAction(formData: FormData) {
  const ctx = await actionGuard("project:create");
  if (!ctx) return;

  const input = createProjectSchema.parse({
    key: formString(formData, "key").toUpperCase(),
    name: formString(formData, "name"),
    description: formString(formData, "description"),
    template: formString(formData, "template") || "kanban",
    access: formString(formData, "access") || "open",
    leadId: formString(formData, "leadId") || ctx.user.id,
    icon: formString(formData, "icon") || "▦",
    theme: formString(formData, "theme") || "nexus",
  });

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        workspaceId: ctx.workspace.id,
        key: input.key,
        name: input.name,
        description: input.description || null,
        metadata: { icon: input.icon, theme: input.theme, coverColor: COVER_BY_THEME[input.theme] },
        members: input.access === "private" ? { create: { userId: input.leadId ?? ctx.user.id, role: "ADMIN" } } : undefined,
      },
    });

    await tx.status.createMany({
      data: STATUS_TEMPLATES[input.template].map((status, index) => ({
        projectId: created.id,
        name: status.name,
        category: status.category,
        position: index + 1,
      })),
    });

    await tx.activityLog.create({
      data: {
        workspaceId: ctx.workspace.id,
        actorId: ctx.user.id,
        entityType: "project",
        entityId: created.id,
        action: "created",
        payload: { key: created.key, template: input.template, access: input.access, metadata: { icon: input.icon, theme: input.theme, coverColor: COVER_BY_THEME[input.theme] } },
      },
    });

    return created;
  });

  redirect(`/p/${project.key}/issues`);
}
