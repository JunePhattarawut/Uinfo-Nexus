import { z } from "zod";
import { richDocFromMarkdown } from "@/lib/rich-text";

export const createSpaceSchema = z.object({
  key: z.string().trim().min(2).max(12).regex(/^[A-Z][A-Z0-9]*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
});

export const createPageSchema = z.object({
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  contentText: z.string().max(50000).optional().default(""),
});

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  contentText: z.string().max(50000).optional(),
  publish: z.coerce.boolean().optional().default(false),
});

export const movePageSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  beforePageId: z.string().min(1).nullable().optional(),
  afterPageId: z.string().min(1).nullable().optional(),
});

export const createPageCommentSchema = z.object({ bodyText: z.string().trim().min(1).max(5000) });

export const attachFileSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120).default("application/octet-stream"),
  size: z.coerce.number().int().min(0).default(0),
});

export function tiptapDoc(text: string) {
  return richDocFromMarkdown(text) as any;
}

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
export type MovePageInput = z.infer<typeof movePageSchema>;
export type CreatePageCommentInput = z.infer<typeof createPageCommentSchema>;
export type AttachFileInput = z.infer<typeof attachFileSchema>;
