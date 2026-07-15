import { IssueLinkType } from "@prisma/client";
import { z } from "zod";

export const issuePageLinkSchema = z.object({ issueId: z.string().min(1), pageId: z.string().min(1) });
export const issueLinkSchema = z.object({ sourceIssueId: z.string().min(1), targetIssueId: z.string().min(1), linkType: z.nativeEnum(IssueLinkType) });
export const customFieldDefinitionSchema = z.object({ key: z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/), label: z.string().trim().min(1).max(80), type: z.enum(["text", "number", "select", "date"]), options: z.array(z.string().trim().min(1)).optional().default([]) });
export const issueCustomFieldValueSchema = z.object({ key: z.string().trim().min(1), value: z.union([z.string(), z.number(), z.null()]) });
