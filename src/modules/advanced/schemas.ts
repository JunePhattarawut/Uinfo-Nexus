import { StatusCategory } from "@prisma/client";
import { z } from "zod";

export const savedFilterSchema = z.object({
  projectId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
  filters: z.record(z.unknown()).default({}),
});

export const statusSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.nativeEnum(StatusCategory),
});

export const webhookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url(),
  events: z.array(z.string().trim().min(1)).min(1),
  secret: z.string().trim().max(200).optional().nullable(),
});

export const automationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.enum(["issue.status.done"]),
  action: z.enum(["notify.reporter"]),
  enabled: z.coerce.boolean().default(true),
});

export type SavedFilterInput = z.infer<typeof savedFilterSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
export type AutomationInput = z.infer<typeof automationSchema>;
