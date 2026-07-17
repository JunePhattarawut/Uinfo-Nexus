"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { setIssueDueDateAction } from "./actions";

// ── Types ─────────────────────────────────────────────────────────
export type CalendarIssue = {
  id: string;
  number: number;
  title: string;
  priority: string;
  status?: { name?: string; category?: string } | null;
  dueDate?: Date | string | null;
};

// ── Constants ─────────────────────────────────────────────────────
const PRIORITY_DOT: Record<string, string> = {
  HIGHEST: "bg-red-500",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-amber-400",
  LOW: "bg-blue-400",
  LOWEST: "bg-gray-300",
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Helpers ───────────────────────────────────────────────────────
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseMonth(raw: string | undefined) {
  const today = new Date();
  if (!raw) return { year: today.getFullYear(), month: today.getMonth() };
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return { year: today.getFullYear(), month: today.getMonth() };
  return { year: y, month: m - 1 };
}

function monthStr(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function buildCells(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { date: Date; current: boolean }[] = [];

  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true });
  while (cells.length < 42)
    cells.push({ date: new Date(year, month + 1, cells.length - firstDow - daysInMonth + 1), current: false });

  return cells;
}

function buildIssueMap(issues: CalendarIssue[]) {
  const map: Record<string, CalendarIssue[]> = {};
  for (const issue of issues) {
    if (!issue.dueDate) continue;
    const key = toDateKey(new Date(issue.dueDate));
    map[key] = [...(map[key] ?? []), issue];
  }
  return map;
}

// ── Draggable issue chip ──────────────────────────────────────────
function DraggableChip({
  issue,
  projectKey,
  compact = false,
}: {
  issue: CalendarIssue;
  projectKey: string;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    data: { issue },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }
    : { opacity: isDragging ? 0.35 : 1 };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`group flex cursor-grab items-center gap-1 overflow-hidden rounded px-1 py-0.5 active:cursor-grabbing hover:bg-accent/8 touch-none ${isDragging ? "pointer-events-none" : ""}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[issue.priority] ?? "bg-gray-300"}`} />
        <Link
          href={`/p/${projectKey}/issues/${projectKey.toUpperCase()}-${issue.number}`}
          onClick={(e) => e.stopPropagation()}
          className={`truncate text-[10.5px] font-medium leading-tight ${
            issue.status?.category === "DONE" ? "text-ink-secondary line-through" : "text-ink"
          } group-hover:text-accent`}
        >
          {issue.title}
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group flex cursor-grab items-center gap-2 rounded-full border border-card-border bg-white px-2.5 py-1.5 shadow-sm active:cursor-grabbing hover:border-accent/50 hover:shadow-md transition-all touch-none ${isDragging ? "pointer-events-none" : ""}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[issue.priority] ?? "bg-gray-300"}`} />
      <span className="font-mono text-[10.5px] text-ink-secondary/60">{projectKey.toUpperCase()}-{issue.number}</span>
      <span className="max-w-[160px] truncate text-[12px] font-medium text-ink group-hover:text-accent">{issue.title}</span>
      <span className="ml-1 text-[11px] text-ink-secondary/40">⠿</span>
    </div>
  );
}

// ── Draggable overlay card (shown while dragging) ─────────────────
function IssueCard({ issue, projectKey }: { issue: CalendarIssue; projectKey: string }) {
  return (
    <div className="flex cursor-grabbing items-center gap-2.5 rounded-xl border border-accent/30 bg-white px-3 py-2.5 shadow-2xl ring-2 ring-accent/20 rotate-1">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[issue.priority] ?? "bg-gray-300"}`} />
      <span className="font-mono text-[11px] text-ink-secondary/70">{projectKey.toUpperCase()}-{issue.number}</span>
      <span className="max-w-[180px] truncate text-[13px] font-semibold text-ink">{issue.title}</span>
    </div>
  );
}

