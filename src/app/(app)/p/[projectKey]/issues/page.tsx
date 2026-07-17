import type { ReactNode } from "react";
import Link from "next/link";
import {
  CircleDot,
  Kanban,
  List,
  CalendarDays,
  GanttChart,
  CheckCheck,
  Plus,
  BookOpen,
  Paperclip,
  TrendingUp,
  Archive,
  Command,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as issueService from "@/modules/issue/service";
import { createIssueAction } from "./actions";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { TimelineView } from "./TimelineView";

const TYPES = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] as const;
const PRIORITIES = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;
const VIEW_KEYS = ["summary", "board", "list", "calendar", "timeline", "approvals", "forms", "docs", "attachments", "reports", "archived", "shortcuts"] as const;
const APPROVAL_PATTERN = /approval|approve|review|pending/;

type ViewKey = (typeof VIEW_KEYS)[number];
type SearchParams = Record<string, string | undefined>;
type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE" | string;

type ProjectStatus = {
  id: string;
  name: string;
  category?: StatusCategory;
  position?: number;
};

type ProjectForView = {
  id: string;
  key: string;
  name: string;
  metadata?: unknown;
  statuses: ProjectStatus[];
};

type MemberForView = {
  user: {
    id: string;
    name: string | null;
  };
};

type LabelForView = {
  id: string;
  name: string;
};

type SavedFilterForView = {
  id: string;
  name: string;
  scope: string;
  filters: unknown;
};

type IssueLabelLink = {
  label?: {
    name?: string | null;
  } | null;
};

type IssuePageLink = {
  id: string;
  page?: {
    id: string;
    title: string;
    space: {
      key: string;
      name?: string | null;
    };
  } | null;
};

type IssueForView = {
  id: string;
  number: number;
  title: string;
  type: string;
  priority: string;
  statusId: string;
  status?: ProjectStatus | null;
  assignee?: { name: string | null } | null;
  reporter?: { name: string | null; email?: string | null } | null;
  dueDate?: Date | string | null;
  updatedAt?: Date | string | null;
  storyPoints?: number | null;
  customFields?: unknown;
  labels?: IssueLabelLink[] | null;
  pageLinks?: IssuePageLink[] | null;
  _count?: Partial<Record<"comments" | "attachments", number>> | null;
};

type ProjectSpaceView = { key: ViewKey; label: string; icon: ReactNode };

const S = 13;
const SW = 1.75;
const PROJECT_SPACE_VIEWS: ProjectSpaceView[] = [
  { key: "summary",     label: "Summary",     icon: <CircleDot   size={S} strokeWidth={SW} /> },
  { key: "board",       label: "Board",       icon: <Kanban      size={S} strokeWidth={SW} /> },
  { key: "list",        label: "List",        icon: <List        size={S} strokeWidth={SW} /> },
  { key: "calendar",    label: "Calendar",    icon: <CalendarDays size={S} strokeWidth={SW} /> },
  { key: "timeline",    label: "Timeline",    icon: <GanttChart  size={S} strokeWidth={SW} /> },
  { key: "approvals",   label: "Approvals",   icon: <CheckCheck  size={S} strokeWidth={SW} /> },
  { key: "forms",       label: "Forms",       icon: <Plus        size={S} strokeWidth={SW} /> },
  { key: "docs",        label: "Docs",        icon: <BookOpen    size={S} strokeWidth={SW} /> },
  { key: "attachments", label: "Attachments", icon: <Paperclip   size={S} strokeWidth={SW} /> },
  { key: "reports",     label: "Reports",     icon: <TrendingUp  size={S} strokeWidth={SW} /> },
  { key: "archived",    label: "Archived",    icon: <Archive     size={S} strokeWidth={SW} /> },
  { key: "shortcuts",   label: "Shortcuts",   icon: <Command     size={S} strokeWidth={SW} /> },
];

