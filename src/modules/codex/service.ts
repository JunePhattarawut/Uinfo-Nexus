import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { rankAfter, rankBetween } from "@/lib/rank";
import { requireMembership } from "@/lib/tenancy";
import { attachFileSchema, tiptapDoc, type AttachFileInput, type CreatePageCommentInput, type CreatePageInput, type CreateSpaceInput, type MovePageInput, type UpdatePageInput } from "./schemas";

const LOCK_TTL_MS = 5 * 60 * 1000;

export function textFromDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.text === "string") parts.push(rec.text);
    if (Array.isArray(rec.content)) rec.content.forEach(walk);
  };
  walk(doc);
  return parts.join("\n\n");
}

function lockExpired(page: { lockedAt: Date | null }) {
  return !page.lockedAt || Date.now() - page.lockedAt.getTime() > LOCK_TTL_MS;
}

export async function listSpaces(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  return prisma.space.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, include: { pages: { where: { deletedAt: null }, orderBy: { rank: "asc" } } } });
}

export async function getSpace(userId: string, workspaceId: string, spaceKey: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  const space = await prisma.space.findFirst({ where: { workspaceId, key: spaceKey.toUpperCase() }, include: { pages: { where: { deletedAt: null }, orderBy: { rank: "asc" } } } });
  if (!space) throw new AppError("NOT_FOUND", "Space not found");
  return space;
}

export async function createSpace(userId: string, workspaceId: string, input: CreateSpaceInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.space.create({ data: { workspaceId, key: input.key.toUpperCase(), name: input.name, description: input.description || null, iconEmoji: input.iconEmoji ?? "📄", isPrivate: input.isPrivate ?? false, createdBy: userId } });
}

export async function createPage(userId: string, workspaceId: string, input: CreatePageInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const space = await tx.space.findFirst({ where: { id: input.spaceId, workspaceId } });
    if (!space) throw new AppError("NOT_FOUND", "Space not found");
    if (input.parentId) {
      const parent = await tx.page.findFirst({ where: { id: input.parentId, workspaceId, spaceId: input.spaceId, deletedAt: null } });
      if (!parent) throw new AppError("VALIDATION", "Parent page not found");
    }
    const last = await tx.page.findFirst({ where: { workspaceId, spaceId: input.spaceId, parentId: input.parentId ?? null, deletedAt: null }, orderBy: { rank: "desc" }, select: { rank: true } });
    const content = tiptapDoc(input.contentText ?? "");
    const page = await tx.page.create({ data: { workspaceId, spaceId: input.spaceId, parentId: input.parentId ?? null, title: input.title, emoji: input.emoji ?? null, content, rank: rankAfter(last?.rank ?? null), createdBy: userId, updatedBy: userId } });
    await tx.pageVersion.create({ data: { pageId: page.id, version: 1, title: page.title, content, authorId: userId } });
    return page;
  });
}

export async function getPage(userId: string, workspaceId: string, pageId: string) {
  await requireMembership(userId, workspaceId, "VIEWER");
  const page = await prisma.page.findFirst({
    where: { id: pageId, workspaceId, deletedAt: null },
    include: {
      space: true,
      versions: { orderBy: { version: "desc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!page) throw new AppError("NOT_FOUND", "Page not found");
  return page;
}

export async function updatePage(userId: string, workspaceId: string, pageId: string, input: UpdatePageInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!existing) throw new AppError("NOT_FOUND", "Page not found");
    if (existing.lockedBy && existing.lockedBy !== userId && !lockExpired(existing)) throw new AppError("CONFLICT", "Page is locked by another user");
    const content = input.contentText !== undefined ? tiptapDoc(input.contentText) : undefined;
    const updated = await tx.page.update({ where: { id: pageId }, data: { ...(input.title ? { title: input.title } : {}), ...(content ? { content } : {}), ...("emoji" in input ? { emoji: input.emoji ?? null } : {}), updatedBy: userId } });
    if (input.publish) {
      const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
      await tx.pageVersion.create({ data: { pageId, version: nextVersion, title: updated.title, content: (updated.content ?? tiptapDoc("")) as Prisma.InputJsonValue, authorId: userId } });
    }
    return updated;
  });
}

export async function lockPage(userId: string, workspaceId: string, pageId: string) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const page = await prisma.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null } });
  if (!page) throw new AppError("NOT_FOUND", "Page not found");
  if (page.lockedBy && page.lockedBy !== userId && !lockExpired(page)) throw new AppError("CONFLICT", "Page is locked by another user");
  return prisma.page.update({ where: { id: pageId }, data: { lockedBy: userId, lockedAt: new Date() } });
}

