import { IssuePriority, IssueType } from "@prisma/client";
import { z } from "zod";
import { richDocFromMarkdown } from "@/lib/rich-text";

export const issueTypeSchema = z.nativeEnum(IssueType);
export const issuePrioritySchema = z.nativeEnum(IssuePriority);

export const createIssueSchema = z.object({
  projectId: z.string().min(1),
  type: issueTypeSchema.default("TASK"),
  title: z.string().trim().min(1).max(200),
  descriptionText: z.string().max(10000).optional().default(""),
  statusId: z.string().min(1).optional(),
  priority: issuePrioritySchema.default("MEDIUM"),
  assigneeId: z.string().min(1).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  dueDate: z.string().datetime().nullable().optional(),
  storyPoints: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

export const updateIssueSchema = z.object({
  type: issueTypeSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  descriptionText: z.string().max(10000).optional(),
  statusId: z.string().min(1).optional(),
  priority: issuePrioritySchema.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  storyPoints: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

export const issueFiltersSchema = z.object({
  projectKey: z.string().optional(),
  statusId: z.string().optional(),
  type: issueTypeSchema.optional(),
  assigneeId: z.string().optional(),
  label: z.string().optional(),
});

export const moveIssueSchema = z.object({
  statusId: z.string().min(1),
  beforeIssueId: z.string().min(1).nullable().optional(),
  afterIssueId: z.string().min(1).nullable().optional(),
});

export const createCommentSchema = z.object({
  bodyText: z.string().trim().min(1).max(5000),
});

export const addReferenceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  source: z.string().trim().max(80).optional().default("External link"),
  note: z.string().trim().max(500).optional().default(""),
});

export function tiptapDoc(text: string) {
  return richDocFromMarkdown(text) as any;
}

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type IssueFilters = z.infer<typeof issueFiltersSchema>;
export type MoveIssueInput = z.infer<typeof moveIssueSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type AddReferenceInput = z.infer<typeof addReferenceSchema>;