function parseView(value: string | undefined): ViewKey {
  return VIEW_KEYS.includes(value as ViewKey) ? (value as ViewKey) : "board";
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function dateLabel(value: Date | string | null | undefined, empty = "No due date") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function statusName(issue: IssueForView) {
  return issue.status?.name ?? "No status";
}

function statusClass(status?: ProjectStatus | null) {
  if (status?.category === "DONE") return "bg-[#E3FCEF] text-[#006644]";
  if (status?.category === "IN_PROGRESS") return "bg-[#E9F2FF] text-[#0C66E4]";
  return "bg-[#F1F2F4] text-[#44546F]";
}

function priorityClass(priority: string) {
  if (priority === "HIGHEST" || priority === "HIGH") return "bg-[#FFECEB] text-[#AE2A19]";
  if (priority === "LOW" || priority === "LOWEST") return "bg-[#E3FCEF] text-[#006644]";
  return "bg-[#FFF7D6] text-[#7F5F01]";
}

function relationCount(issue: IssueForView) {
  return pageLinksOf(issue).length + externalReferenceCount(issue);
}

function isDone(issue: IssueForView) {
  return issue.status?.category === "DONE";
}

function labelsOf(issue: IssueForView) {
  return (issue.labels ?? []).map((x) => x.label?.name).filter((name): name is string => Boolean(name));
}

function pageLinksOf(issue: IssueForView) {
  return (issue.pageLinks ?? []).filter((link): link is IssuePageLink & { page: NonNullable<IssuePageLink["page"]> } => Boolean(link.page));
}

function countOf(issue: IssueForView, key: "comments" | "attachments") {
  return issue._count?.[key] ?? 0;
}

function externalReferenceCount(issue: IssueForView) {
  if (!issue.customFields || typeof issue.customFields !== "object") return 0;
  const references = (issue.customFields as Record<string, unknown>).references;
  return Array.isArray(references) ? references.length : 0;
}

function issueHref(projectKey: string, issue: IssueForView) {
  return `/p/${projectKey}/issues/${projectKey}-${issue.number}`;
}

function filterRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function filterText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function savedFilterHref(projectKey: string, filter: SavedFilterForView, view: ViewKey) {
  const data = filterRecord(filter.filters);
  const params = new URLSearchParams({ view });
  for (const key of ["statusId", "type", "assigneeId", "label", "showJira"]) {
    const value = filterText(data[key]);
    if (value) params.set(key, value);
  }
  return `/p/${projectKey}/issues?${params.toString()}`;
}

function jiraField(issue: IssueForView, key: string) {
  return filterText(filterRecord(issue.customFields)[key]);
}

function EmptyState({ children }: { children: string }) {
  return <li className="rounded-lg border border-dashed border-card-border bg-page p-4 text-sm text-ink-secondary">{children}</li>;
}

function ProjectTabs({ projectKey, activeView }: { projectKey: string; activeView: ViewKey }) {
  return (
    <div className="overflow-x-auto border-t border-card-border bg-card/95 px-5">
      <div className="pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Spaces</div>
      <nav className="flex min-w-max items-center gap-1 pt-2" aria-label="Project space views">
        {PROJECT_SPACE_VIEWS.map((item) => {
          const active = item.key === activeView;
          return (
            <Link
              key={item.key}
              href={`/p/${projectKey}/issues?view=${item.key}`}
              className={`flex items-center gap-1.5 rounded-t-xl border-b-2 px-3 py-3 text-[13px] font-semibold transition ${active ? "border-accent bg-page text-accent" : "border-transparent text-ink-secondary hover:bg-page hover:text-ink"}`}
            >
              <span className="flex shrink-0 items-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function CreateIssueForm({ create, project, members }: { create: (formData: FormData) => void | Promise<void>; project: ProjectForView; members: MemberForView[] }) {
  const inputClass = "w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent-soft";
  return (
    <form action={create} className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <input type="hidden" name="projectId" value={project.id} />
      <div className="border-b border-card-border bg-[linear-gradient(135deg,#ffffff,#f6f7fa)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Project form</p>
            <h2 className="mt-1 font-heading text-xl font-extrabold text-ink">Create work item in {project.key}</h2>
            <p className="mt-1 text-sm text-ink-secondary">Uses the existing create action; no schema or importer behavior changes.</p>
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-soft-text">{project.statuses.length} statuses</span>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <FieldLabel label="Title">
            <input name="title" placeholder="What needs to be done?" required className={inputClass} />
          </FieldLabel>
          <FieldLabel label="Description / acceptance criteria">
            <textarea name="descriptionText" placeholder="Add Jira/Nexus context, links, acceptance criteria…" className={`${inputClass} min-h-40 resize-y`} />
          </FieldLabel>
        </div>

        <div className="rounded-2xl border border-card-border bg-page p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-extrabold text-ink">Nexus fields</h3>
            <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-secondary">required metadata</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <FieldLabel label="Type">
              <select name="type" defaultValue="TASK" className={inputClass}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            </FieldLabel>
            <FieldLabel label="Priority">
              <select name="priority" defaultValue="MEDIUM" className={inputClass}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
            </FieldLabel>
            <FieldLabel label="Status">
              <select name="statusId" defaultValue={project.statuses[0]?.id} className={inputClass}>{project.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select>
            </FieldLabel>
            <FieldLabel label="Assignee">
              <select name="assigneeId" defaultValue="" className={inputClass}><option value="">Unassigned</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name ?? "Unnamed user"}</option>)}</select>
            </FieldLabel>
            <FieldLabel label="Labels">
              <input name="labels" placeholder="labels, comma-separated" className={inputClass} />
            </FieldLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Story points">
                <input name="storyPoints" type="number" min="0" placeholder="Optional" className={inputClass} />
              </FieldLabel>
              <FieldLabel label="Due date">
                <input name="dueDate" type="date" className={inputClass} />
              </FieldLabel>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border bg-page px-5 py-4">
        <p className="text-xs font-semibold text-ink-secondary">New records appear in Summary, Board, List, Calendar, Timeline, and Activity-backed detail pages.</p>
        <button className="rounded-xl bg-accent px-5 py-2.5 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Create work item</button>
      </div>
    </form>
  );
}

function SavedFilterBar({ projectKey, filters, activeView }: { projectKey: string; filters: SavedFilterForView[]; activeView: ViewKey }) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Saved views</p>
          <h2 className="font-heading text-lg font-extrabold text-ink">Quick filter chips</h2>
        </div>
        <Link href={`/p/${projectKey}/settings`} className="rounded-full border border-card-border bg-page px-3 py-1 text-xs font-bold text-ink hover:border-accent hover:text-accent">Manage filters</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/p/${projectKey}/issues?view=${activeView}`} className="rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-white">All work items</Link>
        {filters.map((filter) => (
          <Link key={filter.id} href={savedFilterHref(projectKey, filter, activeView)} className="rounded-full border border-card-border bg-page px-3 py-1.5 text-xs font-bold text-ink-secondary hover:border-accent hover:bg-card hover:text-accent">
            {filter.name} · {filter.scope.toLowerCase()}
          </Link>
        ))}
        {!filters.length && <span className="rounded-full border border-dashed border-card-border bg-page px-3 py-1.5 text-xs font-bold text-ink-secondary">No saved filters yet</span>}
      </div>
    </section>
  );
}

function Filters({ project, members, labels, qs }: { project: ProjectForView; members: MemberForView[]; labels: LabelForView[]; qs: SearchParams }) {
  const inputClass = "w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft";
  const activeFilters = [qs.statusId, qs.type, qs.assigneeId, qs.label].filter(Boolean).length;
  return (
    <form className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <input type="hidden" name="view" value={parseView(qs.view)} />
      {qs.showJira === "1" && <input type="hidden" name="showJira" value="1" />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border bg-[linear-gradient(135deg,#ffffff,#f6f7fa)] px-4 py-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Filters</p>
          <h2 className="font-heading text-lg font-extrabold text-ink">Refine {project.key} work items</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-page px-3 py-1 text-ink-secondary">{activeFilters} active</span>
          <Link href={`/p/${project.key}/issues?view=${parseView(qs.view)}${qs.showJira === "1" ? "&showJira=1" : ""}`} className="rounded-full border border-card-border bg-card px-3 py-1 text-ink hover:border-accent hover:text-accent">Clear</Link>
          <Link href={`/p/${project.key}/issues?view=${parseView(qs.view)}${qs.showJira === "1" ? "" : "&showJira=1"}`} className={`rounded-full border px-3 py-1 ${qs.showJira === "1" ? "border-accent bg-accent text-white" : "border-card-border bg-card text-ink hover:border-accent hover:text-accent"}`}>Jira fields</Link>
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        <FieldLabel label="Status">
          <select name="statusId" defaultValue={qs.statusId ?? ""} className={inputClass}>
            <option value="">All statuses</option>
            {project.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Type">
          <select name="type" defaultValue={qs.type ?? ""} className={inputClass}>
            <option value="">All types</option>
            {TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Assignee">
          <select name="assigneeId" defaultValue={qs.assigneeId ?? ""} className={inputClass}>
            <option value="">All assignees</option>
            {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name ?? "Unnamed user"}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Label">
          <select name="label" defaultValue={qs.label ?? ""} className={inputClass}>
            <option value="">All labels</option>
            {labels.map((label) => <option key={label.id} value={label.name}>{label.name}</option>)}
          </select>
        </FieldLabel>
        <div className="flex items-end">
          <button className="w-full rounded-xl bg-accent px-3 py-2.5 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Apply filters</button>
        </div>
      </div>
    </form>
  );
}

function WorkItemLink({ issue, projectKey }: { issue: IssueForView; projectKey: string }) {
  const key = `${projectKey}-${issue.number}`;
  return <Link href={issueHref(projectKey, issue)} className="font-semibold text-accent">{key}</Link>;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function projectVisual(project: ProjectForView) {
  const metadata = metadataRecord(project.metadata);
  const icon = typeof metadata.icon === "string" && metadata.icon.trim() ? metadata.icon : project.key.slice(0, 2).toUpperCase();
  const coverColor = typeof metadata.coverColor === "string" ? metadata.coverColor : "blue";
  const theme = typeof metadata.theme === "string" ? metadata.theme : "nexus";
  const coverClass = {
    blue: "from-[#eef1fc] via-white to-[#f6f7fa]",
    green: "from-[#ecfdf5] via-white to-[#f6f7fa]",
    amber: "from-[#fffbeb] via-white to-[#f6f7fa]",
    violet: "from-[#f5f3ff] via-white to-[#f6f7fa]",
  }[coverColor] ?? "from-[#eef1fc] via-white to-[#f6f7fa]";
  const avatarClass = {
    nexus: "bg-accent text-white",
    risk: "bg-emerald-600 text-white",
    review: "bg-amber-500 text-white",
    ops: "bg-violet-600 text-white",
  }[theme] ?? "bg-accent text-white";
  return { icon, coverClass, avatarClass };
}

function activeViewLabel(view: ViewKey) {
  return PROJECT_SPACE_VIEWS.find((item) => item.key === view)?.label ?? "Board";
}

function accessLabel(memberCount: number) {
  return memberCount > 0 ? "Restricted members" : "Workspace open";
}

function ProjectHeader({ project, issues, activeView, projectMemberCount }: { project: ProjectForView; issues: IssueForView[]; activeView: ViewKey; projectMemberCount: number }) {
  const done = issues.filter(isDone).length;
  const open = issues.length - done;
  const docs = issues.reduce((sum, issue) => sum + pageLinksOf(issue).length, 0);
  const attachments = issues.reduce((sum, issue) => sum + countOf(issue, "attachments"), 0);
  const overdue = issues.filter((issue) => issue.dueDate && new Date(issue.dueDate).getTime() < Date.now() && !isDone(issue)).length;

  const visual = projectVisual(project);

  return (
    <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
      <div className={`bg-gradient-to-br ${visual.coverClass} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 gap-4">
            <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-heading text-xl font-extrabold shadow-sm ${visual.avatarClass}`}>{visual.icon}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-secondary">
                <Link href="/projects" className="hover:text-accent">Projects</Link>
                <span>/</span>
                <span>{project.key}</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-soft-text">{activeViewLabel(activeView)}</span>
                <span className="rounded-full bg-page px-2 py-0.5 text-ink-secondary ring-1 ring-card-border">{accessLabel(projectMemberCount)}</span>
              </div>
              <h1 className="mt-2 truncate font-heading text-[30px] font-extrabold tracking-tight text-ink">{project.name}</h1>
              <p className="mt-1 text-sm text-ink-secondary">Project space · real Nexus data · {project.statuses.length} workflow statuses · {projectMemberCount} project access members</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/p/${project.key}/backlog`} className="rounded-xl border border-card-border bg-card px-4 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent">Backlog</Link>
            <Link href={`/p/${project.key}/settings`} className="rounded-xl border border-card-border bg-card px-4 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent">Settings</Link>
            <Link href={`/p/${project.key}/issues?view=forms`} className="rounded-xl bg-accent px-4 py-2.5 font-heading text-sm font-bold text-white hover:opacity-90">＋ Create</Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Work items", value: issues.length },
            { label: "Open", value: open },
            { label: "Done", value: done },
            { label: "Overdue", value: overdue },
            { label: "Docs / files", value: `${docs} / ${attachments}` },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-card-border bg-card/90 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">{item.label}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      <ProjectTabs projectKey={project.key} activeView={activeView} />
    </section>
  );
}

function SummaryView({ project, issues }: { project: ProjectForView; issues: IssueForView[] }) {
  const done = issues.filter(isDone).length;
  const open = issues.length - done;
  const statusCounts = project.statuses.map((status) => ({ ...status, count: issues.filter((issue) => issue.statusId === status.id).length }));
  const now = Date.now();
  const overdue = issues.filter((issue) => issue.dueDate && new Date(issue.dueDate).getTime() < now && !isDone(issue)).length;
  const docs = issues.reduce((sum, issue) => sum + pageLinksOf(issue).length, 0);
  const comments = issues.reduce((sum, issue) => sum + countOf(issue, "comments"), 0);
  const recent = [...issues].sort((a, b) => +new Date(b.updatedAt ?? 0) - +new Date(a.updatedAt ?? 0)).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Total", value: issues.length, hint: "work items" },
          { label: "Open", value: open, hint: `${pct(open, issues.length)}%` },
          { label: "Done", value: done, hint: `${pct(done, issues.length)}%` },
          { label: "Overdue", value: overdue, hint: "needs attention" },
          { label: "Docs", value: docs, hint: "Codex links" },
          { label: "Comments", value: comments, hint: "activity" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{card.label}</p>
            <p className="mt-1 font-heading text-3xl font-extrabold text-ink">{card.value}</p>
            <p className="mt-1 text-xs font-semibold text-ink-secondary">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-extrabold text-ink">Status summary</h2>
            <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{project.statuses.length} statuses</span>
          </div>
          <div className="mt-4 space-y-3">
            {statusCounts.map((status) => (
              <div key={status.id} className="rounded-xl border border-card-border bg-page p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className={`rounded px-2 py-1 text-xs font-extrabold uppercase ${statusClass(status)}`}>{status.name}</span>
                  <span className="font-heading text-lg font-extrabold text-ink">{status.count}</span>
                </div>
                <div className="h-2 rounded-full bg-card"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct(status.count, issues.length)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-extrabold text-ink">Recently updated</h2>
            <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">latest 8</span>
          </div>
          <ul className="mt-3 divide-y divide-card-border text-sm">
            {recent.map((issue) => (
              <li key={issue.id} className="grid gap-2 py-3 md:grid-cols-[90px_1fr_auto] md:items-center">
                <WorkItemLink issue={issue} projectKey={project.key} />
                <div className="min-w-0">
                  <Link href={issueHref(project.key, issue)} className="block truncate font-semibold text-ink hover:text-accent">{issue.title}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-ink-secondary">
                    <span className={`rounded px-1.5 py-0.5 ${priorityClass(issue.priority)}`}>{issue.priority}</span>
                    {labelsOf(issue).slice(0, 2).map((label) => <span key={label} className="rounded bg-page px-1.5 py-0.5">{label}</span>)}
                  </div>
                </div>
                <span className={`w-fit rounded px-2 py-1 text-xs font-extrabold uppercase ${statusClass(issue.status)}`}>{statusName(issue)}</span>
              </li>
            ))}
            {!issues.length && <EmptyState>No work items yet.</EmptyState>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ListView({ project, issues, showJira }: { project: ProjectForView; issues: IssueForView[]; showJira: boolean }) {
  const colSpan = showJira ? 9 : 7;
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-4 py-3">
        <div>
          <h2 className="font-heading text-lg font-extrabold text-ink">Work item list</h2>
          <p className="text-sm text-ink-secondary">Compact Jira-style rows with real status, ownership, due date, docs, comments, attachments, and optional source fields.</p>
        </div>
        {showJira && <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-soft-text">Jira/source fields visible</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-page text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">
            <tr><th className="px-4 py-3">Key</th><th className="px-4 py-3">Summary</th>{showJira && <th className="px-4 py-3">Original Jira</th>}{showJira && <th className="px-4 py-3">Jira status</th>}<th className="px-4 py-3">Status</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assignee</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Signals</th></tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {issues.map((issue) => (
              <tr key={issue.id} className="hover:bg-page/70">
                <td className="px-4 py-3 align-top"><WorkItemLink issue={issue} projectKey={project.key} /></td>
                <td className="max-w-[420px] px-4 py-3 align-top">
                  <Link href={issueHref(project.key, issue)} className="block truncate font-semibold text-ink hover:text-accent">{issue.title}</Link>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-ink-secondary">
                    <span className="rounded bg-page px-1.5 py-0.5">{issue.type}</span>
                    {labelsOf(issue).slice(0, 3).map((label) => <span key={label} className="rounded bg-page px-1.5 py-0.5">{label}</span>)}
                  </div>
                </td>
                {showJira && <td className="px-4 py-3 align-top text-ink-secondary">{jiraField(issue, "originalJiraKey") || "—"}</td>}
                {showJira && <td className="px-4 py-3 align-top text-ink-secondary">{jiraField(issue, "jiraStatusName") || "—"}</td>}
                <td className="px-4 py-3 align-top"><span className={`rounded px-2 py-1 text-xs font-extrabold uppercase ${statusClass(issue.status)}`}>{statusName(issue)}</span></td>
                <td className="px-4 py-3 align-top"><span className={`rounded px-2 py-1 text-xs font-extrabold uppercase ${priorityClass(issue.priority)}`}>{issue.priority}</span></td>
                <td className="px-4 py-3 align-top text-ink-secondary">{issue.assignee?.name ?? "Unassigned"}</td>
                <td className="px-4 py-3 align-top text-ink-secondary">{dateLabel(issue.dueDate)}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-1.5 text-xs font-bold text-ink-secondary">
                    {issue.storyPoints !== null && issue.storyPoints !== undefined ? <span className="rounded bg-page px-2 py-1">{issue.storyPoints} pts</span> : null}
                    <span className="rounded bg-page px-2 py-1">💬 {countOf(issue, "comments")}</span>
                    <span className="rounded bg-page px-2 py-1">🔗 {relationCount(issue)}</span>
                    <span className="rounded bg-page px-2 py-1">📎 {countOf(issue, "attachments")}</span>
                  </div>
                </td>
              </tr>
            ))}
            {!issues.length && <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-ink-secondary">No work items match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecondaryIssueCard({ project, issue }: { project: ProjectForView; issue: IssueForView }) {
  return (
    <li className="rounded-xl border border-card-border bg-page p-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <WorkItemLink issue={issue} projectKey={project.key} />
          <Link href={issueHref(project.key, issue)} className="ml-2 font-semibold text-ink hover:text-accent">{issue.title}</Link>
        </div>
        <span className={`rounded px-2 py-1 text-[11px] font-extrabold uppercase ${statusClass(issue.status)}`}>{statusName(issue)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-ink-secondary">
        <span className={`rounded px-1.5 py-0.5 ${priorityClass(issue.priority)}`}>{issue.priority}</span>
        {issue.storyPoints !== null && issue.storyPoints !== undefined ? <span className="rounded bg-card px-1.5 py-0.5">{issue.storyPoints} pts</span> : null}
        {issue.dueDate ? <span className="rounded bg-card px-1.5 py-0.5">📅 {dateLabel(issue.dueDate)}</span> : null}
        {countOf(issue, "comments") > 0 ? <span className="rounded bg-card px-1.5 py-0.5">💬 {countOf(issue, "comments")}</span> : null}
        {relationCount(issue) > 0 ? <span className="rounded bg-card px-1.5 py-0.5">🔗 {relationCount(issue)}</span> : null}
        {countOf(issue, "attachments") > 0 ? <span className="rounded bg-card px-1.5 py-0.5">📎 {countOf(issue, "attachments")}</span> : null}
      </div>
    </li>
  );
}


function SimpleIssueList({ title, empty, project, issues }: { title: string; empty: string; project: ProjectForView; issues: IssueForView[] }) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-extrabold text-ink">{title}</h2>
        <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{issues.length}</span>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{issues.map((issue) => <SecondaryIssueCard key={issue.id} issue={issue} project={project} />)}{!issues.length && <EmptyState>{empty}</EmptyState>}</ul>
    </section>
  );
}

function DocsView({ project, issues }: { project: ProjectForView; issues: IssueForView[] }) {
  const linked = issues.flatMap((issue) => pageLinksOf(issue).map((link) => ({ issue, page: link.page })));
  return (
    <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-extrabold text-ink">Docs linked to work items</h2>
        <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{linked.length}</span>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {linked.map(({ issue, page }) => <li key={`${issue.id}-${page.id}`} className="rounded-xl border border-card-border bg-page p-3 text-sm"><WorkItemLink issue={issue} projectKey={project.key} /> <span className="mx-2 text-ink-secondary">→</span><Link className="font-semibold text-accent" href={`/s/${page.space.key}/pages/${page.id}`}>{page.space.key} / {page.title}</Link></li>)}
        {!linked.length && <EmptyState>No Uinfo Codex docs linked yet.</EmptyState>}
      </ul>
    </section>
  );
}

function ReportsView({ issues }: { issues: IssueForView[] }) {
  const byPriority = PRIORITIES.map((priority) => ({ priority, count: issues.filter((issue) => issue.priority === priority).length }));
  const done = issues.filter(isDone).length;
  const open = issues.length - done;
  const comments = issues.reduce((sum, issue) => sum + countOf(issue, "comments"), 0);
  const refs = issues.reduce((sum, issue) => sum + relationCount(issue), 0);
  const completion = pct(done, issues.length);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Completion</p>
            <h2 className="mt-1 font-heading text-4xl font-extrabold text-ink">{completion}%</h2>
            <p className="mt-1 text-sm text-ink-secondary">{done}/{issues.length} work items done · {open} open</p>
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-soft-text">Live data</span>
        </div>
        <div className="mt-5 h-3 rounded-full bg-page"><div className="h-3 rounded-full bg-accent" style={{ width: `${completion}%` }} /></div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          {[
            { label: "Open", value: open },
            { label: "Comments", value: comments },
            { label: "Refs/docs", value: refs },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-card-border bg-page p-3">
              <p className="text-[11px] font-bold uppercase text-ink-secondary">{item.label}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-extrabold text-ink">Priority breakdown</h2>
          <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">{issues.length} total</span>
        </div>
        <div className="mt-4 space-y-3">
          {byPriority.map((priority) => (
            <div key={priority.priority} className="grid grid-cols-[110px_1fr_42px] items-center gap-3">
              <span className={`w-fit rounded px-2 py-1 text-xs font-extrabold uppercase ${priorityClass(priority.priority)}`}>{priority.priority}</span>
              <div className="h-2 rounded-full bg-page"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct(priority.count, issues.length)}%` }} /></div>
              <span className="text-right font-heading text-lg font-extrabold text-ink">{priority.count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FormsView({ create, project, members }: { create: (formData: FormData) => void | Promise<void>; project: ProjectForView; members: MemberForView[] }) {
  const statusPreview = project.statuses.slice(0, 4);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Forms</p>
            <h2 className="mt-1 font-heading text-2xl font-extrabold text-ink">Create issue form</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-secondary">Dense Jira/Nexus form for creating project-scoped work items while preserving existing create behavior.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-ink-secondary">
            {statusPreview.map((status) => <span key={status.id} className={`rounded-full px-3 py-1 ${statusClass(status)}`}>{status.name}</span>)}
          </div>
        </div>
      </section>
      <CreateIssueForm create={create} project={project} members={members} />
    </div>
  );
}

function ShortcutsView({ project }: { project: ProjectForView }) {
  const shortcuts = [
    { label: "Backlog", href: `/p/${project.key}/backlog`, icon: "☷", hint: "Prioritize upcoming work" },
    { label: "Project settings", href: `/p/${project.key}/settings`, icon: "⚙", hint: "Workflow and access" },
    { label: "Global search", href: "/search", icon: "⌕", hint: "Find issues, docs, comments" },
    { label: "Migration admin", href: "/admin/migration", icon: "↗", hint: "Import dry-runs and mappings" },
  ];
  return (
    <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-extrabold text-ink">Shortcuts</h2>
        <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{shortcuts.length}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((item) => (
          <Link key={item.href} className="rounded-xl border border-card-border bg-page p-4 hover:border-accent hover:bg-card" href={item.href}>
            <span className="text-xl">{item.icon}</span>
            <p className="mt-2 font-heading text-sm font-extrabold text-ink">{item.label}</p>
            <p className="mt-1 text-xs font-semibold text-ink-secondary">{item.hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function getArchivedIssues(workspaceId: string, projectId: string) {
  return prisma.issue.findMany({
    where: { workspaceId, projectId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    include: { status: true },
  });
}

function buildKanbanIssues(projectKey: string, issues: IssueForView[]) {
  return issues.map((issue) => ({
    id: issue.id,
    key: `${projectKey}-${issue.number}`,
    title: issue.title,
    type: issue.type,
    priority: issue.priority,
    statusId: issue.statusId,
    labels: labelsOf(issue),
    assigneeName: issue.assignee?.name ?? null,
    reporterName: issue.reporter?.name ?? issue.reporter?.email ?? "Unknown creator",
    dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString() : null,
    storyPoints: issue.storyPoints ?? null,
    commentCount: countOf(issue, "comments"),
    attachmentCount: countOf(issue, "attachments"),
    docLinkCount: pageLinksOf(issue).length,
    referenceCount: externalReferenceCount(issue),
  }));
}

function findApprovalIssues(issues: IssueForView[]) {
  return issues.filter((issue) => APPROVAL_PATTERN.test([issue.title, statusName(issue), ...labelsOf(issue)].join(" ").toLowerCase()));
}

async function ProjectView({ view, activeWorkspaceId, project, issues, members, create, showJira, qs }: {
  view: ViewKey;
  activeWorkspaceId: string;
  project: ProjectForView;
  issues: IssueForView[];
  members: MemberForView[];
  create: (formData: FormData) => void | Promise<void>;
  showJira: boolean;
  qs: SearchParams;
}) {
  switch (view) {
    case "summary":
      return <SummaryView project={project} issues={issues} />;
    case "board":
      return <KanbanBoard statuses={project.statuses.map((status) => ({ id: status.id, name: status.name, category: status.category }))} initialIssues={buildKanbanIssues(project.key, issues)} projectKey={project.key} workspaceId={activeWorkspaceId} />;
    case "list":
      return <ListView project={project} issues={issues} showJira={showJira} />;
    case "calendar":
      return <CalendarView projectKey={project.key} issues={issues} monthParam={qs.month} />;
    case "timeline":
      return <TimelineView projectKey={project.key} issues={issues} />;
    case "approvals":
      return <SimpleIssueList title="Approvals" empty="No approval/review work items found. Add labels like approval/review or use approval statuses to populate this view." project={project} issues={findApprovalIssues(issues)} />;
    case "forms":
      return <FormsView create={create} project={project} members={members} />;
    case "docs":
      return <DocsView project={project} issues={issues} />;
    case "attachments":
      return <SimpleIssueList title="Attachments" empty="No work-item attachments yet." project={project} issues={issues.filter((issue) => countOf(issue, "attachments") > 0)} />;
    case "reports":
      return <ReportsView issues={issues} />;
    case "archived":
      return <SimpleIssueList title="Archived work items" empty="No archived work items." project={project} issues={await getArchivedIssues(activeWorkspaceId, project.id)} />;
    case "shortcuts":
      return <ShortcutsView project={project} />;
  }
}

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ projectKey: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { projectKey } = await params;
  const qs = await searchParams;
  if (!active) return <p>No active workspace</p>;

  const view = parseView(qs.view);
  const [{ projects, members, labels }, issues, savedFilters] = await Promise.all([
    issueService.getIssueContext(user.id, active.id),
    issueService.listIssues(user.id, active.id, { projectKey, statusId: qs.statusId, type: qs.type as never, assigneeId: qs.assigneeId, label: qs.label }),
    prisma.savedFilter.findMany({
      where: { workspaceId: active.id, OR: [{ ownerId: user.id }, { scope: "WORKSPACE" }], project: { key: projectKey.toUpperCase() } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, scope: true, filters: true },
    }),
  ]);
  const project = projects.find((candidate) => candidate.key === projectKey.toUpperCase());
  if (!project) return <p>Project not found</p>;
  const create = createIssueAction.bind(null, project.key);
  const projectMemberCount = await prisma.projectMember.count({ where: { projectId: project.id } });

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} issues={issues} activeView={view} projectMemberCount={projectMemberCount} />

      <div className="rounded-3xl border border-card-border bg-page p-5 shadow-sm">
        {view !== "forms" && view !== "summary" && view !== "board" && <div className="mb-4 space-y-4"><SavedFilterBar projectKey={project.key} filters={savedFilters} activeView={view} /><Filters project={project} members={members} labels={labels} qs={qs} /></div>}
        <ProjectView view={view} activeWorkspaceId={active.id} project={project} issues={issues} members={members} create={create} showJira={qs.showJira === "1"} qs={qs} />
      </div>
    </div>
  );
}
