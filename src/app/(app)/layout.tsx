import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { unreadNotificationCount } from "@/lib/notifications";
import { getUserRole } from "@/lib/rbac";
import { can } from "@/lib/permissions";
import { AppSidebar } from "@/components/AppSidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);

  const [projects, spaces] = active
    ? await Promise.all([
        prisma.project.findMany({
          where: { workspaceId: active.id },
          orderBy: { updatedAt: "desc" },
          select: { id: true, key: true, name: true, _count: { select: { issues: true } } },
        }),
        prisma.space.findMany({
          where: { workspaceId: active.id },
          orderBy: { name: "asc" },
          select: { id: true, key: true, name: true, iconEmoji: true },
        }),
      ])
    : [[], []];

  const role = active ? await getUserRole(user.id, active.id) : null;
  const notificationCount = active ? await unreadNotificationCount(user.id, active.id) : 0;
  const canCreate = can(role, "issue:create");
  const canAdmin  = can(role, "admin:access");
  const createHref = "/create";

  return (
    <div className="flex min-h-screen bg-page">
      <AppSidebar
        projects={projects}
        spaces={spaces}
        userEmail={user.email}
        notificationCount={notificationCount}
        canAdmin={canAdmin}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[68px] items-center gap-4 border-b border-card-border bg-card px-7">
          <form action="/search" className="flex max-w-[560px] flex-1 items-center gap-2.5 rounded-[9px] border border-card-border bg-page px-3.5 py-[9px]">
            <span className="text-[15px] text-ink-secondary">⌕</span>
            <input name="q" placeholder="Search Uinfo Nexus" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none" />
          </form>
          <div className="flex-1" />
          {canCreate && (
            <Link href={createHref} className="rounded-lg bg-accent px-[18px] py-[9px] font-heading text-[13.5px] font-bold text-white hover:opacity-90">＋ Create</Link>
          )}
          <Link href="/notifications" className="relative rounded-lg p-2 text-lg hover:bg-page" title="Notifications">
            🔔{notificationCount ? <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-[#d9534f]" /> : null}
          </Link>
          <Link href="/settings" className="rounded-lg p-2 text-lg hover:bg-page" title="Settings">⚙</Link>
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#1c5e4a] text-sm font-bold text-white">{user.email?.[0]?.toUpperCase() ?? "U"}</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
