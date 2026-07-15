import { createServer } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as adv from "@/modules/advanced/service";
import * as issueService from "@/modules/issue/service";

const hasDb = Boolean(process.env.DATABASE_URL);
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null;
const prisma = hasDb ? new PrismaClient({ adapter: adapter! }) : null;

describe.skipIf(!hasDb)("M5 advanced features", () => {
  let ownerId = "";
  let reporterId = "";
  let workspaceId = "";
  let projectId = "";
  let todoStatus = "";
  let doneStatus = "";
  let issueId = "";

  beforeAll(async () => {
    const stamp = Date.now();
    const owner = await prisma!.user.create({ data: { email: `m5-owner-${stamp}@m5.local`, name: "Owner", passwordHash: "x" } });
    const reporter = await prisma!.user.create({ data: { email: `m5-reporter-${stamp}@m5.local`, name: "Reporter", passwordHash: "x" } });
    ownerId = owner.id; reporterId = reporter.id;
    const ws = await prisma!.workspace.create({ data: { name: "M5 WS", slug: `m5-${stamp}`, memberships: { create: [{ userId: ownerId, role: "OWNER" }, { userId: reporterId, role: "MEMBER" }] } } });
    workspaceId = ws.id;
    const project = await prisma!.project.create({ data: { workspaceId, key: "M5", name: "M5 Project", members: { create: [{ userId: ownerId, role: "ADMIN" }] }, statuses: { create: [{ name: "To Do", category: "TODO", position: 1 }, { name: "Done", category: "DONE", position: 2 }] } }, include: { statuses: true } });
    projectId = project.id;
    todoStatus = project.statuses.find((s) => s.category === "TODO")!.id;
    doneStatus = project.statuses.find((s) => s.category === "DONE")!.id;
    const issue = await prisma!.issue.create({ data: { workspaceId, projectId, number: 1, title: "M5 issue", reporterId, statusId: todoStatus, rank: "a0", storyPoints: 5 } });
    issueId = issue.id;
  });

  afterAll(async () => {
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: { in: [ownerId, reporterId] } } });
    await prisma!.$disconnect();
  });

  it("stores saved filters and creates/updates custom statuses", async () => {
    const filter = await adv.createSavedFilter(ownerId, workspaceId, { projectId, name: "My bugs", scope: "WORKSPACE", filters: { type: "BUG" } });
    const status = await adv.createStatus(ownerId, workspaceId, projectId, { name: "QA", category: "IN_PROGRESS" });
    const updated = await adv.updateStatus(ownerId, workspaceId, projectId, status.id, { name: "In Review", category: "IN_PROGRESS" });
    expect(filter.name).toBe("My bugs");
    expect(status.position).toBeGreaterThan(2);
    expect(updated.name).toBe("In Review");
    expect(updated.category).toBe("IN_PROGRESS");
  });

  it("reports sprint metrics", async () => {
    const sprint = await prisma!.sprint.create({ data: { projectId, name: "Sprint 1", state: "ACTIVE", issues: { connect: [{ id: issueId }] } } });
    const metrics = await adv.sprintMetrics(ownerId, workspaceId, projectId);
    expect(metrics.find((m) => m.id === sprint.id)?.remaining).toBe(5);
  });

  it("reports search operations status without requiring an external cluster", async () => {
    const status = await adv.searchOperationsStatus(ownerId, workspaceId);
    expect(status.backend).toBeTruthy();
    expect(status.index).toBeTruthy();
    expect(status.documentCount).toBeGreaterThanOrEqual(2);
    expect(status.counts.project).toBeGreaterThanOrEqual(1);
    expect(status.counts.issue).toBeGreaterThanOrEqual(1);
  });

  it("creates automation, queues reporter notification, and posts signed webhook delivery", async () => {
    const received = new Promise<{ headers: Record<string, string | string[] | undefined>; body: string }>((resolve) => {
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        req.on("end", () => {
          res.writeHead(202, { "content-type": "text/plain" });
          res.end("accepted");
          server.close();
          resolve({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        });
      });
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No local webhook port");
        await adv.createAutomation(ownerId, workspaceId, { name: "Notify reporter when done", trigger: "issue.status.done", action: "notify.reporter", enabled: true });
        await adv.createWebhook(ownerId, workspaceId, { name: "Issue hook", url: `http://127.0.0.1:${address.port}/hook`, events: ["issue.updated"], secret: "test-secret" });
        await issueService.updateIssue(ownerId, workspaceId, issueId, { statusId: doneStatus });
        await adv.deliverPendingWebhooks(ownerId, workspaceId);
      });
    });

    const request = await received;
    const notification = await prisma!.notification.findFirst({ where: { workspaceId, userId: reporterId, type: "automation.issue_done" } });
    const delivery = await prisma!.webhookDelivery.findFirst({ where: { webhook: { workspaceId }, event: "issue.updated" }, orderBy: { createdAt: "desc" } });
    const body = JSON.parse(request.body);

    expect(notification).toBeTruthy();
    expect(delivery?.status).toBe("DELIVERED");
    expect(delivery?.attempts).toBeGreaterThanOrEqual(1);
    expect(delivery?.response).toContain("202 Accepted");
    expect(request.headers["x-workhub-event"]).toBe("issue.updated");
    expect(request.headers["x-workhub-delivery"]).toBe(delivery?.id);
    expect(String(request.headers["x-workhub-signature"])).toMatch(/^sha256=/);
    expect(body.event).toBe("issue.updated");
    expect(body.workspaceId).toBe(workspaceId);
  });
});
