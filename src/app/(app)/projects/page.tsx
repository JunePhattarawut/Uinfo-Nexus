import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";

const iconByKey: Record<string, string> = {
  CTI: "🛡️",
  CTR: "📝",
  CPAR: "✅",
  DAR: "📨",
  GSR: "🎧",
  MA: "✅",
  OM: "🎯",
  RLGA: "⚖️",
  RLR: "📜",
  RA: "🚦",
  RAS: "⚠️",
  UCR: "📋",
  UDC: "📁",
  GWM: "🧭",
  IN: "🏦",
  UIA: "🔎",
  RTP: "🧩",
  TPM: "🏢",
  TPRM: "🧱",
  TPRR: "📊",
};

type ProjectForDirectory = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  metadata: unknown;
  updatedAt: Date;
  statuses: { id: string; name: string; category: string; position: number }[];
  _count: { issues: number; sprints: number; members: number };
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function projectVisual(project: Pick<ProjectForDirectory, "key" | "metadata">) {
  const metadata = metadataRecord(project.metadata);
  const icon = typeof metadata.icon === "string" && metadata.icon.trim() ? metadata.icon : iconByKey[project.key] ?? project.key.slice(0, 2);
  const coverColor = typeof metadata.coverColor === "string" ? metadata.coverColor : "blue";
  const theme = typeof metadata.theme === "string" ? metadata.theme : "nexus";
  const coverClass = {
    blue: "from-[#3357d6] via-[#7b8cff] to-[#eef1fc]",
    green: "from-[#0f766e] via-[#34d399] to-[#ecfdf5]",
    amber: "from-[#b45309] via-[#f59e0b] to-[#fffbeb]",
    violet: "from-[#6d28d9] via-[#8b5cf6] to-[#f5f3ff]",
  }[coverColor] ?? "from-[#3357d6] via-[#7b8cff] to-[#eef1fc]";
  const iconClass = {
    nexus: "bg-accent-soft text-accent-soft-text",
    risk: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    ops: "bg-violet-50 text-violet-700",
  }[theme] ?? "bg-accent-soft text-accent-soft-text";
  return { icon, coverClass, iconClass };
}

function ProjectIcon({ project }: { project: ProjectForDirectory }) {
  const visual = projectVisual(project);
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-extrabold shadow-sm ring-1 ring-card-border ${visual.iconClass}`}>
      {visual.icon}
    </span>
  );
}

function SourceBadge({ imported }: { imported: boolean }) {
  return imported ? (
    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-soft-text">Jira imported</span>
  ) : (
    <span className="rounded-full bg-page px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-secondary ring-1 ring-card-border">Manual</span>
  );
}

function AccessBadge({ memberCount }: { memberCount: number }) {
  return memberCount > 0 ? (
    <span className="rounded-full bg-[#FFF7D6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#7F5F01]">Restricted members</span>
  ) : (
    <span className="rounded-full bg-[#E3FCEF] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#006644]">Workspace open</span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
      <p className="text-[12px] font-bold uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink-secondary">{hint}</p>
    </section>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}

function workflowLabel(project: ProjectForDirectory) {
  if (!project.statuses.length) return "No workflow statuses";
  return project.statuses.map((status) => status.name).join(" → ");
}

function ProjectCard({ project, imported }: { project: ProjectForDirectory; imported: boolean }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
      <div className={`h-2 bg-gradient-to-r ${projectVisual(project).coverClass}`} />
      <div className="p-4">
      <div className="flex items-start gap-3">
        <ProjectIcon project={project} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/p/${project.key}/issues`} className="truncate font-heading text-lg font-extrabold text-ink hover:text-accent">
              {project.name}
            </Link>
            <SourceBadge imported={imported} />
            <AccessBadge memberCount={project._count.members} />
          </div>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-secondary">{project.key}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-ink-secondary">
        {project.description || "No project description yet. Add purpose, owner, or migration notes when this space is reviewed."}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-page p-3">
          <p className="font-heading text-xl font-extrabold text-ink">{project._count.issues}</p>
          <p className="text-[11px] font-semibold text-ink-secondary">Issues</p>
        </div>
        <div className="rounded-xl bg-page p-3">
          <p className="font-heading text-xl font-extrabold text-ink">{project.statuses.length}</p>
          <p className="text-[11px] font-semibold text-ink-secondary">Statuses</p>
        </div>
        <div className="rounded-xl bg-page p-3">
          <p className="font-heading text-xl font-extrabold text-ink">{project._count.members}</p>
          <p className="text-[11px] font-semibold text-ink-secondary">Access members</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-card-border bg-page p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Workflow</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink" title={workflowLabel(project)}>{workflowLabel(project)}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-xs text-ink-secondary">Updated {formatDate(project.updatedAt)}</span>
        <div className="flex gap-2">
          <Link href={`/p/${project.key}/issues?view=list`} className="rounded-lg border border-card-border bg-page px-3 py-2 font-semibold text-ink hover:border-accent hover:text-accent">List</Link>
          <Link href={`/p/${project.key}/issues`} className="rounded-lg bg-accent px-3 py-2 font-bold text-white hover:opacity-90">Open</Link>
        </div>
      </div>
      </div>
    </article>
  );
}

