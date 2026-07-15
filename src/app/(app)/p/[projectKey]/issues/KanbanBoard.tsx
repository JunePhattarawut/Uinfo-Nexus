"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, closestCorners, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

type Status = { id: string; name: string; category?: string };
type Issue = {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  statusId: string;
  labels: string[];
  assigneeName?: string | null;
  reporterName: string;
  dueDate?: string | null;
  storyPoints?: number | null;
  commentCount: number;
  attachmentCount: number;
  docLinkCount: number;
  referenceCount: number;
};

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  const intersectingCollisions = rectIntersection(args);
  if (intersectingCollisions.length > 0) return intersectingCollisions;

  return closestCorners(args);
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : name.slice(0, 2);
  return letters.toUpperCase() || "?";
}

function statusPillClass(status?: Status) {
  if (status?.category === "DONE") return "bg-[#94C748] text-[#172B4D]";
  if (status?.category === "IN_PROGRESS") return "bg-[#85B8FF] text-[#172B4D]";
  return "bg-[#E9EDF3] text-[#172B4D]";
}

function priorityClass(priority: string) {
  if (priority === "HIGHEST" || priority === "HIGH") return "bg-[#FFECEB] text-[#AE2A19]";
  if (priority === "LOW" || priority === "LOWEST") return "bg-[#E3FCEF] text-[#006644]";
  return "bg-[#FFF7D6] text-[#7F5F01]";
}

function typeBadge(type: string) {
  if (type === "BUG") return "🐞";
  if (type === "EPIC") return "⚡";
  if (type === "STORY") return "▣";
  if (type === "SUBTASK") return "↳";
  return "✓";
}

function dueLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

