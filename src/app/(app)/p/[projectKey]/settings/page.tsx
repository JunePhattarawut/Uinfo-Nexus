import type { ReactNode } from "react";
import Link from "next/link";
import { IssueType, StatusCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as adv from "@/modules/advanced/service";
import { createSavedFilterAction, createStatusAction } from "./actions";

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function filterRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function filterText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function savedFilterHref(projectKey: string, filter: { filters: unknown }) {
  const data = filterRecord(filter.filters);
  const params = new URLSearchParams({ view: "list" });
  for (const key of ["statusId", "type", "assigneeId", "label", "showJira"]) {
    const value = filterText(data[key]);
    if (value) params.set(key, value);
  }
  return `/p/${projectKey}/issues?${params.toString()}`;
}

function describeFilter(filter: { filters: unknown }, statuses: { id: string; name: string }[]) {
  const data = filterRecord(filter.filters);
  const parts = [
    filterText(data.statusId) ? `status: ${statuses.find((status) => status.id === filterText(data.statusId))?.name ?? "selected"}` : "any status",
    filterText(data.type) ? `type: ${filterText(data.type)}` : "any type",
    filterText(data.showJira) === "1" ? "Jira fields" : "standard columns",
  ];
  return parts.join(" · ");
}

function EmptyState({ children }: { children: string }) {
  return <li className="rounded-xl border border-dashed border-card-border bg-page p-4 text-sm text-ink-secondary">{children}</li>;
}

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectKey: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { projectKey } = await params;
  if (!active) return <p>No active workspace</p>;

  const project = await prisma.project.findFirstOrThrow({
    where: { workspaceId: active.id, key: projectKey.toUpperCase() },
    include: { _count: { select: { issues: true, members: true, savedFilters: true } } },
  });
  const [statuses, filters, metrics, projectMembers] = await Promise.all([
    adv.listStatuses(user.id, active.id, project.id),
    adv.listSavedFilters(user.id, active.id, project.id),
    adv.sprintMetrics(user.id, active.id, project.id),
    prisma.projectMember.findMany({ where: { projectId: project.id }, orderBy: { role: "asc" }, include: { project: { select: { key: true } } } }),
  ]);
  const inputClass = "w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent-soft";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[12.5px] font-extrabold uppercase tracking-wide text-accent">Project settings</p>
              <h1 className="mt-2 font-heading text-[34px] font-extrabold tracking-tight text-ink">{project.key} advanced settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                Manage schema-safe workflow settings and saved views. Saved filters are backed by the existing SavedFilter table and can be opened from the issue list.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/p/${project.key}/issues?view=list`} className="rounded-xl bg-accent px-5 py-3 font-heading text-sm font-bold text-white hover:opacity-90">Open list view</Link>
                <Link href={`/p/${project.key}/issues?view=list&showJira=1`} className="rounded-xl border border-card-border bg-card px-5 py-3 font-heading text-sm font-bold text-ink hover:border-accent hover:text-accent">List with Jira fields</Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-2xl border border-card-border bg-card/90 p-3 shadow-sm"><p className="font-heading text-2xl font-extrabold text-ink">{project._count.issues}</p><p className="text-[11px] font-bold text-ink-secondary">Issues</p></div>
              <div className="rounded-2xl border border-card-border bg-card/90 p-3 shadow-sm"><p className="font-heading text-2xl font-extrabold text-ink">{statuses.length}</p><p className="text-[11px] font-bold text-ink-secondary">Statuses</p></div>
              <div className="rounded-2xl border border-card-border bg-card/90 p-3 shadow-sm"><p className="font-heading text-2xl font-extrabold text-ink">{filters.length}</p><p className="text-[11px] font-bold text-ink-secondary">Filters</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Access visibility</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Project access state</h2>
            <p className="mt-1 text-sm text-ink-secondary">Display-only audit of current access semantics. This slice does not change permission behavior.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${projectMembers.length > 0 ? "bg-[#FFF7D6] text-[#7F5F01]" : "bg-[#E3FCEF] text-[#006644]"}`}>{projectMembers.length > 0 ? "Restricted members" : "Workspace open"}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Project members</p><p className="mt-1 font-heading text-2xl font-extrabold text-ink">{projectMembers.length}</p></div>
          <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Workspace policy</p><p className="mt-1 text-sm font-semibold text-ink">read: workspace member</p></div>
          <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Write/admin</p><p className="mt-1 text-sm font-semibold text-ink">role + project member checks</p></div>
        </div>
        <p className="mt-3 text-xs font-semibold text-ink-secondary">Note: current policy allows workspace viewers to read project resources; project members additionally satisfy edit/create checks for project resources.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
        <div className="border-b border-card-border px-5 py-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Saved-view UX</p>
          <h2 className="font-heading text-xl font-extrabold text-ink">Saved filters</h2>
          <p className="mt-1 text-sm text-ink-secondary">Create quick chips for the project issue list. Current implementation preserves existing filters JSON and route semantics.</p>
        </div>
        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/p/${project.key}/issues?view=list`} className="rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-white">All work items</Link>
              {filters.map((filter) => (
                <Link key={filter.id} href={savedFilterHref(project.key, filter)} className="rounded-full border border-card-border bg-page px-3 py-1.5 text-xs font-bold text-ink-secondary hover:border-accent hover:bg-card hover:text-accent">
                  {filter.name} · {filter.scope.toLowerCase()}
                </Link>
              ))}
              {!filters.length && <span className="rounded-full border border-dashed border-card-border bg-page px-3 py-1.5 text-xs font-bold text-ink-secondary">No saved filters yet</span>}
            </div>
            <ul className="mt-4 space-y-2">
              {filters.map((filter) => (
                <li key={filter.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={savedFilterHref(project.key, filter)} className="font-heading font-extrabold text-ink hover:text-accent">{filter.name}</Link>
                    <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase text-ink-secondary">{filter.scope}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-ink-secondary">{describeFilter(filter, statuses)}</p>
                </li>
              ))}
              {!filters.length && <EmptyState>No saved filters yet. Create one on the right.</EmptyState>}
            </ul>
          </div>

          <form action={createSavedFilterAction.bind(null, project.key)} className="rounded-2xl border border-card-border bg-page p-4">
            <h3 className="font-heading text-lg font-extrabold text-ink">Save current-style filter</h3>
            <p className="mt-1 text-sm text-ink-secondary">Schema-safe: stores type/status/source-column preferences in existing SavedFilter.filters JSON.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Filter name" className="sm:col-span-2">
                <input name="name" placeholder="e.g. CTI open tasks" className={inputClass} />
              </FieldLabel>
              <FieldLabel label="Status">
                <select name="statusId" className={inputClass}>
                  <option value="">Any status</option>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                </select>
              </FieldLabel>
              <FieldLabel label="Type">
                <select name="type" className={inputClass}><option value="">Any type</option>{Object.values(IssueType).map((type) => <option key={type}>{type}</option>)}</select>
              </FieldLabel>
              <FieldLabel label="Scope">
                <select name="scope" className={inputClass}><option>PRIVATE</option><option>WORKSPACE</option></select>
              </FieldLabel>
              <FieldLabel label="Columns">
                <select name="showJira" className={inputClass}><option value="">Standard</option><option value="1">Show Jira/source fields</option></select>
              </FieldLabel>
            </div>
            <button className="mt-4 w-full rounded-xl bg-accent px-5 py-2.5 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Save filter</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Workflow</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Custom statuses</h2>
          </div>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{statuses.length} statuses</span>
        </div>
        <ul className="mt-4 grid gap-2 md:grid-cols-3">
          {statuses.map((status) => <li key={status.id} className="rounded-xl border border-card-border bg-page p-3 text-sm font-semibold text-ink-secondary">{status.position}. <span className="font-heading font-extrabold text-ink">{status.name}</span> · {status.category}</li>)}
        </ul>
        <form action={createStatusAction.bind(null, project.key)} className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input name="name" placeholder="Status name" className={inputClass} />
          <select name="category" className={inputClass}>{Object.values(StatusCategory).map((category) => <option key={category}>{category}</option>)}</select>
          <button className="rounded-xl border border-card-border bg-page px-4 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent">Add status</button>
        </form>
      </section>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Reports</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Burndown / velocity</h2>
          </div>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{metrics.length} sprints</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.id} className="rounded-xl border border-card-border bg-page p-4 text-sm">
              <div className="flex items-center justify-between gap-3"><b className="font-heading text-ink">{metric.name}</b><span className="rounded bg-card px-2 py-1 text-[11px] font-bold text-ink-secondary">{metric.state}</span></div>
              <div className="mt-2 text-ink-secondary">Total {metric.total} · Done {metric.done} · Remaining {metric.remaining}</div>
              <div className="mt-3 h-2 rounded bg-card"><div className="h-2 rounded bg-accent" style={{ width: `${metric.total ? Math.round((metric.done / metric.total) * 100) : 0}%` }} /></div>
            </div>
          ))}
          {metrics.length === 0 && <p className="rounded-xl border border-dashed border-card-border bg-page p-4 text-sm text-ink-secondary">No sprints yet.</p>}
        </div>
      </section>
    </div>
  );
}
