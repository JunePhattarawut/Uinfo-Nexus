// Seed data per HANDOFF M0 step 3:
// 1 workspace, 4 users, 1 project (default statuses, ~25 issues), 1 space (~8 pages in a tree).
// Run: npm run db:seed  (idempotent: wipes and recreates the demo workspace)
import { PrismaClient, IssueType, IssuePriority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { generateKeyBetween } from "fractional-indexing";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "password123"; // dev only

function doc(text: string) {
  // Minimal valid Tiptap JSON document
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function rankSeq(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null);
    out.push(prev);
  }
  return out;
}

async function main() {
  console.log("Seeding…");

  // Idempotency: remove previous demo data
  await prisma.workspace.deleteMany({ where: { slug: "demo" } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@demo.local" } } });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const [alice, bob, chai, dao] = await Promise.all(
    [
      { email: "alice@demo.local", name: "Alice Owner" },
      { email: "bob@demo.local", name: "Bob Admin" },
      { email: "chai@demo.local", name: "Chai Member" },
      { email: "dao@demo.local", name: "Dao Viewer" },
    ].map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  );

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      slug: "demo",
      memberships: {
        create: [
          { userId: alice.id, role: "OWNER" },
          { userId: bob.id, role: "ADMIN" },
          { userId: chai.id, role: "MEMBER" },
          { userId: dao.id, role: "VIEWER" },
        ],
      },
    },
  });

  // ----- Project + default statuses (To Do / In Progress / Done) -----
  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      key: "DEMO",
      name: "Demo Project",
      description: "Seeded project for local development",
      members: {
        create: [
          { userId: alice.id, role: "ADMIN" },
          { userId: bob.id, role: "ADMIN" },
          { userId: chai.id, role: "MEMBER" },
          { userId: dao.id, role: "VIEWER" },
        ],
      },
    },
  });

  const [todo, inProgress, done] = await Promise.all([
    prisma.status.create({
      data: { projectId: project.id, name: "To Do", category: "TODO", position: 0 },
    }),
    prisma.status.create({
      data: { projectId: project.id, name: "In Progress", category: "IN_PROGRESS", position: 1 },
    }),
    prisma.status.create({
      data: { projectId: project.id, name: "Done", category: "DONE", position: 2 },
    }),
  ]);

  // ----- 25 issues across types/statuses/assignees -----
  const people = [alice, bob, chai, dao];
  const statuses = [todo, todo, inProgress, done]; // weight toward To Do
  const types: IssueType[] = ["TASK", "TASK", "STORY", "BUG", "EPIC"];
  const priorities: IssuePriority[] = ["HIGHEST", "HIGH", "MEDIUM", "MEDIUM", "LOW"];
  const titles = [
    "Set up project charter",
    "Design login screen",
    "Fix header overlap on mobile",
    "Write onboarding checklist",
    "Investigate slow dashboard query",
    "Draft Q3 report outline",
    "Update dependency versions",
    "Add empty-state illustrations",
    "Refactor notification service",
    "Prepare demo environment",
  ];

  const ranks = rankSeq(25);
  let counter = 0;
  for (let i = 0; i < 25; i++) {
    counter += 1;
    await prisma.issue.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        number: counter,
        type: types[i % types.length],
        title: `${titles[i % titles.length]} #${i + 1}`,
        description: doc(`Seeded issue ${i + 1} — replace with real work.`),
        statusId: statuses[i % statuses.length].id,
        priority: priorities[i % priorities.length],
        assigneeId: i % 4 === 3 ? null : people[i % people.length].id,
        reporterId: people[(i + 1) % people.length].id,
        storyPoints: i % 3 === 0 ? ((i % 5) + 1) : null,
        rank: ranks[i],
      },
    });
  }
  await prisma.project.update({
    where: { id: project.id },
    data: { issueCounter: counter },
  });

  // ----- Space + 8 pages in a 3-level tree -----
  const space = await prisma.space.create({
    data: {
      workspaceId: workspace.id,
      key: "TEAM",
      name: "Team Handbook",
      description: "Seeded space for local development",
    },
  });

  const pRanks = rankSeq(8);
  const mkPage = (title: string, rank: string, parentId: string | null = null) =>
    prisma.page.create({
      data: {
        workspaceId: workspace.id,
        spaceId: space.id,
        parentId,
        title,
        content: doc(`${title} — seeded content.`),
        rank,
        createdBy: alice.id,
        updatedBy: alice.id,
        versions: {
          create: { version: 1, title, content: doc(`${title} — seeded content.`), authorId: alice.id },
        },
      },
    });

  const home = await mkPage("Welcome", pRanks[0]);
  const eng = await mkPage("Engineering", pRanks[1]);
  const hr = await mkPage("People & Culture", pRanks[2]);
  await mkPage("Getting started", pRanks[3], home.id);
  const standards = await mkPage("Coding standards", pRanks[4], eng.id);
  await mkPage("Release process", pRanks[5], eng.id);
  await mkPage("TypeScript style", pRanks[6], standards.id); // level 3
  await mkPage("Leave policy", pRanks[7], hr.id);

  console.log("Seed complete:");
  console.log("  Workspace: Demo Workspace (slug: demo)");
  console.log("  Users (password: password123):");
  console.log("    alice@demo.local (OWNER), bob@demo.local (ADMIN)");
  console.log("    chai@demo.local (MEMBER), dao@demo.local (VIEWER)");
  console.log("  Project DEMO: 25 issues · Space TEAM: 8 pages");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
