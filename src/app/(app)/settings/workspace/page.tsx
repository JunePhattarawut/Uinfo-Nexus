import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { updateWorkspaceAction } from "./actions";

export default async function WorkspaceSettingsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p className="text-sm text-ink-secondary">No active workspace.</p>;

  const projectCount = await prisma.project.count({ where: { workspaceId: active.id } });
  const spaceCount = await prisma.space.count({ where: { workspaceId: active.id } });
  const memberCount = await prisma.membership.count({ where: { workspaceId: active.id } });

  return (
    <div className="space-y-6">
      {/* General */}
      <section className="rounded-2xl border border-card-border bg-card p-6">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">General</h2>

        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: "Projects", value: projectCount },
            { label: "Spaces", value: spaceCount },
            { label: "Members", value: memberCount },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-card-border bg-page p-3 text-center">
              <p className="text-2xl font-bold text-ink">{stat.value}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-secondary">{stat.label}</p>
            </div>
          ))}
        </div>

        <form action={updateWorkspaceAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-[13px] font-medium text-ink">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={active.name}
              required
              className="w-full max-w-sm rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink">URL slug</label>
            <input
              value={active.slug}
              disabled
              readOnly
              className="w-full max-w-sm rounded-lg border border-card-border bg-card-border/30 px-3 py-2 text-sm font-mono text-ink-secondary"
            />
            <p className="mt-1 text-[11.5px] text-ink-secondary">Slug cannot be changed after creation.</p>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* Workspace ID */}
      <section className="rounded-2xl border border-card-border bg-card p-6">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Workspace ID</h2>
        <code className="block rounded-lg border border-card-border bg-page px-3 py-2 text-[12px] font-mono text-ink-secondary">
          {active.id}
        </code>
        <p className="mt-2 text-[11.5px] text-ink-secondary">
          Use this ID when working with the API or Jira migration tool.
        </p>
      </section>
    </div>
  );
}
