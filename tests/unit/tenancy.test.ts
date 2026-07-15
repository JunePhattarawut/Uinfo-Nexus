// M0 DoD: a user in workspace A cannot reach workspace B data.
// Unit level: requireMembership must throw NOT_FOUND for non-members
// (never FORBIDDEN — existence must not leak) and enforce role ordering.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { membership: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { requireMembership, roleAtLeast } from "@/lib/tenancy";
import { AppError } from "@/lib/errors";

const findUnique = prisma.membership.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("requireMembership (tenancy guard)", () => {
  beforeEach(() => findUnique.mockReset());

  it("throws NOT_FOUND when user is not a member (workspace existence must not leak)", async () => {
    findUnique.mockResolvedValue(null);
    const err = await requireMembership("user-a", "workspace-b").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("throws FORBIDDEN when role is below the minimum", async () => {
    findUnique.mockResolvedValue({ role: "VIEWER" });
    const err = await requireMembership("user-a", "workspace-a", "ADMIN").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("passes for a member with sufficient role", async () => {
    findUnique.mockResolvedValue({ role: "ADMIN" });
    await expect(requireMembership("user-a", "workspace-a", "MEMBER")).resolves.toMatchObject({
      role: "ADMIN",
    });
  });

  it("orders roles OWNER > ADMIN > MEMBER > VIEWER", () => {
    expect(roleAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
  });
});
