import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";

// ── Helpers ────────────────────────────────────────────────────────
function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function dueDateLabel(date: Date, today: Date) {
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff}d`;
}

// ── Sub-components ─────────────────────────────────────────────────
function StatCard({
  label, value, sub, tone = "text-ink",
}: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-2 font-heading text-[28px] font-extrabold leading-none ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-[12px] text-ink-secondary">{sub}</p>}
    </div>
  );
}

function HBar({
  label, count, total, color,
}: { label: string; count: number; total: number; color: string }) {
  const w = pct(count, total);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right text-[12px] font-semibold text-ink-secondary">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-page h-2.5">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-14 text-[12px] font-semibold text-ink-secondary">
        {count} <span className="text-ink-secondary/50">({w}%)</span>
      </span>
    </div>
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGHEST: "bg-red-500",
  HIGH:    "bg-orange-400",
  MEDIUM:  "bg-amber-400",
  LOW:     "bg-blue-400",
  LOWEST:  "bg-gray-300",
};
const TYPE_COLOR: Record<string, string> = {
  EPIC:    "bg-purple-500",
  STORY:   "bg-blue-500",
  TASK:    "bg-emerald-500",
  BUG:     "bg-red-500",
  SUBTASK: "bg-gray-400",
};
const PRIORITY_LABEL: Record<string, string> = {
  HIGHEST: "Highest", HIGH: "High", MEDIUM: "Medium", LOW: "Low", LOWEST: "Lowest",
};
const TYPE_LABEL: Record<string, string> = {
  EPIC: "Epic", STORY: "Story", TASK: "Task", BUG: "Bug", SUBTASK: "Subtask",
};
const PRIORITY_DOT: Record<string, string> = {
  HIGHEST: "bg-red-500", HIGH: "bg-orange-400", MEDIUM: "bg-amber-400",
  LOW: "bg-blue-400", LOWEST: "bg-gray-400",
};

// ── Page ──────────────────────────────────────────────────────────
export default async function DashboardsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [projects, issues, dueIssues] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: active.id },
      select: { id: true, name: true, key: true },
      orderBy: { name: "asc" },
    }),
    prisma.issue.findMany({
      where: { project: { workspaceId: active.id }, deletedAt: null },
      select: {
        id: true, type: true, priority: true, dueDate: true, projectId: true,
        status: { select: { category: true } },
      },
    }),
    prisma.issue.findMany({
      where: {
        project: { workspaceId: active.id },
        deletedAt: null,
        dueDate: { not: null, lte: sevenDaysFromNow },
        status: { category: { not: "DONE" } },
      },
      select: {
        id: true, title: true, dueDate: true, priority: true, number: true,
        project: { select: { key: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
  ]);

  // ── Aggregates ──────────────────────────────────────────────────
  const total      = issues.length;
  const done       = issues.filter((i) => i.status.category === "DONE").length;
  const inProgress = issues.filter((i) => i.status.category === "IN_PROGRESS").length;
  const todo       = issues.filter((i) => i.status.category === "TODO").length;
  const donePercent = pct(done, total);

  const overdue  = dueIssues.filter((i) => i.dueDate && new Date(i.dueDate) < today);
  const dueSoon  = dueIssues.filter((i) => i.dueDate && new Date(i.dueDate) >= today);

  const priorityCounts = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"].map((p) => ({
    key: p, label: PRIORITY_LABEL[p], count: issues.filter((i) => i.priority === p).length,
    color: PRIORITY_COLOR[p],
  }));

  const typeCounts = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"].map((t) => ({
    key: t, label: TYPE_LABEL[t], count: issues.filter((i) => i.type === t).length,
    color: TYPE_COLOR[t],
  }));

  const projectBreakdown = projects.map((p) => {
    const pi = issues.filter((i) => i.projectId === p.id);
    const pd = pi.filter((i) => i.status.category === "DONE").length;
    return { ...p, total: pi.length, done: pd, pct: pct(pd, pi.length) };
  }).filter((p) => p.total > 0).sort((a, b) => b.total - a.total);

  // Stacked bar widths
  const stackTodo = pct(todo, total);
  const stackInP  = pct(inProgress, total);
  const stackDone = pct(done, total);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary/60">Workspace</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold text-ink">Dashboards</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">Delivery overview, compliance tracking, and workload distribution.</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Projects"   value={projects.length} />
        <StatCard label="Total Issues" value={total} />
        <StatCard label="Done"       value={`${donePercent}%`} sub={`${done} of ${total}`} tone="text-emerald-600" />
        <StatCard label="In Progress" value={inProgress}     sub={`${pct(inProgress, total)}% of total`} tone="text-blue-600" />
        <StatCard label="Overdue"    value={overdue.length}  sub="not yet done" tone={overdue.length > 0 ? "text-red-600" : "text-ink-secondary"} />
      </div>

      {/* ── Status overview ── */}
      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-extrabold text-ink">Overall Status</h2>

        {/* Stacked bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-page">
          {stackTodo > 0 && <div className="h-full bg-gray-300 transition-all" style={{ width: `${stackTodo}%` }} title={`To Do: ${todo}`} />}
          {stackInP  > 0 && <div className="h-full bg-blue-400 transition-all"  style={{ width: `${stackInP}%`  }} title={`In Progress: ${inProgress}`} />}
          {stackDone > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${stackDone}%` }} title={`Done: ${done}`} />}
        </div>

        <div className="mt-3 flex flex-wrap gap-5 text-[12.5px]">
          {[
            { label: "To Do",       count: todo,       color: "bg-gray-300",    pct: stackTodo },
            { label: "In Progress", count: inProgress, color: "bg-blue-400",    pct: stackInP  },
            { label: "Done",        count: done,        color: "bg-emerald-500", pct: stackDone },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${s.color}`} />
              <span className="font-semibold text-ink">{s.label}</span>
              <span className="text-ink-secondary">{s.count} ({s.pct}%)</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Priority + Type ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-[14px] font-extrabold text-ink">By Priority</h2>
          <div className="space-y-3">
            {priorityCounts.map((p) => (
              <HBar key={p.key} label={p.label} count={p.count} total={total} color={p.color} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-[14px] font-extrabold text-ink">By Type</h2>
          <div className="space-y-3">
            {typeCounts.map((t) => (
              <HBar key={t.key} label={t.label} count={t.count} total={total} color={t.color} />
            ))}
          </div>
        </section>
      </div>

      {/* ── Project progress ── */}
      {projectBreakdown.length > 0 && (
        <section className="rounded-2xl border border-card-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-card-border bg-page/50 px-5 py-3">
            <h2 className="text-[14px] font-extrabold text-ink">Project Progress</h2>
          </div>
          <div className="divide-y divide-card-border">
            {projectBreakdown.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.key}/issues`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-page/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-accent/10 text-[10px] font-extrabold text-accent">
                  {p.key.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
                    <span className="shrink-0 text-[12px] font-bold text-ink-secondary">
                      {p.done}/{p.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
                <span className={`w-10 shrink-0 text-right text-[12px] font-bold ${p.pct === 100 ? "text-emerald-600" : "text-ink-secondary"}`}>
                  {p.pct}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Due dates ── */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Overdue */}
          <section className="rounded-2xl border border-red-100 bg-red-50/40 shadow-sm overflow-hidden">
            <div className="border-b border-red-100 bg-red-50 px-5 py-3">
              <h2 className="text-[14px] font-extrabold text-red-700">
                Overdue <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px]">{overdue.length}</span>
              </h2>
            </div>
            {overdue.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-secondary">None overdue 🎉</p>
            ) : (
              <ul className="divide-y divide-red-100/60">
                {overdue.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/p/${i.project.key}/issues/${i.project.key}-${i.number}`}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-red-50/60 transition-colors"
                    >
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[i.priority]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{i.title}</p>
                        <p className="mt-0.5 text-[11px] text-ink-secondary">
                          {i.project.key}-{i.number} · <span className="text-red-600 font-semibold">{dueDateLabel(new Date(i.dueDate!), today)}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Due soon */}
          <section className="rounded-2xl border border-amber-100 bg-amber-50/40 shadow-sm overflow-hidden">
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
              <h2 className="text-[14px] font-extrabold text-amber-700">
                Due this week <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px]">{dueSoon.length}</span>
              </h2>
            </div>
            {dueSoon.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-secondary">Nothing due this week.</p>
            ) : (
              <ul className="divide-y divide-amber-100/60">
                {dueSoon.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/p/${i.project.key}/issues/${i.project.key}-${i.number}`}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-amber-50/60 transition-colors"
                    >
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[i.priority]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{i.title}</p>
                        <p className="mt-0.5 text-[11px] text-ink-secondary">
                          {i.project.key}-{i.number} · <span className="text-amber-700 font-semibold">{dueDateLabel(new Date(i.dueDate!), today)}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
