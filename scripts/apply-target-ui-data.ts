import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateKeyBetween } from "fractional-indexing";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function rankSeq(n: number) {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null);
    out.push(prev);
  }
  return out;
}

const projectNames: Record<string, string> = {
  CTI: "Compliance Tracking Initiative",
  CTR: "Contract Review",
  RLGA: "Risk & Legal Governance",
  OM: "Operations Management",
  GWM: "Governance Workflow",
  UIA: "Internal Audit",
};

const visible = [
  { n: 101, status: "To do", type: "TASK", priority: "HIGH", title: "ทบทวนนโยบายความปลอดภัยข้อมูลประจำไตรมาส", labels: ["policy"] },
  { n: 104, status: "To do", type: "TASK", priority: "LOW", title: "อัปเดตคู่มือการรายงานเหตุการณ์ผิดปกติ", labels: [] },
  { n: 107, status: "To do", type: "STORY", priority: "HIGHEST", title: "ประสานงานฝ่ายกฎหมายเรื่องข้อพิพาทลูกค้า", labels: ["legal"] },
  { n: 102, status: "In progress", type: "STORY", priority: "MEDIUM", title: "ตรวจสอบสัญญาคู่ค้ารายใหม่ก่อนเซ็น", labels: ["legal", "vendor"] },
  { n: 103, status: "In progress", type: "TASK", priority: "HIGH", title: "จัดทำรายงานการปฏิบัติตามกฎระเบียบ Q3", labels: ["compliance"] },
  { n: 105, status: "Done", type: "BUG", priority: "MEDIUM", title: "ปิดรายการตรวจสอบภายในประจำเดือน", labels: ["audit"] },
  { n: 106, status: "Done", type: "EPIC", priority: "MEDIUM", title: "อบรมพนักงานใหม่เรื่องจรรยาบรรณองค์กร", labels: ["training"] },
] as const;

async function main() {
  const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!ws) throw new Error("No workspace");
  const reporter = (await prisma.user.findFirst({ where: { email: "chai@demo.local" } })) ?? (await prisma.user.findFirst());
  if (!reporter) throw new Error("No user");

  for (const [key, name] of Object.entries(projectNames)) {
    await prisma.project.updateMany({ where: { workspaceId: ws.id, key }, data: { name } });
  }

  const cti = await prisma.project.findFirst({ where: { workspaceId: ws.id, key: "CTI" } });
  if (!cti) throw new Error("CTI project not found");

  await prisma.$transaction(async (tx) => {
    const oldIssues = await tx.issue.findMany({ where: { projectId: cti.id }, select: { id: true } });
    const oldIds = oldIssues.map((i) => i.id);
    if (oldIds.length) {
      await tx.comment.deleteMany({ where: { issueId: { in: oldIds } } });
      await tx.issueLabel.deleteMany({ where: { issueId: { in: oldIds } } });
      await tx.issuePageLink.deleteMany({ where: { issueId: { in: oldIds } } });
      await tx.issueLink.deleteMany({ where: { OR: [{ sourceIssueId: { in: oldIds } }, { targetIssueId: { in: oldIds } }] } });
      await tx.attachment.deleteMany({ where: { issueId: { in: oldIds } } });
    }
    await tx.issue.deleteMany({ where: { projectId: cti.id } });
    await tx.status.deleteMany({ where: { projectId: cti.id } });

    const todo = await tx.status.create({ data: { projectId: cti.id, name: "To do", category: "TODO", position: 0 } });
    const progress = await tx.status.create({ data: { projectId: cti.id, name: "In progress", category: "IN_PROGRESS", position: 1 } });
    const done = await tx.status.create({ data: { projectId: cti.id, name: "Done", category: "DONE", position: 2 } });
    const statusByName: Record<string, string> = { "To do": todo.id, "In progress": progress.id, Done: done.id };
    const ranks = rankSeq(visible.length);

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const issue = await tx.issue.create({
        data: {
          workspaceId: ws.id,
          projectId: cti.id,
          number: item.n,
          type: item.type,
          title: item.title,
          description: doc(item.title),
          statusId: statusByName[item.status],
          priority: item.priority,
          reporterId: reporter.id,
          rank: ranks[i],
        },
      });
      for (const name of item.labels) {
        const label = await tx.label.upsert({ where: { workspaceId_name: { workspaceId: ws.id, name } }, update: {}, create: { workspaceId: ws.id, name } });
        await tx.issueLabel.create({ data: { issueId: issue.id, labelId: label.id } });
      }
    }
    await tx.project.update({ where: { id: cti.id }, data: { issueCounter: 128 } });
  });

  const check = await prisma.project.findFirst({ where: { workspaceId: ws.id, key: "CTI" }, include: { _count: { select: { issues: true } }, statuses: { orderBy: { position: "asc" } } } });
  console.log(JSON.stringify({ project: check?.name, issues: check?._count.issues, statuses: check?.statuses.map((s) => s.name) }, null, 2));
}

main().finally(() => prisma.$disconnect());
