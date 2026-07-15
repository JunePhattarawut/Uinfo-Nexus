import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as codex from "@/modules/codex/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null;
const prisma = hasDb ? new PrismaClient({ adapter: adapter! }) : null;

describe.skipIf(!hasDb)("M3 Uinfo Codex workflow", () => {
  let ownerId = "";
  let otherId = "";
  let workspaceId = "";
  let spaceId = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await prisma!.user.create({ data: { email: `m3-owner-${stamp}@m3.local`, name: "M3 Owner", passwordHash: "x" } });
    const other = await prisma!.user.create({ data: { email: `m3-other-${stamp}@m3.local`, name: "M3 Other", passwordHash: "x" } });
    ownerId = owner.id; otherId = other.id;
    const ws = await prisma!.workspace.create({ data: { name: "M3 WS", slug: `m3-${stamp}`, memberships: { create: [{ userId: ownerId, role: "OWNER" }, { userId: otherId, role: "MEMBER" }] } } });
    workspaceId = ws.id;
    const space = await codex.createSpace(ownerId, workspaceId, { key: "DOC", name: "Docs", description: "" });
    spaceId = space.id;
  });

  afterAll(async () => {
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma!.$disconnect();
  });

  it("creates a 3-level page tree and moves a subtree", async () => {
    const root = await codex.createPage(ownerId, workspaceId, { spaceId, title: "Root", contentText: "root" });
    const child = await codex.createPage(ownerId, workspaceId, { spaceId, parentId: root.id, title: "Child", contentText: "child" });
    const grand = await codex.createPage(ownerId, workspaceId, { spaceId, parentId: child.id, title: "Grand", contentText: "grand" });
    await codex.movePage(ownerId, workspaceId, child.id, { parentId: null });
    const storedChild = await prisma!.page.findUniqueOrThrow({ where: { id: child.id } });
    const storedGrand = await prisma!.page.findUniqueOrThrow({ where: { id: grand.id } });
    expect(storedChild.parentId).toBeNull();
    expect(storedGrand.parentId).toBe(child.id);
  });

  it("saves and restores versions exactly", async () => {
    const page = await codex.createPage(ownerId, workspaceId, { spaceId, title: "Versioned", contentText: "first" });
    await codex.updatePage(ownerId, workspaceId, page.id, { contentText: "second", publish: true });
    await codex.restoreVersion(ownerId, workspaceId, page.id, 1);
    const restored = await codex.getPage(ownerId, workspaceId, page.id);
    expect(codex.textFromDoc(restored.content)).toBe("first");
  });

  it("prevents editing a locked page by another user", async () => {
    const page = await codex.createPage(ownerId, workspaceId, { spaceId, title: "Locked", contentText: "locked" });
    await codex.lockPage(ownerId, workspaceId, page.id);
    await expect(codex.updatePage(otherId, workspaceId, page.id, { contentText: "bad", publish: true })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("adds page comments and attachments", async () => {
    const page = await codex.createPage(ownerId, workspaceId, { spaceId, title: "Assets", contentText: "asset" });
    await codex.addPageComment(ownerId, workspaceId, page.id, { bodyText: "hello" });
    await codex.addAttachment(ownerId, workspaceId, page.id, { filename: "image.png", mimeType: "image/png", size: 123 });
    const full = await codex.getPage(ownerId, workspaceId, page.id);
    expect(full.comments).toHaveLength(1);
    expect(full.attachments[0].filename).toBe("image.png");
  });
});