function IssueCard({ issue, projectKey, statuses, onStatusChange }: { issue: Issue; projectKey: string; statuses: Status[]; onStatusChange: (issueId: string, statusId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const articleRef = useRef<HTMLElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const style = { transform: CSS.Transform.toString(transform), transition };
  const current = statuses.find((status) => status.id === issue.statusId);
  const transitions = statuses.filter((status) => status.id !== issue.statusId);
  const due = dueLabel(issue.dueDate);
  const relationCount = issue.referenceCount + issue.docLinkCount;
  const personName = issue.assigneeName ?? issue.reporterName;

  useEffect(() => { setMounted(true); }, []);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggleDropdown() {
    if (!open && statusBtnRef.current) {
      const rect = statusBtnRef.current.getBoundingClientRect();
      const estimatedHeight = Math.max(transitions.length, 1) * 52 + 16;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= estimatedHeight
        ? rect.bottom + 4
        : rect.top - estimatedHeight - 4;
      setDropdownPos({ top, left: rect.left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <article
        ref={(el) => { setNodeRef(el); articleRef.current = el; }}
        style={style}
        className={`group relative rounded-xl border border-card-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${isDragging ? "opacity-50" : ""}`}
      >
        <div className="cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#E9F2FF] text-[12px] text-[#0C66E4]" title={issue.type}>{typeBadge(issue.type)}</span>
            <Link href={`/p/${projectKey}/issues/${issue.key}`} className="font-extrabold text-accent hover:underline">{issue.key}</Link>
            <span className={`rounded px-1.5 py-0.5 ${priorityClass(issue.priority)}`}>{issue.priority}</span>
          </div>
          <Link href={`/p/${projectKey}/issues/${issue.key}`} className="line-clamp-2 block text-[14px] font-semibold leading-[1.35] text-ink hover:text-accent">
            {issue.title}
          </Link>
        </div>

        {issue.labels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {issue.labels.slice(0, 3).map((label) => <span key={label} className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-bold text-[#44546F]">{label}</span>)}
            {issue.labels.length > 3 ? <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-bold text-[#44546F]">+{issue.labels.length - 3}</span> : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-ink-secondary">
          {issue.storyPoints !== null && issue.storyPoints !== undefined ? <span className="rounded bg-page px-2 py-1" title="Story points">{issue.storyPoints} pts</span> : null}
          {due ? <span className="rounded bg-page px-2 py-1" title="Due date">📅 {due}</span> : null}
          {issue.commentCount > 0 ? <span className="rounded bg-page px-2 py-1" title="Comments">💬 {issue.commentCount}</span> : null}
          {relationCount > 0 ? <span className="rounded bg-page px-2 py-1" title="References and Codex docs">🔗 {relationCount}</span> : null}
          {issue.attachmentCount > 0 ? <span className="rounded bg-page px-2 py-1" title="Attachments">📎 {issue.attachmentCount}</span> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-card-border pt-3 text-[12px] font-semibold text-ink-secondary">
          <button
            ref={statusBtnRef}
            type="button"
            onClick={toggleDropdown}
            onPointerDown={(event) => event.stopPropagation()}
            className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-bold text-[#172B4D] ${open ? "bg-[#DCDFE4] ring-2 ring-accent" : "bg-[#F1F2F4] hover:bg-[#DCDFE4]"}`}
            title="Change status"
          >
            {current?.name ?? "No status"} <span aria-hidden="true">⌄</span>
          </button>
          <button
            type="button"
            onClick={toggleDropdown}
            onPointerDown={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-card-border bg-card text-base text-ink-secondary hover:bg-page"
            title="Quick transitions"
          >
            ⚡
          </button>
          <span className="ml-auto text-[#00875A]" title="Real issue data loaded">✓</span>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C66E4] text-[12px] font-extrabold text-white shadow-sm" title={issue.assigneeName ? `Assigned to ${personName}` : `Created by ${personName}`} aria-label={issue.assigneeName ? `Assigned to ${personName}` : `Created by ${personName}`}>
            {initials(personName)}
          </span>
        </div>
      </article>

      {open && mounted && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="min-w-[260px] overflow-hidden rounded-lg border border-card-border bg-card py-1 shadow-xl"
        >
          {transitions.map((status) => (
            <button
              key={status.id}
              type="button"
              onClick={() => { setOpen(false); onStatusChange(issue.id, status.id); }}
              className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-page"
            >
              <span>Transition to</span>
              <span className="text-xl text-ink-secondary">→</span>
              <span className={`rounded px-2 py-0.5 text-[12px] font-extrabold uppercase ${statusPillClass(status)}`}>{status.name}</span>
            </button>
          ))}
          {!transitions.length ? <p className="px-4 py-3 text-sm text-ink-secondary">No other statuses</p> : null}
        </div>,
        document.body
      )}
    </>
  );
}

function Column({ status, issues, projectKey, statuses, onStatusChange }: { status: Status; issues: Issue[]; projectKey: string; statuses: Status[]; onStatusChange: (issueId: string, statusId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section ref={setNodeRef} className={`rounded-2xl border border-card-border bg-[#F7F8F9] p-3 transition ${isOver ? "ring-2 ring-accent" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink">{status.name}</h2>
        <span className="rounded-full bg-card px-2.5 py-1 text-xs font-bold text-ink-secondary">{issues.length}</span>
      </div>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-32 space-y-2.5">
          {issues.map((issue) => <IssueCard key={issue.id} issue={issue} projectKey={projectKey} statuses={statuses} onStatusChange={onStatusChange} />)}
          {issues.length === 0 && <p className="rounded-xl border border-dashed border-card-border bg-card/60 p-4 text-center text-sm font-semibold text-ink-secondary">Drop here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({ statuses, initialIssues, projectKey, workspaceId }: { statuses: Status[]; initialIssues: Issue[]; projectKey: string; workspaceId: string }) {
  const [issues, setIssues] = useState(initialIssues);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const statusIds = useMemo(() => new Set(statuses.map((s) => s.id)), [statuses]);
  const activeIssue = issues.find((i) => i.id === activeId) ?? null;

  function issuesFor(statusId: string, list = issues) {
    return list.filter((i) => i.statusId === statusId);
  }

  async function persistMove(issueId: string, statusId: string, next: Issue[]) {
    const column = issuesFor(statusId, next);
    const idx = column.findIndex((i) => i.id === issueId);
    const beforeIssueId = idx > 0 ? column[idx - 1].id : null;
    const afterIssueId = idx < column.length - 1 ? column[idx + 1].id : null;
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statusId, beforeIssueId, afterIssueId }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  function moveIssue(issueId: string, targetStatusId: string, overIssueId?: string) {
    const activeIssue = issues.find((i) => i.id === issueId);
    if (!activeIssue || activeIssue.statusId === targetStatusId && !overIssueId) return;
    const previous = issues;
    const without = issues.filter((i) => i.id !== activeIssue.id);
    const targetColumn = without.filter((i) => i.statusId === targetStatusId);
    const overIndex = overIssueId ? targetColumn.findIndex((i) => i.id === overIssueId) : targetColumn.length;
    const insertAt = overIndex < 0 ? targetColumn.length : overIndex;
    let seen = 0;
    const moved = { ...activeIssue, statusId: targetStatusId };
    const next: Issue[] = [];
    for (const issue of without) {
      if (issue.statusId === targetStatusId && seen === insertAt) next.push(moved);
      next.push(issue);
      if (issue.statusId === targetStatusId) seen += 1;
    }
    if (!next.some((i) => i.id === moved.id)) next.push(moved);
    setIssues(next);
    startTransition(async () => {
      try {
        await persistMove(activeIssue.id, targetStatusId, next);
        router.refresh();
      } catch (err) {
        console.error(err);
        setIssues(previous);
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    const overIssue = issues.find((i) => i.id === overId);
    const targetStatusId = statusIds.has(overId) ? overId : overIssue?.statusId;
    if (!targetStatusId) return;
    moveIssue(String(active.id), targetStatusId, overIssue?.id);
  }

  return (
    <DndContext id={`kanban-${projectKey}`} sensors={sensors} collisionDetection={kanbanCollisionDetection} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid gap-4 lg:grid-cols-3">
        {statuses.map((status) => <Column key={status.id} status={status} issues={issuesFor(status.id)} projectKey={projectKey} statuses={statuses} onStatusChange={moveIssue} />)}
      </div>
      <DragOverlay>{activeIssue ? <IssueCard issue={activeIssue} projectKey={projectKey} statuses={statuses} onStatusChange={moveIssue} /> : null}</DragOverlay>
    </DndContext>
  );
}