// ── Droppable calendar cell ───────────────────────────────────────
function DroppableCell({
  dateKey,
  date,
  isCurrent,
  isToday,
  isWeekend,
  issues,
  projectKey,
  isLastRow,
}: {
  dateKey: string;
  date: Date;
  isCurrent: boolean;
  isToday: boolean;
  isWeekend: boolean;
  issues: CalendarIssue[];
  projectKey: string;
  isLastRow: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[96px] border-b border-r border-card-border/50 p-1.5 transition-colors last:border-r-0 ${
        isLastRow ? "border-b-0" : ""
      } ${
        isOver
          ? "bg-accent/10 ring-2 ring-inset ring-accent/40"
          : !isCurrent
            ? "bg-page/30"
            : isWeekend
              ? "bg-page/20"
              : ""
      }`}
    >
      {/* Day number */}
      <div className="mb-1 flex justify-end">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
          isToday
            ? "bg-accent text-white"
            : isCurrent
              ? "text-ink"
              : "text-ink-secondary/40"
        }`}>
          {date.getDate()}
        </span>
      </div>

      {/* Drop hint */}
      {isOver && (
        <div className="mb-1 flex items-center justify-center rounded border-2 border-dashed border-accent/50 py-1 text-[10px] font-semibold text-accent/70">
          Drop here
        </div>
      )}

      {/* Issues */}
      <div className="space-y-0.5">
        {issues.slice(0, 3).map((issue) => (
          <DraggableChip key={issue.id} issue={issue} projectKey={projectKey} compact />
        ))}
        {issues.length > 3 && (
          <p className="px-1 text-[10px] font-semibold text-ink-secondary/60">+{issues.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export function CalendarViewClient({
  projectKey,
  initialIssues,
  monthParam,
}: {
  projectKey: string;
  initialIssues: CalendarIssue[];
  monthParam?: string;
}) {
  const today = new Date();
  const todayKey = toDateKey(today);
  const { year, month } = parseMonth(monthParam);

  // prev / next month
  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);

  // ── State (optimistic) ──────────────────────────────────────────
  const [issueMap, setIssueMap] = useState<Record<string, CalendarIssue[]>>(() =>
    buildIssueMap(initialIssues)
  );
  const [noDue, setNoDue] = useState<CalendarIssue[]>(() =>
    initialIssues.filter((i) => !i.dueDate)
  );
  const [activeIssue, setActiveIssue] = useState<CalendarIssue | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ── DnD handlers ───────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as CalendarIssue | undefined;
    setActiveIssue(issue ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveIssue(null);
      const { active, over } = event;
      if (!over) return;

      const issueId = active.id as string;
      const targetDateKey = over.id as string; // "YYYY-MM-DD"

      // Find the issue in current state
      const allWithDue = Object.values(issueMap).flat();
      const issue =
        noDue.find((i) => i.id === issueId) ??
        allWithDue.find((i) => i.id === issueId);
      if (!issue) return;

      const prevKey = issue.dueDate ? toDateKey(new Date(issue.dueDate)) : null;
      if (prevKey === targetDateKey) return; // no change

      // Optimistic update
      setNoDue((prev) => prev.filter((i) => i.id !== issueId));
      setIssueMap((prev) => {
        const next: Record<string, CalendarIssue[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = v.filter((i) => i.id !== issueId);
        }
        next[targetDateKey] = [
          ...(next[targetDateKey] ?? []),
          { ...issue, dueDate: targetDateKey },
        ];
        return next;
      });

      // Persist
      startTransition(() => {
        setIssueDueDateAction(issueId, targetDateKey);
      });
    },
    [issueMap, noDue]
  );

  const cells = buildCells(year, month);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold text-ink">
            {MONTH_NAMES[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <Link
              href={`?view=calendar&month=${monthStr(prev.getFullYear(), prev.getMonth())}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border bg-card text-[14px] text-ink-secondary hover:bg-page"
            >
              ‹
            </Link>
            <Link
              href={`?view=calendar&month=${monthStr(today.getFullYear(), today.getMonth())}`}
              className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink-secondary hover:bg-page"
            >
              Today
            </Link>
            <Link
              href={`?view=calendar&month=${monthStr(next.getFullYear(), next.getMonth())}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border bg-card text-[14px] text-ink-secondary hover:bg-page"
            >
              ›
            </Link>
          </div>
        </div>

        {/* ── Calendar grid ── */}
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-card-border">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="border-r border-card-border/50 px-2 py-2 text-center text-[11px] font-extrabold uppercase tracking-wider text-ink-secondary last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const key = toDateKey(cell.date);
              const dayIssues = issueMap[key] ?? [];
              return (
                <DroppableCell
                  key={key}
                  dateKey={key}
                  date={cell.date}
                  isCurrent={cell.current}
                  isToday={key === todayKey}
                  isWeekend={cell.date.getDay() === 0 || cell.date.getDay() === 6}
                  issues={dayIssues}
                  projectKey={projectKey}
                  isLastRow={idx >= 35}
                />
              );
            })}
          </div>
        </div>

        {/* ── No due date (drag source) ── */}
        {noDue.length > 0 && (
          <section className="rounded-2xl border border-dashed border-card-border bg-card/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-[12px] font-extrabold uppercase tracking-wider text-ink-secondary/60">
                No due date
              </p>
              <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
                {noDue.length}
              </span>
              <span className="ml-auto text-[11.5px] text-ink-secondary/50">
                ↑ Drag to a date cell to assign
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {noDue.map((issue) => (
                <DraggableChip key={issue.id} issue={issue} projectKey={projectKey} />
              ))}
            </div>
          </section>
        )}

        {/* ── Legend ── */}
        <div className="flex flex-wrap gap-4 text-[11.5px] text-ink-secondary">
          {Object.entries(PRIORITY_DOT).map(([p, cls]) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cls}`} />
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* ── Drag overlay ── */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeIssue ? <IssueCard issue={activeIssue} projectKey={projectKey} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
