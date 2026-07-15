import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as workspaceService from "@/modules/workspace/service";

function formatDate(value: Date | string | null | undefined, empty = "No date") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textFrom(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function issueHref(projectKey: string, number: number) {
  return `/p/${projectKey}/issues/${projectKey}-${number}`;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-sm font-semibold text-ink-secondary">{hint}</p>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return <li className="rounded-xl border border-dashed border-card-border bg-page p-4 text-sm text-ink-secondary">{children}</li>;
}

function actionLabel(action: string) {
  return action.replace(/_/g, " ");
}

export default async function OverviewPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);

  if (!active) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="font-heading text-xl font-extrabold text-ink">No workspace yet</h1>
        <p className="mt-2 text-sm text-ink-secondary">Create a workspace via POST /api/workspaces to get started.</p>
      </div>
    );
  }

  const [members, issueCount, openIssueCount, pageCount, importCount, recentProjects, myWork, recentPages, recentImports, activityLogs] = await Promise.all([
    workspaceService.listMembers(user.id, active.id),
    prisma.issue.count({ where: { workspaceId: active.id, deletedAt: null } }),
    prisma.issue.count({ where: { workspaceId: active.id, deletedAt: null, status: { category: { not: "DONE" } } } }),
    prisma.page.count({ where: { workspaceId: active.id, deletedAt: null } }),
    prisma.importJob.count({ where: { workspaceId: active.id } }),
    prisma.project.findMany({
      where: { workspaceId: active.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, key: true, name: true, updatedAt: true, _count: { select: { issues: true } } },
    }),
    prisma.issue.findMany({
      where: { workspaceId: active.id, assigneeId: user.id, deletedAt: null, status: { category: { not: "DONE" } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        number: true,
        title: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        project: { select: { key: true, name: true } },
        status: { select: { name: true, category: true } },
      },
    }),
    prisma.page.findMany({
      where: { workspaceId: active.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, updatedAt: true, space: { select: { key: true, name: true } } },
    }),
    prisma.importJob.findMany({
      where: { workspaceId: active.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { errors: { take: 3, orderBy: { createdAt: "desc" } } },
    }),
    prisma.activityLog.findMany({
      where: { workspaceId: active.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, actorId: true, entityType: true, entityId: true, action: true, payload: true, createdAt: true },
    }),
  ]);

  const actors = await prisma.user.findMany({
    where: { id: { in: [...new Set(activityLogs.map((log) => log.actorId))] } },
    select: { id: true, name: true, email: true },
  });
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name || actor.email]));

  const quickActions = [
    { label: "Projects", href: "/projects", icon: "☷", hint: "Browse Jira-backed project spaces" },
    { label: "Create", href: "/create", icon: "+", hint: "Create a work item with explicit project selection" },
    { label: "Admin migration", href: "/admin/migration", icon: "↗", hint: "Review Jira dry-runs and imports" },
    { label: "Search", href: "/search", icon: "⌕", hint: "Find issues, docs, and comments" },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[12.5px] font-extrabold uppercase tracking-wide text-accent">Uinfo Nexus · Workspace home</p>
              <h1 className="mt-2 font-heading text-[34px] font-extrabold tracking-tight text-ink">{active.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                Data-backed command center for projects, docs, imports, recent activity, and assigned work. No schema or importer behavior changes in this dashboard slice.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/projects" className="rounded-xl bg-accent px-5 py-3 font-heading text-sm font-bold text-white hover:opacity-90">Open projects</Link>
                <Link href="/admin/migration" className="rounded-xl border border-card-border bg-card px-5 py-3 font-heading text-sm font-bold text-ink hover:border-accent hover:text-accent">Migration console</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-card-border bg-card/90 p-4 text-sm shadow-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Signed in as</p>
              <p className="mt-1 font-heading text-lg font-extrabold text-ink">{user.name}</p>
              <p className="text-xs font-semibold text-ink-secondary">{user.email}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Projects" value={active._count.projects} hint="Workhub project spaces" />
        <StatCard label="Issues" value={issueCount} hint={`${openIssueCount} open work items`} />
        <StatCard label="Docs" value={pageCount} hint={`${active._count.spaces} spaces`} />
        <StatCard label="Imports" value={importCount} hint="Jira/Atlassian jobs" />
        <StatCard label="Members" value={active._count.memberships} hint="Workspace users" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">My work</p>
              <h2 className="font-heading text-xl font-extrabold text-ink">Assigned open issues</h2>
            </div>
            <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{myWork.length}</span>
          </div>
          <ul className="mt-4 space-y-2">
            {myWork.map((issue) => (
              <li key={issue.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={issueHref(issue.project.key, issue.number)} className="font-heading font-extrabold text-accent">{issue.project.key}-{issue.number}</Link>
                    <Link href={issueHref(issue.project.key, issue.number)} className="ml-2 font-semibold text-ink hover:text-accent">{issue.title}</Link>
                  </div>
                  <span className="rounded bg-card px-2 py-1 text-[11px] font-extrabold uppercase text-ink-secondary">{issue.status.name}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-ink-secondary">
                  <span className="rounded bg-card px-2 py-1">{issue.project.name}</span>
                  <span className="rounded bg-card px-2 py-1">{issue.priority}</span>
                  <span className="rounded bg-card px-2 py-1">Due {formatDate(issue.dueDate)}</span>
                </div>
              </li>
            ))}
            {!myWork.length && <EmptyState>No open issues are assigned to you.</EmptyState>}
          </ul>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Quick actions</p>
              <h2 className="font-heading text-xl font-extrabold text-ink">Jump in</h2>
            </div>
            <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{quickActions.length}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {quickActions.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl border border-card-border bg-page p-4 transition hover:border-accent hover:bg-card">
                <span className="text-xl">{item.icon}</span>
                <p className="mt-2 font-heading text-sm font-extrabold text-ink">{item.label}</p>
                <p className="mt-1 text-xs font-semibold text-ink-secondary">{item.hint}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-extrabold text-ink">Recent projects</h2>
            <Link href="/projects" className="text-xs font-extrabold uppercase tracking-wide text-accent">View all</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {recentProjects.map((project) => (
              <li key={project.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/p/${project.key}/issues`} className="font-heading font-extrabold text-ink hover:text-accent">{project.name}</Link>
                  <span className="rounded bg-card px-2 py-1 text-[11px] font-bold text-ink-secondary">{project.key}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-ink-secondary">{project._count.issues} issues · updated {formatDate(project.updatedAt)}</p>
              </li>
            ))}
            {!recentProjects.length && <EmptyState>No projects yet.</EmptyState>}
          </ul>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-extrabold text-ink">Recent docs</h2>
            <Link href="/spaces" className="text-xs font-extrabold uppercase tracking-wide text-accent">Spaces</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {recentPages.map((page) => (
              <li key={page.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
                <Link href={`/s/${page.space.key}/pages/${page.id}`} className="font-heading font-extrabold text-ink hover:text-accent">{page.title}</Link>
                <p className="mt-1 text-xs font-semibold text-ink-secondary">{page.space.key} · {page.space.name} · updated {formatDate(page.updatedAt)}</p>
              </li>
            ))}
            {!recentPages.length && <EmptyState>No docs/pages yet.</EmptyState>}
          </ul>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-extrabold text-ink">Recent imports</h2>
            <Link href="/admin/migration" className="text-xs font-extrabold uppercase tracking-wide text-accent">Open admin</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {recentImports.map((job) => (
              <li key={job.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-heading font-extrabold text-ink">{job.name}</p>
                  <span className="rounded bg-card px-2 py-1 text-[11px] font-extrabold uppercase text-ink-secondary">{job.status}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-ink-secondary">{job.source} · {job.dryRun ? "dry run" : "import"} · {job.errors.length} recent errors · {formatDate(job.createdAt)}</p>
              </li>
            ))}
            {!recentImports.length && <EmptyState>No migration jobs yet.</EmptyState>}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Recent activity</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Workspace activity stream</h2>
          </div>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">latest {activityLogs.length}</span>
        </div>
        <ul className="mt-4 divide-y divide-card-border">
          {activityLogs.map((log) => {
            const payload = asRecord(log.payload);
            const title = textFrom(payload.title ?? payload.key ?? payload.pageId ?? payload.targetIssueId, log.entityId);
            return (
              <li key={log.id} className="grid gap-2 py-3 text-sm md:grid-cols-[160px_1fr_auto] md:items-center">
                <span className="font-semibold text-ink-secondary">{actorNames.get(log.actorId) ?? "Unknown actor"}</span>
                <div>
                  <span className="font-heading font-extrabold text-ink">{actionLabel(log.action)}</span>
                  <span className="ml-2 text-ink-secondary">{log.entityType} · {title}</span>
                </div>
                <span className="text-xs font-bold text-ink-secondary">{formatDate(log.createdAt)}</span>
              </li>
            );
          })}
          {!activityLogs.length && <EmptyState>No activity yet.</EmptyState>}
        </ul>
      </section>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-extrabold text-ink">Members</h2>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{members.length}</span>
        </div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {members.map((member) => (
            <li key={member.id} className="rounded-xl border border-card-border bg-page p-3 text-sm">
              <p className="font-heading font-extrabold text-ink">{member.user.name}</p>
              <p className="mt-1 truncate text-xs font-semibold text-ink-secondary">{member.user.email}</p>
              <span className="mt-2 inline-flex rounded-full bg-card px-2.5 py-1 text-[11px] font-extrabold uppercase text-ink-secondary">{member.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
