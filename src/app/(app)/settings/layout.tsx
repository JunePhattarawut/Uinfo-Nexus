import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { SettingsSidebarNav } from "./SettingsSidebarNav";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);

  const membership = active
    ? await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: active.id } },
        select: { role: true },
      })
    : null;

  const isOwner = membership?.role === "OWNER";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-secondary">
          Manage your profile, workspace, and members.
        </p>
      </div>

      <div className="flex gap-6">
        <aside className="w-48 shrink-0">
          <SettingsSidebarNav isOwner={isOwner} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
