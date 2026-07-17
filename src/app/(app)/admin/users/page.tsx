import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { grantAccessAction, changeUserRoleAction, revokeAccessAction } from "./actions";
import { DeleteUserButton } from "./DeleteUserButton";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_BADGE: Record<WorkspaceRole, string> = {
  OWNER:  "bg-violet-100 text-violet-800 border border-violet-200",
  ADMIN:  "bg-blue-100   text-blue-800   border border-blue-200",
  MEMBER: "bg-gray-100   text-gray-700   border border-gray-200",
  VIEWER: "bg-amber-50   text-amber-700  border border-amber-200",
};

function roleBadge(role: WorkspaceRole | null) {
  if (!role) return <span className="rounded-full bg-gray-50 border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-400">No Access</span>;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ROLE_BADGE[role]}`}>{role}</span>;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default async function AdminUsersPage() {
  const me = await requireUser();
  const { active } = await getActiveWorkspace(me.id);
  if (!active) redirect("/");

  // Super-admin guard — only OWNER can see this page
  const myMembership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: me.id, workspaceId: active.id } },
  });
  if (myMembership?.role !== "OWNER") redirect("/settings");

  // All users in the system + their membership in this workspace
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        where: { workspaceId: active.id },
        select: { role: true },
      },
    },
  });

  const withRole = users.map((u) => ({
    ...u,
    role: (u.memberships[0]?.role ?? null) as WorkspaceRole | null,
    isMe: u.id === me.id,
  }));

  const totalUsers    = withRole.length;
  const withAccess    = withRole.filter((u) => u.role !== null).length;
  const withoutAccess = totalUsers - withAccess;
  const owners        = withRole.filter((u) => u.role === "OWNER").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Admin · Super Admin</p>
        <h1 className="mt-1 font-heading text-2xl font-extrabold text-ink">User Management</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          All accounts in the system — grant, adjust, or revoke workspace access.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total accounts", value: totalUsers },
          { label: "Have access",    value: withAccess,    tone: "text-emerald-700" },
          { label: "No access",      value: withoutAccess, tone: withoutAccess > 0 ? "text-amber-600" : "text-gray-400" },
          { label: "Owners",         value: owners,        tone: "text-violet-700" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{s.label}</p>
            <p className={`mt-1 font-heading text-2xl font-extrabold ${s.tone ?? "text-ink"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* User table */}
      <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
        <div className="border-b border-card-border bg-page/60 px-5 py-3 text-[11px] font-extrabold uppercase tracking-wider text-ink-secondary">
          {totalUsers} accounts
        </div>

        <div className="divide-y divide-card-border">
          {withRole.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt={u.name} className="h-9 w-9 rounded-full object-cover" />
                  : initials(u.name)}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{u.name}</span>
                  {u.isMe && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">You</span>
                  )}
                  {roleBadge(u.role)}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-secondary">{u.email}</p>
                <p className="mt-0.5 text-[11px] text-ink-secondary/60">
                  Joined {formatDate(u.createdAt)} · Last active {formatDate(u.updatedAt)}
                </p>
              </div>

              {/* Actions */}
              {!u.isMe && (
                <div className="flex flex-wrap items-center gap-2">
                  {u.role === null ? (
                    /* Grant access */
                    <form action={grantAccessAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue="MEMBER"
                        className="rounded-lg border border-card-border bg-page px-2 py-1.5 text-xs font-semibold text-ink focus:outline-none"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                      >
                        Grant Access
                      </button>
                    </form>
                  ) : u.role !== "OWNER" ? (
                    <>
                      {/* Change role */}
                      <form action={changeUserRoleAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="rounded-lg border border-card-border bg-page px-2 py-1.5 text-xs font-semibold text-ink focus:outline-none"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Member</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-bold text-ink hover:border-accent hover:text-accent"
                        >
                          Change Role
                        </button>
                      </form>

                      {/* Revoke access */}
                      <form action={revokeAccessAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-bold text-amber-600 hover:border-amber-400 hover:bg-amber-50"
                        >
                          Revoke Access
                        </button>
                      </form>

                      {/* Delete user */}
                      <DeleteUserButton userId={u.id} name={u.name} />
                    </>
                  ) : (
                    <span className="text-xs text-ink-secondary/50">Protected — Owner</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
