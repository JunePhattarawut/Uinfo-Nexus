// M0 DoD integration test: cross-workspace isolation against a real database.
// Runs only when DATABASE_URL is set (CI provides a postgres service).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("workspace isolation (integration)", () => {
  let prisma: (typeof import("@/lib/db"))["prisma"];
  let userA: { id: string };
  let userB: { id: string };
  let workspaceB: { id: string };

  beforeAll(async () => {
    prisma = (await import("@/lib/db")).prisma;
    const stamp = Date.now();
    userA = await prisma.user.create({
      data: { email: `iso-a-${stamp}@test.local`, name: "Iso A", passwordHash: "x" },
    });
    userB = await prisma.user.create({
      data: { email: `iso-b-${stamp}@test.local`, name: "Iso B", passwordHash: "x" },
    });
    workspaceB = await prisma.workspace.create({
      data: {
        name: "Iso B WS",
        slug: `iso-b-${stamp}`,
        memberships: { create: { userId: userB.id, role: "OWNER" } },
      },
    });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: { startsWith: "iso-b-" } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@test.local" } } });
    await prisma.$disconnect();
  });

  it("repo scoping: user A cannot fetch workspace B by id", async () => {
    const repo = await import("@/modules/workspace/repo");
    const result = await repo.findWorkspaceForUser(userA.id, workspaceB.id);
    expect(result).toBeNull();
  });

  it("service: getWorkspace throws NOT_FOUND for non-member", async () => {
    const service = await import("@/modules/workspace/service");
    const { AppError } = await import("@/lib/errors");
    const err = await service.getWorkspace(userA.id, workspaceB.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("service: listMembers denies non-member with NOT_FOUND", async () => {
    const service = await import("@/modules/workspace/service");
    const { AppError } = await import("@/lib/errors");
    const err = await service.listMembers(userA.id, workspaceB.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});
