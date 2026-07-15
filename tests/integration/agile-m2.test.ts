import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as agile from "@/modules/agile/service";
import * as issueService from "@/modules/issue/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null;
const prisma = hasDb ? new PrismaClient({ adapter: adapter! }) : null;

describe.skipIf(!hasDb)("M2 agile workflow", () => {
  let userId = "";
  let workspaceId = "";
  let projectId = "";
  let todoId = "";
  let doneId = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const user = await prisma!.user.create({ data: { email: `m2-${stamp}@m2.local`, name: "M2 User", passwordHash: "x" } });
    userId = user.id;
    const ws = await prisma!.workspace.create({ data: { name: "M2 WS", slug: `m2-${stamp}`, memberships: { create: { userId, role: "OWNER" } } } });
    workspaceId = ws.id;
    const project = await prisma!.project.create({ data: { workspaceId, key: "M2", name: "M2 Project", members: { create: { userId, role: "ADMIN" } } } });
    projectId = project.id;
    const todo = await prisma!.status.create({ data: { projectId, name: "To Do", category: "TODO", position: 0 } });
    const done = await prisma!.status.create({ data: { projectId, name: "Done", category: "DONE", position: 1 } });
    todoId = todo.id;
    doneId = done.id;
  });

  afterAll(async () => {
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: userId } });
    await prisma!.$disconnect();
  });

  it("runs full sprint cycle and returns incomplete issues to backlog", async () => {
    const sprint = await agile.createSprint(userId, workspaceId, { projectId, name: "Sprint 1", goal: "ship", startDate: null, endDate: null });
    const issueA = await issueService.createIssue(userId, workspaceId, { projectId, title: "Done item", descriptionText: "", type: "TASK", priority: "MEDIUM", statusId: doneId, assigneeId: null, labels: [], storyPoints: 3 });
    const issueB = await issueService.createIssue(userId, workspaceId, { projectId, title: "Todo item", descriptionText: "", type: "TASK", priority: "MEDIUM", statusId: todoId, assigneeId: null, labels: [], storyPoints: 5 });
    await agile.moveIssueToSprint(userId, workspaceId, { issueId: issueA.id, sprintId: sprint.id });
    await agile.moveIssueToSprint(userId, workspaceId, { issueId: issueB.id, sprintId: sprint.id });
    await agile.startSprint(userId, workspaceId, sprint.id);
    const result = await agile.completeSprint(userId, workspaceId, sprint.id);
    const [storedA, storedB, storedSprint] = await Promise.all([
      prisma!.issue.findUniqueOrThrow({ where: { id: issueA.id } }),
      prisma!.issue.findUniqueOrThrow({ where: { id: issueB.id } }),
      prisma!.sprint.findUniqueOrThrow({ where: { id: sprint.id } }),
    ]);
    expect(result.returnedToBacklog).toBe(1);
    expect(storedSprint.state).toBe("CLOSED");
    expect(storedA.sprintId).toBe(sprint.id);
    expect(storedB.sprintId).toBeNull();
  });

  it("prevents two active sprints in one project", async () => {
    const s1 = await agile.createSprint(userId, workspaceId, { projectId, name: "Sprint A", goal: "", startDate: null, endDate: null });
    const s2 = await agile.createSprint(userId, workspaceId, { projectId, name: "Sprint B", goal: "", startDate: null, endDate: null });
    await agile.startSprint(userId, workspaceId, s1.id);
    await expect(agile.startSprint(userId, workspaceId, s2.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("computes sprint point totals and epic rollups", async () => {
    const sprint = await agile.createSprint(userId, workspaceId, { projectId, name: "Sprint Points", goal: "", startDate: null, endDate: null });
    const epic = await issueService.createIssue(userId, workspaceId, { projectId, title: "Epic", descriptionText: "", type: "EPIC", priority: "MEDIUM", statusId: todoId, assigneeId: null, labels: [] });
    const child = await issueService.createIssue(userId, workspaceId, { projectId, title: "Child", descriptionText: "", type: "STORY", priority: "MEDIUM", statusId: doneId, assigneeId: null, labels: [], storyPoints: 8 });
    await prisma!.issue.update({ where: { id: child.id }, data: { parentId: epic.id } });
    await agile.moveIssueToSprint(userId, workspaceId, { issueId: child.id, sprintId: sprint.id });
    const board = await agile.getAgileBoard(userId, workspaceId, "M2");
    expect(board.sprintTotals.get(sprint.id)).toBe(8);
    const rollup = board.epicRollups.find((x) => x.epic.id === epic.id)!;
    expect(rollup.totalChildren).toBe(1);
    expect(rollup.doneChildren).toBe(1);
  });
});
