import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Returns true if the email is on the configured allowlist. */
function isEmailAllowed(email: string): boolean {
  const normalised = email.toLowerCase();

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  // If no restrictions configured → open to any Google account
  if (allowedEmails.length === 0 && allowedDomains.length === 0) return true;

  if (allowedEmails.includes(normalised)) return true;
  if (allowedDomains.some((d) => normalised.endsWith(`@${d}`))) return true;

  return false;
}

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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Only apply allowlist check for Google OAuth
      if (account?.provider === "google") {
        const email = (user.email ?? "").toLowerCase();

        if (!isEmailAllowed(email)) return false;

        // Find or auto-create the DB user on first Google login
        let dbUser = await prisma.user.findUnique({ where: { email } });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email,
              name: user.name ?? email.split("@")[0] ?? "User",
              passwordHash: "", // Google users have no password
              avatarUrl: user.image ?? null,
            },
          });
        } else if (user.image && !dbUser.avatarUrl) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { avatarUrl: user.image },
          });
        }

        // Auto-promote SUPER_ADMIN_EMAIL to OWNER on every login
        const superAdmin = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase();
        if (superAdmin && email === superAdmin) {
          const workspace = await prisma.workspace.findFirst();
          if (workspace) {
            await prisma.membership.upsert({
              where: { userId_workspaceId: { userId: dbUser.id, workspaceId: workspace.id } },
              update: { role: "OWNER" },
              create: { userId: dbUser.id, workspaceId: workspace.id, role: "OWNER" },
            });
          }
        }

        // Store DB id so the jwt callback can persist it in the token
        user.id = dbUser.id;
      }
      return true;
    },
  },
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
