import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});

/** Session guard for server components / route handlers. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    const { AppError } = await import("@/lib/errors");
    throw new AppError("UNAUTHORIZED", "Sign in required");
  }

  // Auth.js uses a JWT session. During local seed/rollback work the DB can be
  // restored while the browser still has an old JWT containing a stale user id.
  // Resolve the live DB user first so workspace membership checks use current ids.
  const liveUser =
    (await prisma.user.findUnique({ where: { id: session.user.id } })) ??
    (session.user.email ? await prisma.user.findUnique({ where: { email: session.user.email.toLowerCase() } }) : null);

  return {
    id: liveUser?.id ?? session.user.id,
    email: liveUser?.email ?? session.user.email ?? "",
    name: liveUser?.name ?? session.user.name ?? "",
  };
}