export async function unlockPage(userId: string, workspaceId: string, pageId: string) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.page.updateMany({ where: { id: pageId, workspaceId, lockedBy: userId }, data: { lockedBy: null, lockedAt: null } });
}

export async function movePage(userId: string, workspaceId: string, pageId: string, input: MovePageInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const page = await tx.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null } });
    if (!page) throw new AppError("NOT_FOUND", "Page not found");
    if (input.parentId) {
      if (input.parentId === pageId) throw new AppError("VALIDATION", "Page cannot be its own parent");
      const parent = await tx.page.findFirst({ where: { id: input.parentId, workspaceId, spaceId: page.spaceId, deletedAt: null } });
      if (!parent) throw new AppError("VALIDATION", "Parent page not found");
    }
    const before = input.beforePageId ? await tx.page.findFirst({ where: { id: input.beforePageId, workspaceId, parentId: input.parentId ?? null }, select: { rank: true } }) : null;
    const after = input.afterPageId ? await tx.page.findFirst({ where: { id: input.afterPageId, workspaceId, parentId: input.parentId ?? null }, select: { rank: true } }) : null;
    let rank = rankBetween(before?.rank ?? null, after?.rank ?? null);
    if (!input.beforePageId && !input.afterPageId) {
      const last = await tx.page.findFirst({ where: { workspaceId, spaceId: page.spaceId, parentId: input.parentId ?? null, deletedAt: null, id: { not: pageId } }, orderBy: { rank: "desc" }, select: { rank: true } });
      rank = rankAfter(last?.rank ?? null);
    }
    return tx.page.update({ where: { id: pageId }, data: { parentId: input.parentId ?? null, rank, updatedBy: userId } });
  });
}

export async function restoreVersion(userId: string, workspaceId: string, pageId: string, version: number) {
  await requireMembership(userId, workspaceId, "MEMBER");
  return prisma.$transaction(async (tx) => {
    const page = await tx.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!page) throw new AppError("NOT_FOUND", "Page not found");
    const old = await tx.pageVersion.findUnique({ where: { pageId_version: { pageId, version } } });
    if (!old) throw new AppError("NOT_FOUND", "Version not found");
    const restoredContent = (old.content ?? tiptapDoc("")) as Prisma.InputJsonValue;
    const updated = await tx.page.update({ where: { id: pageId }, data: { title: old.title, content: restoredContent, updatedBy: userId } });
    await tx.pageVersion.create({ data: { pageId, version: (page.versions[0]?.version ?? version) + 1, title: old.title, content: restoredContent, authorId: userId } });
    return updated;
  });
}

export async function addPageComment(userId: string, workspaceId: string, pageId: string, input: CreatePageCommentInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const page = await prisma.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null } });
  if (!page) throw new AppError("NOT_FOUND", "Page not found");
  return prisma.comment.create({ data: { pageId, authorId: userId, body: tiptapDoc(input.bodyText) }, include: { author: { select: { id: true, name: true, email: true } } } });
}

export async function addAttachment(userId: string, workspaceId: string, pageId: string, input: AttachFileInput) {
  await requireMembership(userId, workspaceId, "MEMBER");
  const page = await prisma.page.findFirst({ where: { id: pageId, workspaceId, deletedAt: null } });
  if (!page) throw new AppError("NOT_FOUND", "Page not found");
  const parsed = attachFileSchema.parse(input);
  return prisma.attachment.create({ data: { workspaceId, pageId, filename: parsed.filename, mimeType: parsed.mimeType, size: parsed.size, storageKey: `local-dev/${pageId}/${Date.now()}-${parsed.filename}` } });
}
