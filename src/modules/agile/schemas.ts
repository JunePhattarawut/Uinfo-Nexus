import { z } from "zod";

export const createSprintSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(1000).optional().default(""),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const updateSprintSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const moveToSprintSchema = z.object({
  issueId: z.string().min(1),
  sprintId: z.string().min(1).nullable(),
  beforeIssueId: z.string().min(1).nullable().optional(),
  afterIssueId: z.string().min(1).nullable().optional(),
});

export type CreateSprintInput = z.infer<typeof createSprintSchema>;
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;
export type MoveToSprintInput = z.infer<typeof moveToSprintSchema>;
