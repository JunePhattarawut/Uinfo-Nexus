"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type PageNode = { id: string; title: string; emoji?: string | null; parentId: string | null; rank: string };
type FlatPage = PageNode & { depth: number };
type RowMode = "idle" | "menu" | "rename" | "newchild";

function flatten(pages: PageNode[], parentId: string | null = null, depth = 0): FlatPage[] {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .flatMap((page) => [{ ...page, depth }, ...flatten(pages, page.id, depth + 1)]);
}

function storageKey(spaceKey: string) {
  return `codex-tree-collapsed-${spaceKey}`;
}

function loadCollapsed(spaceKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(spaceKey));
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function saveCollapsed(spaceKey: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(spaceKey), JSON.stringify([...ids]));
  } catch {}
}

function SortablePageRow({
  page,
  spaceKey,
  disabled,
  hasChildren,
  isExpanded,
  isActive,
  onToggle,
  createPageAction,
  renamePageAction,
  onRenameComplete,
}: {
  page: FlatPage;
  spaceKey: string;
  disabled: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: (id: string) => void;
  createPageAction: (fd: FormData) => Promise<void>;
  renamePageAction: (fd: FormData) => Promise<void>;
  onRenameComplete: (pageId: string, newTitle: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, disabled });
  const [mode, setMode] = useState<RowMode>("idle");
  const [localTitle, setLocalTitle] = useState(page.title);
  const [, startRenameTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync localTitle when not renaming (handles optimistic update + server refresh)
  useEffect(() => {
    if (mode !== "rename") setLocalTitle(page.title);
  }, [page.title, mode]);

  // Close menu on outside click
  useEffect(() => {
    if (mode !== "menu") return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMode("idle");
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [mode]);

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = localTitle.trim();
      if (trimmed && trimmed !== page.title) {
        onRenameComplete(page.id, trimmed);
        const fd = new FormData();
        fd.append("pageId", page.id);
        fd.append("title", trimmed);
        startRenameTransition(() => { void renamePageAction(fd); });
      }
      setMode("idle");
    } else if (e.key === "Escape") {
      setMode("idle");
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, marginLeft: page.depth * 14 }}
      className={`group flex flex-col rounded-lg border border-transparent bg-white text-sm ${isDragging ? "border-accent bg-accent-soft shadow-lg" : "hover:border-card-border hover:bg-page"}`}
      data-page-id={page.id}
      data-parent-id={page.parentId ?? "root"}
    >
      <div className={`flex items-center gap-1.5 px-2 py-1.5 ${isActive ? "rounded-lg bg-accent/8" : ""}`}>
        <button
          type="button"
          aria-label={`Drag ${page.title}`}
          title="Drag to reorder in the page tree"
          className="cursor-grab rounded border border-card-border bg-page px-1.5 py-0.5 text-[10px] font-extrabold text-ink-secondary opacity-0 active:cursor-grabbing group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          aria-label={isExpanded ? `Collapse ${page.title}` : `Expand ${page.title}`}
          onClick={() => onToggle(page.id)}
          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] text-ink-secondary transition-colors hover:bg-card hover:text-ink ${!hasChildren ? "invisible pointer-events-none" : ""}`}
        >
          {isExpanded ? "▾" : "▸"}
        </button>

        <span className="shrink-0 text-[13px] leading-none">{page.emoji ?? "📄"}</span>

        {mode === "rename" ? (
          <input
            autoFocus
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => setMode("idle")}
            className="min-w-0 flex-1 rounded border border-accent px-2 py-0.5 text-[12.5px] font-semibold text-ink outline-none ring-1 ring-accent/30"
          />
        ) : (
          <Link
            className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-[12.5px] font-semibold transition-colors ${isActive ? "text-accent" : "text-ink hover:text-accent"}`}
            href={`/s/${spaceKey}/pages/${page.id}`}
          >
            {localTitle}
          </Link>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Actions for ${page.title}`}
            onClick={() => setMode((m) => (m === "menu" ? "idle" : "menu"))}
            className="hidden h-6 w-6 items-center justify-center rounded text-sm font-extrabold leading-none text-ink-secondary hover:bg-card hover:text-ink group-hover:flex"
          >
            ···
          </button>
          {mode === "menu" && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[148px] rounded-lg border border-card-border bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-page"
                onClick={() => setMode("newchild")}
              >
                <span className="text-ink-secondary">↳</span> New child page
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-page"
                onClick={() => { setLocalTitle(page.title); setMode("rename"); }}
              >
                <span className="text-ink-secondary">✎</span> Rename
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === "newchild" && (
        <form
          action={createPageAction}
          className="mx-2 mb-2 space-y-2 rounded-lg border border-card-border bg-page p-2"
          onSubmit={() => setMode("idle")}
        >
          <input type="hidden" name="parentId" value={page.id} />
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-accent">
            New child of &quot;{localTitle}&quot;
          </p>
          <input
            autoFocus
            name="title"
            required
            placeholder="Page title"
            className="w-full rounded border border-card-border px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-accent"
            onKeyDown={(e) => { if (e.key === "Escape") setMode("idle"); }}
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-accent px-3 py-1 text-xs font-extrabold text-white hover:bg-accent/90">
              Create
            </button>
            <button
              type="button"
              className="rounded-lg border border-card-border px-3 py-1 text-xs font-semibold text-ink-secondary hover:bg-card"
              onClick={() => setMode("idle")}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export function CodexPageTreeDnd({
  pages,
  spaceKey,
  createPageAction,
  renamePageAction,
  activePageId,
}: {
  pages: PageNode[];
  spaceKey: string;
  createPageAction: (fd: FormData) => Promise<void>;
  renamePageAction: (fd: FormData) => Promise<void>;
  activePageId?: string;
}) {
  const [items, setItems] = useState(() => flatten(pages));
  const [message, setMessage] = useState("Drag a page onto a sibling to reorder within that sibling group.");
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // null = not yet hydrated from localStorage (render all expanded to match SSR)
  const [collapsedIds, setCollapsedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setCollapsedIds(loadCollapsed(spaceKey));
  }, [spaceKey]);

  const pagesWithChildren = useMemo(
    () => new Set(pages.filter((p) => p.parentId !== null).map((p) => p.parentId as string)),
    [pages],
  );

  const toggleExpanded = useCallback(
    (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        saveCollapsed(spaceKey, next);
        return next;
      });
    },
    [spaceKey],
  );

  const effectiveCollapsed = useMemo(() => collapsedIds ?? new Set<string>(), [collapsedIds]);

  const visibleItems = useMemo(() => {
    const idToItem = new Map(items.map((i) => [i.id, i]));
    return items.filter((item) => {
      let cur: FlatPage | undefined = item;
      while (cur?.parentId != null) {
        if (effectiveCollapsed.has(cur.parentId)) return false;
        cur = idToItem.get(cur.parentId);
      }
      return true;
    });
  }, [items, effectiveCollapsed]);

  const ids = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);

  const onRenameComplete = useCallback((pageId: string, newTitle: string) => {
    setItems((prev) => prev.map((item) => item.id === pageId ? { ...item, title: newTitle } : item));
  }, []);

  async function persistMove(activeId: string, overId: string) {
    const dragged = items.find((item) => item.id === activeId);
    const over = items.find((item) => item.id === overId);
    if (!dragged || !over || dragged.id === over.id) return;
    const siblings = items.filter((item) => item.parentId === over.parentId && item.id !== dragged.id);
    const overSiblingIndex = siblings.findIndex((item) => item.id === over.id);
    const beforePageId = over.id;
    const afterPageId = overSiblingIndex > 0 ? siblings[overSiblingIndex - 1]?.id ?? null : null;
    const optimistic = items.map((item) => item.id === dragged.id ? { ...item, parentId: over.parentId, depth: over.depth } : item);
    setItems(optimistic);
    setMessage("Saving page tree order…");
    const response = await fetch("/api/codex/pages/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceKey, pageId: dragged.id, parentId: over.parentId, beforePageId, afterPageId }),
    });
    if (!response.ok) {
      setItems(flatten(pages));
      setMessage("Move failed. Reloading original tree state.");
      return;
    }
    setMessage(`Moved "${dragged.title}" near "${over.title}".`);
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    startTransition(() => { void persistMove(activeId, overId); });
  }

  return (
    <div className="space-y-3" data-testid="codex-page-tree-dnd">
      <div className="rounded-xl border border-card-border bg-page p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Page tree</p>
        <p className="mt-1 text-xs font-semibold text-ink-secondary">{message}</p>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1 opacity-100 data-[pending=true]:opacity-70" data-pending={isPending ? "true" : "false"}>
            {visibleItems.map((page) => (
              <SortablePageRow
                key={page.id}
                page={page}
                spaceKey={spaceKey}
                disabled={isPending}
                hasChildren={pagesWithChildren.has(page.id)}
                isExpanded={!effectiveCollapsed.has(page.id)}
                isActive={page.id === activePageId}
                onToggle={toggleExpanded}
                createPageAction={createPageAction}
                renamePageAction={renamePageAction}
                onRenameComplete={onRenameComplete}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
