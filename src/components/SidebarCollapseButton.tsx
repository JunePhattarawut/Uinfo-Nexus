"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const STORAGE_KEY = "workhub.sidebar.collapsed";

function applySidebarState(collapsed: boolean) {
  document.documentElement.classList.toggle("wh-sidebar-collapsed", collapsed);
}

export function SidebarCollapseButton() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "1";
    setCollapsed(saved);
    applySidebarState(saved);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      applySidebarState(next);
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted/50 transition-colors hover:bg-white/[.06] hover:text-sidebar-muted focus:outline-none"
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
    >
      {collapsed ? (
        <PanelLeftOpen size={14} strokeWidth={1.75} />
      ) : (
        <PanelLeftClose size={14} strokeWidth={1.75} />
      )}
    </button>
  );
}
