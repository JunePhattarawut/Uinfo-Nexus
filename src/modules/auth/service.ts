import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Creates user + personal workspace + OWNER membership in one transaction. */
export async function registerUser(input: RegisterInput) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const slug = `ws-${Math.random().toString(36).slice(2, 10)}`;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: input.name, passwordHash },
    });
    await tx.workspace.create({
      data: {
        name: `${input.name}'s workspace`,
        slug,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    return user;
  });
}
