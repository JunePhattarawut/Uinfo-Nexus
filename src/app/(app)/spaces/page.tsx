import Link from "next/link";
import { BookOpen, Plus, Clock, FileText, MessageSquare, ChevronRight, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import * as codex from "@/modules/codex/service";
import { createSpaceAction } from "./actions";

const EMOJI_PRESETS = ["📄","📚","🗂️","🏗️","🚀","🧪","🎨","🔧","📊","🛡️","🌐","⚙️","💡","📋","🔬","🤝"];

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function CodexHomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p className="p-8 text-ink-secondary">No active workspace.</p>;

  const { q } = await searchParams;
  const searchQuery = (q ?? "").trim();

  const [spaces, recentPages, totalPages, totalComments, searchResults] = await Promise.all([
    prisma.space.findMany({
      where: { workspaceId: active.id },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { pages: { where: { deletedAt: null } } } },
        pages: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 3,
          select: { id: true, title: true, emoji: true, updatedAt: true },
        },
      },
    }),
    prisma.page.findMany({
      where: { workspaceId: active.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        emoji: true,
        updatedAt: true,
        space: { select: { key: true, name: true, iconEmoji: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.page.count({ where: { workspaceId: active.id, deletedAt: null } }),
    prisma.comment.count({ where: { page: { workspaceId: active.id, deletedAt: null } } }),
    searchQuery ? codex.searchPages(user.id, active.id, searchQuery) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-7">
      {/* ── Header ── */}
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 bg-[linear-gradient(135deg,#eef1fc,#ffffff_60%,#f0faf5)] px-8 py-7 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-xl">📚</span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-accent">Uinfo Codex</p>
                <h1 className="font-heading text-[28px] font-extrabold leading-tight tracking-tight text-ink">Knowledge Base</h1>
              </div>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-secondary">
              Wiki-style docs, page trees, version history — all linked to Uinfo Nexus issues.
            </p>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Spaces",   value: spaces.length,   icon: <BookOpen size={13} strokeWidth={2} /> },
              { label: "Pages",    value: totalPages,       icon: <FileText size={13} strokeWidth={2} /> },
              { label: "Comments", value: totalComments,    icon: <MessageSquare size={13} strokeWidth={2} /> },
            ].map((s) => (
              <div key={s.label} className="flex min-w-[90px] flex-col items-center rounded-2xl border border-card-border bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-1 text-ink-secondary">{s.icon}<span className="text-[10.5px] font-semibold uppercase tracking-wide">{s.label}</span></div>
                <p className="mt-1 font-heading text-2xl font-extrabold text-ink">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Search bar */}
        <div className="border-t border-card-border/60 bg-page/50 px-8 py-4">
          <form method="GET" action="/spaces" className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-secondary/50" strokeWidth={2} />
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Search pages across all spaces…"
                className="w-full rounded-xl border border-card-border bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-ink outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <button className="rounded-xl bg-accent px-4 py-2 text-sm font-extrabold text-white">Search</button>
            {searchQuery && <Link href="/spaces" className="flex items-center rounded-xl border border-card-border px-3 py-2 text-sm font-semibold text-ink-secondary hover:bg-page">Clear</Link>}
          </form>

          {/* Search results */}
          {searchQuery && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
              </p>
              {searchResults.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((p) => (
                    <Link key={p.id} href={`/s/${p.space.key}/pages/${p.id}`} className="flex items-start gap-2.5 rounded-xl border border-card-border bg-white p-3 transition hover:border-accent/40 hover:bg-card">
                      <span className="mt-0.5 text-base leading-none">{p.emoji ?? "📄"}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-ink">{p.title}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-ink-secondary">{p.space.iconEmoji} {p.space.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-card-border bg-white p-4 text-sm text-ink-secondary">No pages found for &ldquo;{searchQuery}&rdquo;.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Main grid ── */}
      <div className="grid gap-7 lg:grid-cols-[1fr_360px]">

        {/* ── Left: Spaces + Recent Pages ── */}
        <div className="space-y-7">

          {/* Spaces grid */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-[17px] font-extrabold text-ink">Spaces</h2>
              <a href="#new-space" className="flex items-center gap-1.5 rounded-xl border border-card-border bg-card px-3 py-1.5 text-[12px] font-bold text-ink-secondary hover:border-accent/40 hover:text-accent">
                <Plus size={12} strokeWidth={2.5} /> New Space
              </a>
            </div>

            {spaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-card-border bg-card/50 py-16 text-center">
                <span className="text-4xl">📂</span>
                <p className="mt-3 font-heading text-[15px] font-bold text-ink-secondary">No spaces yet</p>
                <p className="mt-1 text-[12.5px] text-ink-secondary/60">Create your first space to start writing docs</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {spaces.map((space) => (
                  <Link
                    key={space.id}
                    href={`/s/${space.key}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md"
                  >
                    {/* Card header */}
                    <div className="flex items-center gap-3 border-b border-card-border/50 bg-page/50 px-4 py-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/8 text-xl">
                        {space.iconEmoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-[14px] font-extrabold text-ink group-hover:text-accent">{space.name}</p>
                        <p className="text-[11px] font-bold text-ink-secondary/60">{space.key} · {space._count.pages} pages</p>
                      </div>
                      <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-ink-secondary/30 transition-transform group-hover:translate-x-0.5 group-hover:text-accent/60" />
                    </div>

                    {/* Description + recent pages */}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      {space.description ? (
                        <p className="line-clamp-2 text-[12px] leading-5 text-ink-secondary">{space.description}</p>
                      ) : (
                        <p className="text-[12px] italic text-ink-secondary/40">No description</p>
                      )}
                      {space.pages.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {space.pages.slice(0, 3).map((p) => (
                            <li key={p.id} className="flex items-center gap-1.5 text-[11.5px] text-ink-secondary/70">
                              <span className="text-[11px]">{p.emoji ?? "📄"}</span>
                              <span className="truncate">{p.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recently updated pages */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Clock size={14} strokeWidth={2} className="text-ink-secondary" />
              <h2 className="font-heading text-[17px] font-extrabold text-ink">Recently Updated</h2>
            </div>
            {recentPages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-card-border p-8 text-center text-[13px] text-ink-secondary/60">
                No pages yet — open a space and create one.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
                {recentPages.map((page, i) => (
                  <Link
                    key={page.id}
                    href={`/s/${page.space.key}/pages/${page.id}`}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-page ${i !== 0 ? "border-t border-card-border/50" : ""}`}
                  >
                    {/* Space badge */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/8 text-[14px]">
                      {page.space.iconEmoji}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px]">{page.emoji ?? "📄"}</span>
                        <p className="truncate text-[13px] font-semibold text-ink">{page.title}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-secondary/60">
                        {page.space.name}
                        {page._count.comments > 0 && <> · {page._count.comments} comment{page._count.comments !== 1 ? "s" : ""}</>}
                      </p>
                    </div>

                    <span className="shrink-0 text-[11px] tabular-nums text-ink-secondary/50">{timeAgo(page.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right: Create Space form ── */}
        <aside id="new-space" className="h-fit">
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-card-border/60 bg-page/50 px-5 py-4">
              <Plus size={14} strokeWidth={2.5} className="text-accent" />
              <h2 className="font-heading text-[15px] font-extrabold text-ink">New Space</h2>
            </div>

            <form action={createSpaceAction} className="space-y-4 p-5">
              {/* Emoji picker */}
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_PRESETS.map((emoji, i) => (
                    <label
                      key={emoji}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-transparent bg-page text-lg transition-all hover:border-accent/40 hover:bg-accent/5 has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                    >
                      <input type="radio" name="iconEmoji" value={emoji} defaultChecked={i === 0} className="sr-only" />
                      {emoji}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                  Space key <span className="normal-case font-normal text-ink-secondary/60">(letters &amp; numbers only)</span>
                </label>
                <input
                  name="key"
                  required
                  placeholder="e.g. TEAM"
                  maxLength={12}
                  pattern="[A-Za-z0-9]+"
                  title="Letters and numbers only, no spaces or special characters"
                  className="w-full rounded-xl border border-card-border bg-page px-3 py-2.5 font-mono text-sm font-bold uppercase tracking-wide text-ink outline-none placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-secondary/50 focus:border-accent/60"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Name</label>
                <input
                  name="name"
                  required
                  placeholder="Team Handbook"
                  className="w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-secondary/50 focus:border-accent/60"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-secondary">Description <span className="normal-case font-normal text-ink-secondary/40">(optional)</span></label>
                <textarea
                  name="description"
                  placeholder="What is this space for?"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-secondary/50 focus:border-accent/60"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-accent py-2.5 font-heading text-[13.5px] font-extrabold text-white transition-all hover:opacity-90 active:scale-[.98]"
              >
                Create Space
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
