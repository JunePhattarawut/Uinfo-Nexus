"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type AppItem = {
  href: string;
  icon: string;
  label: string;
  note?: string;
};

const APPS: AppItem[] = [
  { href: "/", icon: "⌂", label: "Home" },
  { href: "/projects", icon: "🟦", label: "Uinfo Nexus" },
  { href: "/spaces", icon: "📘", label: "Uinfo Codex" },
  { href: "/admin/migration", icon: "🧭", label: "Migration" },
  { href: "/operations", icon: "⚡", label: "Operations" },
  { href: "/admin", icon: "👥", label: "Teams" },
];

export function SidebarCollapseButton() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("workhub.sidebarCollapsed") === "1";
    setCollapsed(stored);
    document.documentElement.classList.toggle("wh-sidebar-collapsed", stored);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("wh-sidebar-collapsed", next);
    window.localStorage.setItem("workhub.sidebarCollapsed", next ? "1" : "0");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md px-1.5 py-1.5 text-xl text-sidebar-muted hover:bg-sidebar-active hover:text-white focus:outline-none focus:ring-2 focus:ring-accent"
      title={collapsed ? "Expand sidebar [" : "Collapse sidebar ["}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
    >
      {collapsed ? "▰" : "▱"}
    </button>
  );
}

export function AppSwitcherButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`rounded-md px-1.5 py-1.5 text-xl text-sidebar-muted hover:bg-sidebar-active hover:text-white focus:outline-none focus:ring-2 focus:ring-accent ${open ? "bg-sidebar-active text-white" : ""}`}
        title="Switch sites or apps"
        aria-label="Switch sites or apps"
        aria-expanded={open}
      >
        ▦
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-[360px] rounded-xl border border-card-border bg-card p-3 shadow-2xl">
          <div className="space-y-1">
            {APPS.map((app) => (
              <Link key={app.label} href={app.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-ink hover:bg-page">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-page text-xl">{app.icon}</span>
                <span className="text-sm font-bold">{app.label}</span>
                {app.note ? <span className="ml-auto rounded-full bg-accent-soft px-2 py-px text-xs font-bold text-accent-soft-text">{app.note}</span> : null}
              </Link>
            ))}
          </div>
          <div className="mt-3 border-t border-card-border pt-3">
            <p className="px-3 text-xs font-bold uppercase tracking-wide text-ink-secondary">Recommended for your team</p>
            <Link href="/projects/new" onClick={() => setOpen(false)} className="mt-2 flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-page">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-lg">🧩</span>
              <span>
                <span className="block text-sm font-bold text-ink">Create Uinfo Nexus project</span>
                <span className="block text-xs text-ink-secondary">Kanban, Scrum, task tracking, or imported style</span>
              </span>
            </Link>
            <Link href="/spaces" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-page">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-page text-lg">📘</span>
              <span className="text-sm font-bold text-ink">Open Uinfo Codex</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
