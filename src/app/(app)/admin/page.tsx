import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { auditActivity } from "@/modules/export/service";
import * as adv from "@/modules/advanced/service";

function readinessTone(ok: boolean) {
  return ok ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100";
}

export default async function AdminPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const [logs, importStats, webhooks, automations, searchOps] = active ? await Promise.all([
    auditActivity(user.id, active.id).catch(() => []),
    prisma.importJob.groupBy({ by: ["status"], where: { workspaceId: active.id }, _count: { _all: true } }).catch(() => []),
    adv.listWebhooks(user.id, active.id).catch(() => []),
    adv.listAutomations(user.id, active.id).catch(() => []),
    adv.searchOperationsStatus(user.id, active.id).catch(() => null),
  ]) : [[], [], [], [], null];
  const completedImports = importStats.find((item) => item.status === "COMPLETED")?._count._all ?? 0;
  const failedImports = importStats.find((item) => item.status === "FAILED")?._count._all ?? 0;
  const totalImports = importStats.reduce((sum, item) => sum + item._count._all, 0);
  const enabledWebhooks = webhooks.filter((hook) => hook.enabled).length;
  const enabledAutomations = automations.filter((rule) => rule.enabled).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="grid gap-5 bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f7faf7)] p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-accent">Admin · Control center</p>
            <h1 className="mt-2 font-heading text-[32px] font-extrabold tracking-tight text-ink">Admin readiness</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
              Operator view for migration readiness, exports, webhooks, automation, search indexing, and recent audit events. Built from live workspace data.
            </p>
          </div>
          <div className="rounded-2xl border border-card-border bg-card/90 p-4 text-sm shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Signed in</p>
            <p className="mt-1 font-heading text-lg font-extrabold text-ink">{user.name ?? user.email}</p>
            <p className="mt-1 text-ink-secondary">{active?.name ?? "No active workspace"}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/migration" className="rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:border-accent/40 hover:bg-page">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Migration</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-ink">{completedImports}/{totalImports}</p>
          <p className="mt-1 text-sm text-ink-secondary">completed imports · {failedImports} failed</p>
          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${readinessTone(failedImports === 0)}`}>{failedImports === 0 ? "Ready" : "Needs review"}</span>
        </Link>
        <Link href="/admin/advanced" className="rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:border-accent/40 hover:bg-page">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Webhooks</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-ink">{enabledWebhooks}/{webhooks.length}</p>
          <p className="mt-1 text-sm text-ink-secondary">enabled endpoints</p>
          <span className="mt-3 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700 ring-1 ring-blue-100">Signed delivery supported</span>
        </Link>
        <Link href="/admin/advanced" className="rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:border-accent/40 hover:bg-page">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Search index</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-ink">{searchOps?.documentCount ?? 0}</p>
          <p className="mt-1 text-sm text-ink-secondary">indexable docs · backend {searchOps?.backend ?? "n/a"}</p>
          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${readinessTone(Boolean(searchOps?.canReindex))}`}>{searchOps?.canReindex ? "External ready" : "Local fallback"}</span>
        </Link>
        <Link href="/admin/advanced" className="rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:border-accent/40 hover:bg-page">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Automation</p>
          <p className="mt-2 font-heading text-2xl font-extrabold text-ink">{enabledAutomations}/{automations.length}</p>
          <p className="mt-1 text-sm text-ink-secondary">enabled rules</p>
          <span className="mt-3 inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-extrabold text-violet-700 ring-1 ring-violet-100">Reporter notification ready</span>
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-extrabold text-ink">Recent audit</h2>
              <p className="mt-1 text-sm text-ink-secondary">Latest workspace activity entries for review/export readiness.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold text-ink hover:bg-page" href="/api/export/issues.csv">Issues CSV</a>
              <a className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold text-ink hover:bg-page" href="/api/export/pages.json">Pages JSON</a>
              <a className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold text-ink hover:bg-page" href="/api/export/pages.md">Pages Markdown</a>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-card-border">
            <table className="w-full text-left text-sm">
              <tbody>
                {logs.slice(0, 12).map((log) => (
                  <tr key={log.id} className="border-b border-card-border last:border-0">
                    <td className="p-3 text-xs font-semibold text-ink-secondary">{log.createdAt.toISOString()}</td>
                    <td className="p-3 font-bold text-ink">{log.entityType}</td>
                    <td className="p-3 text-ink-secondary">{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <p className="p-4 text-sm text-ink-secondary">No audit entries or insufficient permission.</p>}
          </div>
        </div>

        <aside className="space-y-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <h2 className="font-heading text-lg font-extrabold text-ink">Admin next steps</h2>
          <Link href="/admin/migration" className="block rounded-xl border border-card-border bg-page p-3 text-sm font-bold text-ink hover:border-accent/40">Open migration wizard</Link>
          <Link href="/admin/advanced" className="block rounded-xl border border-card-border bg-page p-3 text-sm font-bold text-ink hover:border-accent/40">Manage search/webhooks/automation</Link>
          <Link href="/search" className="block rounded-xl border border-card-border bg-page p-3 text-sm font-bold text-ink hover:border-accent/40">Validate search results</Link>
          <p className="text-xs leading-5 text-ink-secondary">SSO remains blocked until real IdP details are provided. Modules remain design-only until semantics are approved.</p>
        </aside>
      </section>
    </div>
  );
}