function EmptyProjects() {
  return (
    <section className="rounded-3xl border border-dashed border-card-border bg-card p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-3xl">▦</div>
      <h2 className="mt-5 font-heading text-2xl font-extrabold text-ink">No active projects</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-secondary">
        Start a Workhub-native project or prepare a Jira dry-run. This keeps Nexus data-backed while allowing Plane-inspired project workflows later.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/projects/new" className="rounded-xl bg-accent px-5 py-3 font-heading text-sm font-bold text-white hover:opacity-90">Start your first project</Link>
        <Link href="/admin/migration" className="rounded-xl border border-card-border bg-page px-5 py-3 font-heading text-sm font-bold text-ink hover:border-accent hover:text-accent">Import from Jira</Link>
      </div>
    </section>
  );
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;

  const [projects, mappings] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: active.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        updatedAt: true,
        metadata: true,
        statuses: { orderBy: { position: "asc" }, select: { id: true, name: true, category: true, position: true } },
        _count: { select: { issues: true, sprints: true, members: true } },
      },
    }),
    prisma.externalMapping.findMany({
      where: { workspaceId: active.id, source: "JIRA", entityType: "project", localType: "project" },
      select: { localId: true },
    }),
  ]);

  const importedIds = new Set(mappings.map((mapping) => mapping.localId));
  const importedCount = projects.filter((project) => importedIds.has(project.id)).length;
  const issueTotal = projects.reduce((sum, project) => sum + project._count.issues, 0);
  const activeProjects = projects.filter((project) => project._count.issues > 0).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-wide text-accent">Uinfo Nexus · Project directory</p>
            <h1 className="mt-2 font-heading text-[34px] font-extrabold tracking-tight text-ink">Projects</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
              Workhub-native project hub inspired by Plane: fast project entry, clear empty states, Jira import badges, real issue counts, and workflow previews without copying Plane code.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/projects/new" className="rounded-xl bg-accent px-5 py-3 font-heading text-sm font-bold text-white hover:opacity-90">＋ Create project</Link>
              <Link href="/admin/migration" className="rounded-xl border border-card-border bg-page px-5 py-3 font-heading text-sm font-bold text-ink hover:border-accent hover:text-accent">Import / dry-run Jira</Link>
            </div>
          </div>
          <div className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-soft-text ring-1 ring-accent/10">
            <p className="font-heading text-base font-extrabold">Data fidelity guardrail</p>
            <p className="mt-2 leading-6">
              This page reads live Workhub DB records only. Jira keys, issue counts, statuses, and import mappings remain the source of truth.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Projects" value={projects.length} hint={`${activeProjects} with active issue data`} />
        <StatCard label="Work items" value={issueTotal} hint="Real Nexus issues across projects" />
        <StatCard label="Jira mapped" value={importedCount} hint="Projects linked through ExternalMapping" />
      </div>

      {projects.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => <ProjectCard key={project.id} project={project} imported={importedIds.has(project.id)} />)}
        </section>
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
