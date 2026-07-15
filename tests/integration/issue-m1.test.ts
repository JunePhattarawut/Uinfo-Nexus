import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as issueService from "@/modules/issue/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null;
const prisma = hasDb ? new PrismaClient({ adapter: adapter! }) : null;

describe.skipIf(!hasDb)("M1 issue workflow", () => {
  let userId = "";
  let workspaceId = "";
  let projectId = "";
  let statusTodo = "";
  let statusDoing = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const user = await prisma!.user.create({ data: { email: `m1-${stamp}@m1.local`, name: "M1 User", passwordHash: "x" } });
    userId = user.id;
    const ws = await prisma!.workspace.create({ data: { name: "M1 WS", slug: `m1-${stamp}`, memberships: { create: { userId, role: "OWNER" } } } });
    workspaceId = ws.id;
    const project = await prisma!.project.create({ data: { workspaceId, key: "M1", name: "M1 Project", members: { create: { userId, role: "ADMIN" } } } });
    projectId = project.id;
    const todo = await prisma!.status.create({ data: { projectId, name: "To Do", category: "TODO", position: 0 } });
    const doing = await prisma!.status.create({ data: { projectId, name: "Doing", category: "IN_PROGRESS", position: 1 } });
    statusTodo = todo.id;
    statusDoing = doing.id;
  });

  afterAll(async () => {
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: userId } });
    await prisma!.$disconnect();
  });

  it("concurrently creates unique project issue numbers", async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        issueService.createIssue(userId, workspaceId, {
          projectId,
          title: `Concurrent ${i}`,
          descriptionText: "",
          type: "TASK",
          priority: "MEDIUM",
          statusId: statusTodo,
          assigneeId: null,
          labels: [],
        }),
      ),
    );
    const numbers = created.map((x) => x.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("moves an issue to another status and persists rank/status", async () => {
    const issue = await issueService.createIssue(userId, workspaceId, {
      projectId,
      title: "Move me",
      descriptionText: "",
      type: "BUG",
      priority: "HIGH",
      statusId: statusTodo,
      assigneeId: null,
      labels: ["qa"],
    });
    await issueService.moveIssue(userId, workspaceId, issue.id, { statusId: statusDoing });
    const stored = await prisma!.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(stored.statusId).toBe(statusDoing);
    expect(stored.rank).toBeTruthy();
  });

  it("comments and updates activity log", async () => {
    const issue = await issueService.createIssue(userId, workspaceId, {
      projectId,
      title: "Comment me",
      descriptionText: "",
      type: "TASK",
      priority: "LOW",
      statusId: statusTodo,
      assigneeId: null,
      labels: [],
    });
    await issueService.addComment(userId, workspaceId, issue.id, { bodyText: "Looks good" });
    const [comments, activity] = await Promise.all([
      prisma!.comment.count({ where: { issueId: issue.id } }),
      prisma!.activityLog.findMany({ where: { entityType: "issue", entityId: issue.id } }),
    ]);
    expect(comments).toBe(1);
    expect(activity.map((x) => x.action)).toContain("commented");
  });
});
