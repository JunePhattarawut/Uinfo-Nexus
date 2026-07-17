import { Fragment } from "react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { inviteMemberAction, changeMemberRoleAction, removeMemberAction } from "./actions";
import { can, ROLE_META, ROLE_ORDER, type Permission } from "@/lib/permissions";

// Grouped permission matrix for display
const PERMISSION_GROUPS: { group: string; rows: { label: string; permission: Permission }[] }[] = [
  {
    group: "Workspace",
    rows: [
      { label: "View workspace",      permission: "workspace:view" },
      { label: "Edit workspace name", permission: "workspace:edit" },
      { label: "Delete workspace",    permission: "workspace:delete" },
    ],
  },
  {
    group: "Members",
    rows: [
      { label: "Invite members",      permission: "members:invite" },
      { label: "Change member roles", permission: "members:changeRole" },
      { label: "Remove members",      permission: "members:remove" },
    ],
  },
  {
    group: "Projects",
    rows: [
      { label: "Create projects",     permission: "project:create" },
      { label: "Edit project settings", permission: "project:edit" },
      { label: "Delete projects",     permission: "project:delete" },
    ],
  },
  {
    group: "Issues",
    rows: [
      { label: "Create issues",       permission: "issue:create" },
      { label: "Edit issues",         permission: "issue:edit" },
      { label: "Delete issues",       permission: "issue:delete" },
      { label: "Comment on issues",   permission: "issue:comment" },
    ],
  },
  {
    group: "Spaces & Pages",
    rows: [
      { label: "Create spaces",       permission: "space:create" },
      { label: "Delete spaces",       permission: "space:delete" },
      { label: "Create pages",        permission: "page:create" },
      { label: "Edit pages",          permission: "page:edit" },
      { label: "Delete pages",        permission: "page:delete" },
    ],
  },
  {
    group: "Admin",
    rows: [
      { label: "Access admin panel",  permission: "admin:access" },
      { label: "Manage all users",    permission: "admin:users" },
    ],
  },
];

const ROLE_BADGE: Record<string, string> = {
  OWNER:  "bg-amber-50  text-amber-700  ring-amber-200",
  ADMIN:  "bg-blue-50   text-blue-700   ring-blue-200",
  MEMBER: "bg-gray-100  text-gray-700   ring-gray-200",
  VIEWER: "bg-green-50  text-green-700  ring-green-200",
};

export default async function MembersSettingsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p className="text-sm text-ink-secondary">No active workspace.</p>;

  const members = await prisma.membership.findMany({
    where: { workspaceId: active.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  const myRole = members.find((m) => m.userId === user.id)?.role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | undefined;
  const isOwner  = myRole === "OWNER";
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  return (
    <div className="space-y-6">
      {/* Invite */}
      {canManage && (
        <section className="rounded-2xl border border-card-border bg-card p-6">
          <h2 className="mb-1 text-[15px] font-semibold text-ink">Invite member</h2>
          <p className="mb-4 text-[13px] text-ink-secondary">
            Enter the email of the person you want to add to this workspace.
          </p>
          <form action={inviteMemberAction} className="flex flex-wrap gap-2">
            <input
              name="email"
              type="email"
              required
              placeholder="name@company.com"
              className="flex-1 min-w-52 rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <select
              name="role"
              defaultValue="MEMBER"
              className="rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {isOwner && <option value="OWNER">Owner</option>}
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              Invite
            </button>
          </form>
        </section>
      )}

      {/* Permission Matrix */}
      <section className="rounded-2xl border border-card-border bg-card overflow-hidden">
        <div className="border-b border-card-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Permission Matrix</h2>
          <p className="mt-0.5 text-[12px] text-ink-secondary">
            What each role can do in this workspace.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-card-border bg-page/60">
                <th className="px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-ink-secondary w-1/2">
                  Action
                </th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} className="px-3 py-3 text-center text-[11px] font-extrabold uppercase tracking-wider text-ink-secondary">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 ${ROLE_META[role].color}`}>
                      {ROLE_META[role].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.group}>
                  <tr className="bg-page/40 border-t border-card-border">
                    <td
                      colSpan={ROLE_ORDER.length + 1}
                      className="px-5 py-2 text-[10.5px] font-extrabold uppercase tracking-widest text-ink-secondary/60"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.permission} className="border-t border-card-border/50 hover:bg-page/30 transition-colors">
                      <td className="px-5 py-2.5 text-[13px] text-ink">{row.label}</td>
                      {ROLE_ORDER.map((role) => (
                        <td key={role} className="px-3 py-2.5 text-center">
                          {can(role, row.permission) ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-300 text-[11px]">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Members list */}
      <section className="rounded-2xl border border-card-border bg-card overflow-hidden">
        <div className="border-b border-card-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">
            Members <span className="ml-1.5 rounded-full bg-page px-2 py-0.5 text-[12px] font-semibold text-ink-secondary">{members.length}</span>
          </h2>
        </div>
        <ul className="divide-y divide-card-border">
          {members.map((m) => {
            const isMe = m.userId === user.id;
            const memberIsOwner = m.role === "OWNER";
            // OWNER can manage everyone except themselves
            // ADMIN can manage MEMBER/VIEWER only
            const canEditThis = canManage && !isMe && (isOwner || !memberIsOwner);
            const initials = (m.user.name?.[0] ?? m.user.email[0]).toUpperCase();
            return (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                {/* Avatar */}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">
                  {initials}
                </span>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">
                    {m.user.name ?? m.user.email}
                    {isMe && <span className="ml-1.5 text-[11px] font-medium text-ink-secondary">(you)</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-secondary">{m.user.email}</p>
                </div>

                {/* Role badge */}
                <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${ROLE_BADGE[m.role] ?? ROLE_BADGE.MEMBER}`}>
                  {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
                </span>

                {/* Role change */}
                {canEditThis && (
                  <form action={changeMemberRoleAction} className="flex items-center gap-1">
                    <input type="hidden" name="memberId" value={m.id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded-md border border-card-border bg-page px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
                    >
                      {isOwner && <option value="OWNER">Owner</option>}
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-card-border bg-page px-2 py-1 text-[11.5px] font-semibold text-ink-secondary hover:bg-accent hover:text-white hover:border-accent"
                    >
                      Save
                    </button>
                  </form>
                )}

                {/* Remove */}
                {canEditThis && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1 text-[12px] text-ink-secondary hover:bg-red-50 hover:text-red-600"
                      title="Remove member"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
