"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers2,
  Bell,
  LayoutDashboard,
  Settings,
  BookOpen,
  FileText,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
import { signOutAction } from "@/app/(app)/auth-actions";

type Project = { id: string; key: string; name: string; _count?: { issues: number } };
type Space = { id: string; key: string; name: string; iconEmoji: string };

const iconByKey: Record<string, string> = {
  CTI: "🛡️", CTR: "📝", CPAR: "✅", DAR: "📨", GSR: "🎧",
  MA: "✅",  OM: "🎯",  RLGA: "⚖️", RLR: "📜", RA: "🚦",
  RAS: "⚠️", UCR: "📋", UDC: "📁", GWM: "🧭", IN: "🏦",
  UIA: "🔎", RTP: "🧩", TPM: "🏢", TPRM: "🧱", TPRR: "📊",
};

const STARRED_KEY = "workhub.starred.projects";
const RECENT_KEY = "workhub.recent.projects";
const MAX_RECENT = 3;

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function loadArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function saveSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

function saveArray(key: string, arr: string[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-4 text-[10px] font-semibold uppercase tracking-[.09em] text-sidebar-muted/60 first:pt-1">
      {children}
    </p>
  );
}

function NavItem({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-[7px] text-[12.5px] font-medium transition-colors ${
        isActive
          ? "bg-white/[.08] text-white"
          : "text-sidebar-text/60 hover:bg-white/[.05] hover:text-sidebar-text/90"
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
        {icon}
      </span>
      <span className="wh-sidebar-text min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="wh-collapse-hide flex h-4 min-w-4 items-center justify-center rounded-full bg-white/10 px-1 text-[10px] font-semibold tabular-nums text-sidebar-muted">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function ProjectRow({
  project,
  isStarred,
  onStar,
  onVisit,
}: {
  project: Project;
  isStarred: boolean;
  onStar: (id: string, e: React.MouseEvent) => void;
  onVisit: (id: string) => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(`/p/${project.key}`);
  const emoji = iconByKey[project.key];
  const abbr = project.key.slice(0, 2).toUpperCase();

  return (
    <div className="group/row relative">
      <Link
        href={`/p/${project.key}/issues`}
        onClick={() => onVisit(project.id)}
        className={`flex items-center gap-2 rounded-md px-2 py-[7px] pr-7 text-[12.5px] font-medium transition-colors ${
          isActive
            ? "bg-white/[.08] text-white"
            : "text-sidebar-text/60 hover:bg-white/[.05] hover:text-sidebar-text/90"
        }`}
      >
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-white/10 text-[9px] font-bold tracking-wide text-sidebar-text/70">
          {/* emoji shown in expanded mode, abbr shown in collapsed mode */}
          {emoji ? (
            <>
              <span className="wh-sidebar-text text-[13px]">{emoji}</span>
              <span className="wh-sidebar-show-collapsed">{abbr}</span>
            </>
          ) : (
            abbr
          )}
        </span>
        <span className="wh-sidebar-text min-w-0 flex-1 truncate">{project.name}</span>
      </Link>
      <button
        type="button"
        onClick={(e) => onStar(project.id, e)}
        title={isStarred ? "Unstar" : "Star"}
        className={`wh-collapse-hide absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[11px] transition-all focus:outline-none ${
          isStarred
            ? "text-yellow-400/90"
            : "text-sidebar-muted/40 opacity-0 group-hover/row:opacity-100 hover:text-yellow-400/80"
        }`}
      >
        {isStarred ? "★" : "☆"}
      </button>
    </div>
  );
}

export function AppSidebar({
  projects,
  spaces,
  userEmail,
  notificationCount,
  canAdmin = false,
}: {
  projects: Project[];
  spaces: Space[];
  userEmail: string;
  notificationCount: number;
  canAdmin?: boolean;
}) {
  const pathname = usePathname();
  const isCodex = pathname.startsWith("/spaces") || pathname.startsWith("/s/");
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [showAllProjects, setShowAllProjects] = useState(false);

  useEffect(() => {
    setStarredIds(loadSet(STARRED_KEY));
    setRecentIds(loadArray(RECENT_KEY));
  }, []);

  useEffect(() => {
    const match = pathname.match(/^\/p\/([^/]+)/);
    if (!match) return;
    const key = match[1].toUpperCase();
    const project = projects.find((p) => p.key === key);
    if (!project) return;
    setRecentIds((prev) => {
      const next = [project.id, ...prev.filter((id) => id !== project.id)].slice(0, MAX_RECENT);
      saveArray(RECENT_KEY, next);
      return next;
    });
  }, [pathname, projects]);

  const toggleStar = useCallback((projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      saveSet(STARRED_KEY, next);
      return next;
    });
  }, []);

  const recordVisit = useCallback((projectId: string) => {
    setRecentIds((prev) => {
      const next = [projectId, ...prev.filter((id) => id !== projectId)].slice(0, MAX_RECENT);
      saveArray(RECENT_KEY, next);
      return next;
    });
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const starredProjects = useMemo(() => projects.filter((p) => starredIds.has(p.id)), [projects, starredIds]);
  const recentProjects = useMemo(
    () => recentIds.map((id) => projectById.get(id)).filter(Boolean) as Project[],
    [recentIds, projectById],
  );

  return (
    <aside className="wh-sidebar sticky top-0 flex h-screen w-[256px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text">
      {/* Header */}
      <div className="flex h-[68px] items-center gap-2.5 border-b border-sidebar-border px-4">
        <Link href={isCodex ? "/spaces" : "/"} className="flex min-w-0 flex-1 items-center gap-2.5">
          {isCodex ? (
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-[#2D2B8E] text-[16px]">
              📚
            </span>
          ) : (
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-accent font-heading text-[13px] font-bold text-white">
              UN
            </span>
          )}
          <span className="wh-sidebar-text min-w-0">
            <span className="block truncate text-[13px] font-semibold text-white/90">
              {isCodex ? "Uinfo Codex" : "Uinfo Nexus"}
            </span>
            <span className="block text-[10.5px] text-sidebar-muted/70">
              {isCodex ? "Knowledge Base" : "Workspace"}
            </span>
          </span>
        </Link>
        <SidebarCollapseButton />
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {/* Primary */}
        <div className="flex flex-col gap-px">
          <NavItem href="/" icon={<Home size={14} strokeWidth={1.75} />} label="Home" />
          <NavItem href="/projects" icon={<Layers2 size={14} strokeWidth={1.75} />} label="Projects" />
          <NavItem
            href="/notifications"
            icon={<Bell size={14} strokeWidth={1.75} />}
            label="Notifications"
            badge={notificationCount > 0 ? String(notificationCount) : undefined}
          />
        </div>

        {/* Starred */}
        <SectionLabel>Starred</SectionLabel>
        <div className="flex flex-col gap-px">
          {starredProjects.length > 0 ? (
            starredProjects.map((p) => (
              <ProjectRow key={p.id} project={p} isStarred onStar={toggleStar} onVisit={recordVisit} />
            ))
          ) : (
            <p className="px-2 py-1 text-[11px] text-sidebar-muted/50">
              Hover a project and click ☆ to pin here
            </p>
          )}
        </div>

        {/* Recent */}
        <SectionLabel>Recent</SectionLabel>
        <div className="flex flex-col gap-px">
          {recentProjects.length > 0 ? (
            recentProjects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                isStarred={starredIds.has(p.id)}
                onStar={toggleStar}
                onVisit={recordVisit}
              />
            ))
          ) : (
            <p className="px-2 py-1 text-[11px] text-sidebar-muted/50">No recent projects yet</p>
          )}
        </div>

        {/* All Projects — expandable */}
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setShowAllProjects((v) => !v)}
            className="wh-sidebar-text flex w-full items-center gap-1.5 rounded-md px-2 py-[7px] text-[12.5px] font-medium text-sidebar-text/50 transition-colors hover:bg-white/[.05] hover:text-sidebar-text/80"
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <ChevronRight
                size={13}
                strokeWidth={2}
                className={`transition-transform duration-150 ${showAllProjects ? "rotate-90" : ""}`}
              />
            </span>
            <span className="wh-sidebar-text flex-1 text-left">All Projects</span>
            <span className="wh-sidebar-text rounded bg-white/[.07] px-1.5 py-px text-[10px] tabular-nums text-sidebar-muted/60">
              {projects.length}
            </span>
          </button>

          {showAllProjects && (
            <div className="mt-0.5 flex flex-col gap-px">
              {projects.slice(0, 10).map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  isStarred={starredIds.has(p.id)}
                  onStar={toggleStar}
                  onVisit={recordVisit}
                />
              ))}
              <Link
                href="/projects"
                className="mt-0.5 flex items-center gap-2 rounded-md px-2 py-[6px] text-[11.5px] font-medium text-sidebar-muted/40 transition-colors hover:bg-white/[.05] hover:text-sidebar-muted/80"
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                  <ArrowRight size={12} strokeWidth={2} />
                </span>
                <span className="wh-sidebar-text">
                  {projects.length > 10
                    ? `More Projects (${projects.length - 10} more)`
                    : "More Projects"}
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* Spaces */}
        <SectionLabel>Spaces</SectionLabel>
        <div className="flex flex-col gap-px">
          {spaces.slice(0, 4).map((space) => (
            <NavItem key={space.id} href={`/s/${space.key}`} icon={<span className="text-[14px] leading-none">{space.iconEmoji}</span>} label={space.name} />
          ))}
          <NavItem href="/spaces" icon={<FileText size={14} strokeWidth={1.75} />} label="Uinfo Codex" />
        </div>

        {/* Workspace */}
        <SectionLabel>Workspace</SectionLabel>
        <div className="flex flex-col gap-px">
          <NavItem href="/dashboards" icon={<LayoutDashboard size={14} strokeWidth={1.75} />} label="Dashboards" />
          {canAdmin && (
            <NavItem href="/admin" icon={<Settings size={14} strokeWidth={1.75} />} label="Admin" />
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[.06] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent text-[10.5px] font-bold text-white">
            {userEmail?.[0]?.toUpperCase() ?? "U"}
          </span>
          <div className="wh-footer-copy min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium text-white/70">{userEmail}</p>
            <form action={signOutAction}>
              <button type="submit" className="text-[10px] text-sidebar-muted/50 hover:text-sidebar-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
