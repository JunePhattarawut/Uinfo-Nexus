import Link from "next/link";

type IssueItem = {
  id: string;
  number: number;
  title: string;
  priority: string;
  type: string;
  status?: { name?: string; category?: string } | null;
  assignee?: { name: string | null } | null;
  dueDate?: Date | string | null;
  storyPoints?: number | null;
};

const PRIORITY_DOT: Record<string, string> = {
  HIGHEST: "bg-red-500 ring-red-200",
  HIGH:    "bg-orange-400 ring-orange-200",
  MEDIUM:  "bg-amber-400 ring-amber-200",
  LOW:     "bg-blue-400 ring-blue-200",
  LOWEST:  "bg-gray-300 ring-gray-200",
};

const STATUS_BAR: Record<string, string> = {
  DONE:        "bg-emerald-100 text-emerald-700 border-emerald-200",
  IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
  TODO:        "bg-gray-100 text-gray-600 border-gray-200",
};

const TYPE_ICON: Record<string, string> = {
  EPIC: "⬟", STORY: "◈", TASK: "☐", BUG: "⬡", SUBTASK: "◻",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function weekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil((date.getDate() + firstDay) / 7);
}

function weekLabel(date: Date): string {
  const d = date.getDate();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const weekStart = d - ((d - 1) % 7);
  const weekEnd = Math.min(weekStart + 6, lastDay);
  return `${weekStart}–${weekEnd} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

type WeekGroup = {
  weekKey: string;
  weekLabel: string;
  issues: IssueItem[];
};

type MonthGroup = {
  monthKey: string;
  label: string;
  year: number;
  month: number;
  weeks: WeekGroup[];
  isPast: boolean;
  isCurrent: boolean;
};

export function TimelineView({
  projectKey,
  issues,
}: {
  projectKey: string;
  issues: IssueItem[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Separate issues with/without due dates
  const withDue = issues
    .filter((i) => i.dueDate)
    .sort((a, b) => +new Date(a.dueDate!) - +new Date(b.dueDate!));
  const noDue = issues.filter((i) => !i.dueDate);

  // Build month → week → issues tree
  const monthMap = new Map<string, MonthGroup>();

  for (const issue of withDue) {
    const d = new Date(issue.dueDate!);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const wNum = weekOfMonth(d);
    const wKey = `${mKey}-W${wNum}`;

    if (!monthMap.has(mKey)) {
      const now = new Date();
      const isPast = d.getFullYear() < now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth());
      const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      monthMap.set(mKey, {
        monthKey: mKey,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        year: d.getFullYear(),
        month: d.getMonth(),
        weeks: [],
        isPast,
        isCurrent,
      });
    }

    const mg = monthMap.get(mKey)!;
    let wg = mg.weeks.find((w) => w.weekKey === wKey);
    if (!wg) {
      wg = { weekKey: wKey, weekLabel: weekLabel(d), issues: [] };
      mg.weeks.push(wg);
    }
    wg.issues.push(issue);
  }

  const months = [...monthMap.values()];

  if (issues.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-card-border bg-page p-8 text-center">
        <p className="text-[13px] text-ink-secondary">No work items found.</p>
      </section>
    );
  }

  return (
    <div className="space-y-1">
      {months.map((mg) => (
        <div key={mg.monthKey} className="rounded-2xl border border-card-border bg-card shadow-sm overflow-hidden">
          {/* Month header */}
          <div className={`flex items-center justify-between border-b border-card-border px-5 py-3 ${
            mg.isCurrent ? "bg-accent/5" : mg.isPast ? "bg-page/70" : "bg-page/40"
          }`}>
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ring-2 ${
                mg.isCurrent ? "bg-accent ring-accent/30" : mg.isPast ? "bg-gray-300 ring-gray-100" : "bg-blue-400 ring-blue-100"
              }`} />
              <h3 className={`font-heading text-[14px] font-extrabold ${
                mg.isCurrent ? "text-accent" : mg.isPast ? "text-ink-secondary" : "text-ink"
              }`}>
                {mg.label}
              </h3>
              {mg.isCurrent && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">Current</span>
              )}
              {mg.isPast && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Past</span>
              )}
            </div>
            <span className="text-[12px] font-semibold text-ink-secondary">
              {mg.weeks.reduce((n, w) => n + w.issues.length, 0)} issues
            </span>
          </div>

          {/* Weeks */}
          <div className="divide-y divide-card-border/50">
            {mg.weeks.map((wg, wi) => (
              <div key={wg.weekKey} className="grid grid-cols-[120px_1fr] divide-x divide-card-border/50">
                {/* Week label (left axis) */}
                <div className={`flex items-start justify-end px-4 py-3 ${wi % 2 === 0 ? "" : "bg-page/30"}`}>
                  <div className="text-right">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-ink-secondary/50">Week {weekOfMonth(new Date(wg.issues[0].dueDate!))}</p>
                    <p className="mt-0.5 text-[11.5px] font-semibold text-ink-secondary">{wg.weekLabel}</p>
                  </div>
                </div>

                {/* Issues */}
                <div className={`space-y-1.5 p-3 ${wi % 2 === 0 ? "" : "bg-page/30"}`}>
                  {wg.issues.map((issue) => {
                    const dDate = new Date(issue.dueDate!);
                    const isOverdue = dDate < today && issue.status?.category !== "DONE";
                    const isDueToday = dDate.toDateString() === today.toDateString();
                    const statusCat = issue.status?.category ?? "TODO";

                    return (
                      <Link
                        key={issue.id}
                        href={`/p/${projectKey}/issues/${projectKey.toUpperCase()}-${issue.number}`}
                        className="group flex items-center gap-2.5 rounded-xl border border-card-border bg-card px-3 py-2 hover:border-accent/40 hover:bg-accent/5 transition-colors"
                      >
                        {/* Priority dot */}
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${PRIORITY_DOT[issue.priority] ?? "bg-gray-300 ring-gray-200"}`} />

                        {/* Type icon */}
                        <span className="shrink-0 text-[13px] text-ink-secondary/60">
                          {TYPE_ICON[issue.type] ?? "☐"}
                        </span>

                        {/* Key */}
                        <span className="shrink-0 font-mono text-[11px] text-ink-secondary/60 group-hover:text-accent/70">
                          {projectKey.toUpperCase()}-{issue.number}
                        </span>

                        {/* Title */}
                        <span className={`flex-1 truncate text-[13px] font-semibold text-ink group-hover:text-accent ${
                          statusCat === "DONE" ? "line-through text-ink-secondary" : ""
                        }`}>
                          {issue.title}
                        </span>

                        {/* Assignee */}
                        {issue.assignee?.name && (
                          <span className="hidden shrink-0 text-[11.5px] text-ink-secondary/60 sm:block">
                            {issue.assignee.name.split(" ")[0]}
                          </span>
                        )}

                        {/* Story points */}
                        {issue.storyPoints != null && (
                          <span className="shrink-0 rounded-full bg-page px-1.5 py-0.5 text-[10.5px] font-bold text-ink-secondary">
                            {issue.storyPoints}
                          </span>
                        )}

                        {/* Status chip */}
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BAR[statusCat] ?? STATUS_BAR.TODO}`}>
                          {issue.status?.name ?? statusCat}
                        </span>

                        {/* Due date badge */}
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          isOverdue  ? "bg-red-100 text-red-700" :
                          isDueToday ? "bg-amber-100 text-amber-700" :
                                       "bg-page text-ink-secondary"
                        }`}>
                          {isOverdue  ? "Overdue" :
                           isDueToday ? "Today" :
                           `${dDate.getDate()} ${MONTH_NAMES[dDate.getMonth()].slice(0, 3)}`}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* No due date section */}
      {noDue.length > 0 && (
        <div className="rounded-2xl border border-dashed border-card-border bg-card/50 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 border-b border-dashed border-card-border/50 bg-page/30 px-5 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300 ring-2 ring-gray-100" />
            <h3 className="text-[14px] font-extrabold text-ink-secondary">No due date</h3>
            <span className="text-[12px] text-ink-secondary/60">{noDue.length} issues</span>
          </div>
          <div className="p-3 space-y-1.5">
            {noDue.map((issue) => (
              <Link
                key={issue.id}
                href={`/p/${projectKey}/issues/${projectKey.toUpperCase()}-${issue.number}`}
                className="group flex items-center gap-2.5 rounded-xl border border-card-border/50 bg-card px-3 py-2 hover:border-accent/40 hover:bg-accent/5 transition-colors"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${PRIORITY_DOT[issue.priority] ?? "bg-gray-300 ring-gray-200"}`} />
                <span className="shrink-0 text-[13px] text-ink-secondary/60">{TYPE_ICON[issue.type] ?? "☐"}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-secondary/60 group-hover:text-accent/70">
                  {projectKey.toUpperCase()}-{issue.number}
                </span>
                <span className="flex-1 truncate text-[13px] font-semibold text-ink group-hover:text-accent">{issue.title}</span>
                {issue.assignee?.name && (
                  <span className="hidden shrink-0 text-[11.5px] text-ink-secondary/60 sm:block">{issue.assignee.name.split(" ")[0]}</span>
                )}
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BAR[issue.status?.category ?? "TODO"] ?? STATUS_BAR.TODO}`}>
                  {issue.status?.name ?? "To Do"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
