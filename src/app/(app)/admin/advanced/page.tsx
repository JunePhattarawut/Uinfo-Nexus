import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as adv from "@/modules/advanced/service";
import { createAutomationAction, createStatusAction, createWebhookAction, deliverPendingWebhooksAction, rebuildSearchIndexAction, updateStatusAction } from "./actions";

const CATEGORIES = ["TODO", "IN_PROGRESS", "DONE"] as const;

function categoryPill(category: string) {
  if (category === "DONE") return "bg-[#94C748] text-[#172B4D]";
  if (category === "IN_PROGRESS") return "bg-[#85B8FF] text-[#172B4D]";
  return "bg-[#E9EDF3] text-[#172B4D]";
}

function CategorySelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="category" defaultValue={defaultValue} className="rounded-lg border border-card-border bg-page px-3 py-2 text-sm">
      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
    </select>
  );
}

export default async function AdvancedAdminPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const [hooks, rules, projects, searchOps] = active ? await Promise.all([
    adv.listWebhooks(user.id, active.id).catch(() => []),
    adv.listAutomations(user.id, active.id).catch(() => []),
    prisma.project.findMany({ where: { workspaceId: active.id }, orderBy: { name: "asc" }, include: { statuses: { orderBy: { position: "asc" }, include: { _count: { select: { issues: true } } } } } }),
    adv.searchOperationsStatus(user.id, active.id),
  ]) : [[], [], [], null];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[12.5px] font-bold uppercase tracking-wide text-accent">Admin</p>
        <h1 className="mt-1 font-heading text-[28px] font-extrabold text-ink">Advanced admin</h1>
        <p className="mt-1 text-sm text-ink-secondary">Customize project statuses, automations, webhooks, and search operations.</p>
      </div>

      {searchOps ? (
        <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
          <div className="grid gap-4 bg-[linear-gradient(135deg,#f4f7ff,#ffffff_60%,#f7faf7)] p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Search operations</p>
              <h2 className="mt-1 font-heading text-xl font-extrabold text-ink">Elasticsearch / OpenSearch readiness</h2>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                Monitor the configured search backend, preview indexable workspace documents, and run a guarded reindex when an external cluster is configured.
              </p>
            </div>
            <div className="rounded-xl border border-card-border bg-card/90 p-4 text-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Current backend</p>
              <p className="mt-1 font-heading text-lg font-extrabold text-ink">{searchOps.backend}</p>
              <p className="mt-1 text-xs font-semibold text-ink-secondary">{searchOps.configured ? "External search active" : "Local Postgres search fallback"}</p>
            </div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-5">
            <div className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-extrabold uppercase text-ink-secondary">Index</p>
              <p className="mt-1 truncate font-bold text-ink">{searchOps.index}</p>
            </div>
            <div className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-extrabold uppercase text-ink-secondary">Endpoint</p>
              <p className="mt-1 truncate font-bold text-ink">{searchOps.urlHost}</p>
            </div>
            <div className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-extrabold uppercase text-ink-secondary">Auth</p>
              <p className="mt-1 font-bold text-ink">{searchOps.authMode}</p>
            </div>
            <div className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-extrabold uppercase text-ink-secondary">Documents</p>
              <p className="mt-1 font-bold text-ink">{searchOps.documentCount}</p>
            </div>
            <div className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-extrabold uppercase text-ink-secondary">Reindex</p>
              <p className={`mt-1 font-bold ${searchOps.canReindex ? "text-emerald-700" : "text-amber-700"}`}>{searchOps.canReindex ? "Ready" : "Configure env first"}</p>
            </div>
          </div>
          <div className="border-t border-card-border p-5">
            <div className="flex flex-wrap gap-2">
              {Object.entries(searchOps.counts).map(([type, count]) => (
                <span key={type} className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary ring-1 ring-card-border">{type}: {count}</span>
              ))}
            </div>
            <form action={rebuildSearchIndexAction} className="mt-4 flex flex-wrap items-center gap-3">
              <button disabled={!searchOps.canReindex} className="rounded-xl bg-accent px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Rebuild external search index</button>
              <p className="text-xs font-semibold text-ink-secondary">CLI equivalent: <code>npm run search:reindex -- &lt;workspace-slug&gt;</code></p>
            </form>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-card-border bg-card p-4">
        <h2 className="font-heading text-lg font-bold text-ink">Custom status workflows</h2>
        <p className="mt-1 text-sm text-ink-secondary">Each project can define its own card statuses. Board cards use these live database statuses for the dropdown and transitions.</p>
        <div className="mt-4 space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="rounded-xl border border-card-border bg-page p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{project.name}</h3>
                  <p className="text-xs font-semibold text-ink-secondary">{project.key} · {project.statuses.length} statuses</p>
                </div>
                <form action={createStatusAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input name="name" placeholder="New status" className="rounded-lg border border-card-border bg-card px-3 py-2 text-sm" />
                  <CategorySelect defaultValue="TODO" />
                  <button className="rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white">Add status</button>
                </form>
              </div>
              <div className="mt-3 grid gap-2">
                {project.statuses.map((status) => (
                  <form key={status.id} action={updateStatusAction} className="grid gap-2 rounded-lg border border-card-border bg-card p-2 md:grid-cols-[1fr_160px_90px_auto]">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="statusId" value={status.id} />
                    <input name="name" defaultValue={status.name} className="rounded-lg border border-card-border bg-page px-3 py-2 text-sm font-semibold" />
                    <CategorySelect defaultValue={status.category} />
                    <span className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-extrabold ${categoryPill(status.category)}`}>{status._count.issues}</span>
                    <button className="rounded-lg border border-card-border px-3 py-2 text-sm font-bold text-ink hover:bg-page">Save</button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-card-border bg-card p-4">
        <h2 className="font-semibold text-ink">Webhooks</h2>
        <ul className="mt-2 text-sm text-ink-secondary">{hooks.map((h) => <li key={h.id}>{h.name} · {h.url} · {h.events.join(", ")} · deliveries {h.deliveries.length}</li>)}</ul>
        <form action={createWebhookAction} className="mt-3 grid gap-2 md:grid-cols-4"><input name="name" placeholder="Webhook name" className="rounded-lg border border-card-border bg-page px-3 py-2" /><input name="url" placeholder="https://example.test/hook" className="rounded-lg border border-card-border bg-page px-3 py-2" /><input name="events" defaultValue="issue.updated" className="rounded-lg border border-card-border bg-page px-3 py-2" /><button className="rounded-lg border border-card-border px-3 py-2">Create webhook</button></form>
        <form action={deliverPendingWebhooksAction} className="mt-2"><button className="rounded-lg border border-card-border px-3 py-2 text-sm">Deliver pending webhooks</button></form>
      </section>

      <section className="rounded-xl border border-card-border bg-card p-4">
        <h2 className="font-semibold text-ink">Automations</h2>
        <ul className="mt-2 text-sm text-ink-secondary">{rules.map((r) => <li key={r.id}>{r.name} · {r.trigger} → {r.action}</li>)}</ul>
        <form action={createAutomationAction} className="mt-3 flex gap-2"><input name="name" placeholder="Notify reporter when done" className="rounded-lg border border-card-border bg-page px-3 py-2" /><button className="rounded-lg border border-card-border px-3 py-2">Create automation</button></form>
      </section>
    </div>
  );
}
