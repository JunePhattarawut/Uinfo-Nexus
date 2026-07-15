import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { createProjectAction } from "./actions";

const TEMPLATES = [
  { key: "kanban", name: "Kanban", description: "Plane-like board flow with To Do, In Progress, and Done.", icon: "▥" },
  { key: "scrum", name: "Scrum", description: "Backlog-ready workflow with Selected for Development.", icon: "◷" },
  { key: "task", name: "Task tracking", description: "Simple task workflow for small operational teams.", icon: "☑" },
  { key: "bug", name: "Bug tracking", description: "Open, triage, fix, and resolve defects.", icon: "⚑" },
  { key: "imported", name: "Imported Jira style", description: "Review-ready workflow for migrated governance projects.", icon: "▦" },
];

const VISUAL_OPTIONS = [
  { theme: "nexus", coverColor: "blue", name: "Nexus blue", className: "bg-accent", cover: "linear-gradient(135deg,#3357d6,#7b8cff 48%,#eef1fc)", icon: "▦" },
  { theme: "risk", coverColor: "green", name: "Risk green", className: "bg-emerald-600", cover: "linear-gradient(135deg,#0f766e,#34d399 48%,#ecfdf5)", icon: "🛡️" },
  { theme: "review", coverColor: "amber", name: "Review amber", className: "bg-amber-500", cover: "linear-gradient(135deg,#b45309,#f59e0b 48%,#fffbeb)", icon: "📋" },
  { theme: "ops", coverColor: "violet", name: "Ops violet", className: "bg-violet-600", cover: "linear-gradient(135deg,#6d28d9,#8b5cf6 48%,#f5f3ff)", icon: "⚙️" },
];

const ICON_OPTIONS = ["▦", "🛡️", "📋", "⚙️", "🚀", "📘"];

function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div>
      {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-wide text-accent">{eyebrow}</p> : null}
      <h2 className="mt-1 font-heading text-lg font-extrabold text-ink">{title}</h2>
      {children ? <p className="mt-1 text-sm leading-6 text-ink-secondary">{children}</p> : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-ink">{label}</span>
      {hint ? <span className="ml-2 text-xs text-ink-secondary">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default async function NewProjectPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;

  const members = await prisma.membership.findMany({
    where: { workspaceId: active.id },
    orderBy: { user: { name: "asc" } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-accent">Uinfo Nexus · Create project</p>
          <h1 className="mt-2 font-heading text-[34px] font-extrabold tracking-tight text-ink">Start a project</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
Plane-inspired creation flow, implemented Workhub-native. Project visuals now persist as schema-light metadata with name, key, description, template, access, and lead.
          </p>
        </div>
        <a href="/projects" className="rounded-xl border border-card-border bg-card px-4 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent">← Back to projects</a>
      </div>

      <form action={createProjectAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
          <div className="h-28 bg-[linear-gradient(135deg,#3357d6,#7b8cff_48%,#eef1fc)]" />
          <div className="space-y-6 p-6">
            <div className="-mt-14 flex flex-wrap items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-card-border bg-card text-4xl shadow-sm">▦</div>
              <div className="pb-1">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Persisted visual metadata</p>
                <p className="font-heading text-xl font-extrabold text-ink">Choose a project icon, cover color, and theme for cards and project headers.</p>
              </div>
            </div>

            <SectionTitle eyebrow="Step 1" title="Project identity">
              Choose the human-readable name and Jira-compatible key. Keep imported Jira keys unchanged when recreating migrated spaces.
            </SectionTitle>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Project name">
                <input name="name" required placeholder="e.g. Cyber Threat Intelligence" className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10" />
              </Field>
              <Field label="Project key" hint="2–12 uppercase">
                <input name="key" required placeholder="CTI" maxLength={12} className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-ink outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10" />
              </Field>
            </div>

            <Field label="Description" hint="Visible on project cards">
              <textarea name="description" placeholder="What this project tracks, who owns it, and how it maps to Jira/Workhub." className="min-h-28 w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10" />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Access">
                <select name="access" defaultValue="open" className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10">
                  <option value="open">Open · all workspace members can access</option>
                  <option value="private">Private · only project members</option>
                </select>
              </Field>
              <Field label="Project lead">
                <select name="leadId" defaultValue={user.id} className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10">
                  {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.user.email}</option>)}
                </select>
              </Field>
            </div>

            <details className="rounded-2xl border border-card-border bg-page p-4">
              <summary className="cursor-pointer font-heading text-sm font-extrabold text-ink">Optional Jira mapping notes</summary>
              <div className="mt-4 grid gap-3 text-sm text-ink-secondary md:grid-cols-2">
                <div className="rounded-xl bg-card p-3 ring-1 ring-card-border">
                  <p className="font-bold text-ink">Source type</p>
                  <p className="mt-1">Manual projects persist immediately. Jira-imported source badges are derived from ExternalMapping after import.</p>
                </div>
                <div className="rounded-xl bg-card p-3 ring-1 ring-card-border">
                  <p className="font-bold text-ink">Migration guardrail</p>
                  <p className="mt-1">Use Admin / Migration for dry-run first. This form does not write Jira records or ExternalMapping rows.</p>
                </div>
              </div>
            </details>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-card-border bg-card p-5 shadow-sm">
            <SectionTitle eyebrow="Step 2" title="Choose template">
              Creates the default Workhub status workflow. You can customize statuses later in project settings.
            </SectionTitle>
            <div className="mt-4 space-y-2">
              {TEMPLATES.map((template, index) => (
                <label key={template.key} className="flex cursor-pointer gap-3 rounded-2xl border border-card-border bg-page p-3 transition hover:border-accent hover:bg-accent-soft">
                  <input type="radio" name="template" value={template.key} defaultChecked={index === 0} className="mt-4 accent-[var(--wh-accent)]" />
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card text-lg shadow-sm ring-1 ring-card-border">{template.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-heading text-sm font-extrabold text-ink">{template.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-ink-secondary">{template.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-card-border bg-card p-5 shadow-sm">
            <SectionTitle title="Visual style">
              Persisted to Project.metadata and rendered on project cards and headers.
            </SectionTitle>
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Icon</p>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((icon, index) => (
                    <label key={icon} className="cursor-pointer">
                      <input type="radio" name="icon" value={icon} defaultChecked={index === 0} className="peer sr-only" />
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-card-border bg-page text-lg peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:ring-2 peer-checked:ring-accent/20">{icon}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Cover / theme</p>
                <div className="grid gap-2">
                  {VISUAL_OPTIONS.map((option, index) => (
                    <label key={option.theme} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-card-border bg-page p-3 hover:border-accent">
                      <input type="radio" name="theme" value={option.theme} defaultChecked={index === 0} className="accent-[var(--wh-accent)]" />
                      <span className={`h-8 w-8 rounded-full ${option.className} ring-1 ring-card-border`} />
                      <span className="font-semibold text-ink">{option.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-card-border bg-accent-soft p-5 text-accent-soft-text shadow-sm">
            <p className="font-heading text-base font-extrabold">Ready to create</p>
            <p className="mt-2 text-sm leading-6">The project will redirect to its live Nexus board and use real DB-backed statuses/counts immediately.</p>
            <button className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-heading text-sm font-bold text-white hover:opacity-90">Create project</button>
          </section>
        </aside>
      </form>
    </div>
  );
}
