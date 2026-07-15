import { prisma } from "@/lib/db";
import { requireCan } from "@/lib/policy";
import { textFromDoc } from "@/modules/codex/service";

function csvCell(v: unknown) { return `"${String(v ?? "").replaceAll('"', '""')}"`; }

export async function exportIssuesCsv(userId: string, workspaceId: string) {
  await requireCan(userId, "export", { type: "workspace", workspaceId });
  const issues = await prisma.issue.findMany({ where: { workspaceId, deletedAt: null }, include: { project: true, status: true, assignee: true, reporter: true }, orderBy: [{ project: { key: "asc" } }, { number: "asc" }] });
  const rows = [["key", "title", "type", "priority", "status", "assignee", "reporter", "storyPoints"]];
  for (const i of issues) rows.push([`${i.project.key}-${i.number}`, i.title, i.type, i.priority, i.status.name, i.assignee?.email ?? "", i.reporter.email, String(i.storyPoints ?? "")]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export async function exportPagesJson(userId: string, workspaceId: string) {
  await requireCan(userId, "export", { type: "workspace", workspaceId });
  const pages = await prisma.page.findMany({ where: { workspaceId, deletedAt: null }, include: { space: true }, orderBy: [{ space: { key: "asc" } }, { rank: "asc" }] });
  return JSON.stringify(pages.map((p) => ({ space: p.space.key, id: p.id, parentId: p.parentId, title: p.title, contentText: textFromDoc(p.content), updatedAt: p.updatedAt })), null, 2);
}

export async function exportPagesMarkdown(userId: string, workspaceId: string) {
  await requireCan(userId, "export", { type: "workspace", workspaceId });
  const pages = await prisma.page.findMany({ where: { workspaceId, deletedAt: null }, include: { space: true }, orderBy: [{ space: { key: "asc" } }, { rank: "asc" }] });
  return pages.map((p) => `# ${p.space.key} / ${p.title}\n\n${textFromDoc(p.content)}\n`).join("\n---\n\n");
}

export async function auditActivity(userId: string, workspaceId: string) {
  await requireCan(userId, "admin", { type: "workspace", workspaceId });
  return prisma.activityLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 200 });
}
