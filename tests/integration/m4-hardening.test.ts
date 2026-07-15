import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { can } from "@/lib/policy";
import * as integration from "@/modules/integration/service";
import { searchProvider } from "@/modules/search/service";
import { exportIssuesCsv, exportPagesJson } from "@/modules/export/service";
import * as codex from "@/modules/codex/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null;
const prisma = hasDb ? new PrismaClient({ adapter: adapter! }) : null;

describe.skipIf(!hasDb)("M4 integration and hardening", () => {
  let ownerId = "";
  let viewerId = "";
  let outsiderId = "";
  let workspaceId = "";
  let projectId = "";
  let issueA = "";
  let issueB = "";
  let pageId = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await prisma!.user.create({ data: { email: `m4-owner-${stamp}@m4.local`, name: "Owner", passwordHash: "x" } });
    const viewer = await prisma!.user.create({ data: { email: `m4-viewer-${stamp}@m4.local`, name: "Viewer", passwordHash: "x" } });
    const outsider = await prisma!.user.create({ data: { email: `m4-out-${stamp}@m4.local`, name: "Outsider", passwordHash: "x" } });
    ownerId = owner.id; viewerId = viewer.id; outsiderId = outsider.id;
    const ws = await prisma!.workspace.create({ data: { name: "M4 WS", slug: `m4-${stamp}`, memberships: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } });
    workspaceId = ws.id;
    const project = await prisma!.project.create({ data: { workspaceId, key: "M4", name: "M4 Project", members: { create: [{ userId: ownerId, role: "ADMIN" }] }, statuses: { create: [{ name: "To Do", category: "TODO", position: 1 }] } }, include: { statuses: true } });
    projectId = project.id;
    const issue1 = await prisma!.issue.create({ data: { workspaceId, projectId, number: 1, title: "Searchable Issue Alpha", reporterId: ownerId, statusId: project.statuses[0].id, rank: "a0", description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "needle issue body" }] }] } } });
    const issue2 = await prisma!.issue.create({ data: { workspaceId, projectId, number: 2, title: "Related Issue", reporterId: ownerId, statusId: project.statuses[0].id, rank: "a1" } });
    issueA = issue1.id; issueB = issue2.id;
    const space = await codex.createSpace(ownerId, workspaceId, { key: "M4DOC", name: "M4 Docs", description: "" });
    const page = await codex.createPage(ownerId, workspaceId, { spaceId: space.id, title: "Searchable Page Beta", contentText: "needle page body" });
    pageId = page.id;
    await prisma!.comment.create({ data: { issueId: issue1.id, authorId: ownerId, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Comment needle on issue" }] }] } } });
    await prisma!.comment.create({ data: { pageId: page.id, authorId: ownerId, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Comment needle on page" }] }] } } });
    await prisma!.attachment.create({ data: { workspaceId, issueId: issue1.id, filename: "needle-evidence.txt", mimeType: "text/plain", size: 12, storageKey: `test/${stamp}/needle-evidence.txt` } });
  });

  afterAll(async () => {
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: { in: [ownerId, viewerId, outsiderId] } } });
    await prisma!.$disconnect();
  });

  it("enforces central permission matrix", async () => {
    expect(await can(viewerId, "read", { type: "workspace", workspaceId })).toBe(true);
    expect(await can(viewerId, "edit", { type: "workspace", workspaceId })).toBe(false);
    expect(await can(outsiderId, "read", { type: "workspace", workspaceId })).toBe(false);
  });

  it("links issues to pages and issues to issues", async () => {
    const pageLink = await integration.linkIssuePage(ownerId, workspaceId, { issueId: issueA, pageId });
    expect(pageLink.pageId).toBe(pageId);
    const issueLink = await integration.createIssueLink(ownerId, workspaceId, { sourceIssueId: issueA, targetIssueId: issueB, linkType: "RELATES" });
    expect(issueLink.linkType).toBe("RELATES");
  });

  it("search finds issue descriptions, page bodies, comments, projects, and attachments", async () => {
    const results = await searchProvider.search(ownerId, workspaceId, "needle", "all");
    expect(results.some((r) => r.type === "issue" && r.title.includes("M4-1"))).toBe(true);
    expect(results.some((r) => r.type === "page" && r.title.includes("Searchable Page"))).toBe(true);
    expect(results.some((r) => r.type === "comment" && r.title.includes("Comment on M4-1"))).toBe(true);
    expect(results.some((r) => r.type === "comment" && r.title.includes("Comment on M4DOC"))).toBe(true);
    expect(results.some((r) => r.type === "attachment" && r.title.includes("needle-evidence.txt"))).toBe(true);

    const commentOnly = await searchProvider.search(ownerId, workspaceId, "Comment", "comment");
    expect(commentOnly.length).toBeGreaterThanOrEqual(2);
    expect(commentOnly.every((r) => r.type === "comment")).toBe(true);

    const projectOnly = await searchProvider.search(ownerId, workspaceId, "M4 Project", "project");
    expect(projectOnly.some((r) => r.type === "project" && r.title.includes("M4 Project"))).toBe(true);
    expect(projectOnly.every((r) => r.type === "project")).toBe(true);

    const attachmentOnly = await searchProvider.search(ownerId, workspaceId, "needle-evidence", "attachment");
    expect(attachmentOnly.some((r) => r.type === "attachment" && r.title.includes("needle-evidence.txt"))).toBe(true);
    expect(attachmentOnly.every((r) => r.type === "attachment")).toBe(true);
  });

  it("exports valid issue CSV and pages JSON for admins only", async () => {
    await expect(exportIssuesCsv(viewerId, workspaceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const csv = await exportIssuesCsv(ownerId, workspaceId);
    expect(csv).toContain('"M4-1"');
    const json = JSON.parse(await exportPagesJson(ownerId, workspaceId));
    expect(json.some((p: { title: string }) => p.title === "Searchable Page Beta")).toBe(true);
  });

  it("sets custom field values on issues", async () => {
    await integration.setIssueCustomField(ownerId, workspaceId, issueA, { key: "risk", value: "high" });
    const issue = await prisma!.issue.findUniqueOrThrow({ where: { id: issueA } });
    expect((issue.customFields as Record<string, unknown>).risk).toBe("high");
  });
});
