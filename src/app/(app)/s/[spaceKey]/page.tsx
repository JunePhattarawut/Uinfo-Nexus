import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CodexPageTreeDnd } from "@/components/CodexPageTreeDnd";
import * as codex from "@/modules/codex/service";
import { createPageAction, renamePageByFormAction } from "./actions";

function countChildren(pages: Array<{ parentId: string | null }>, pageId: string) {
  return pages.filter((page) => page.parentId === pageId).length;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function SpacePage({ params }: { params: Promise<{ spaceKey: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { spaceKey } = await params;
  if (!active) return <p>No active workspace</p>;
  const space = await codex.getSpace(user.id, active.id, spaceKey);
  const createPage = createPageAction.bind(null, space.key, space.id);
  const renamePage = renamePageByFormAction.bind(null, space.key);
  const [recentPages, attachmentCount, linkedIssueCount, commentCount] = await Promise.all([
    prisma.page.findMany({
      where: { workspaceId: active.id, spaceId: space.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { comments: true, attachments: true, issueLinks: true } } },
    }),
    prisma.attachment.count({ where: { workspaceId: active.id, page: { spaceId: space.id, deletedAt: null } } }),
    prisma.issuePageLink.count({ where: { page: { workspaceId: active.id, spaceId: space.id, deletedAt: null }, issue: { workspaceId: active.id, deletedAt: null } } }),
    prisma.comment.count({ where: { page: { workspaceId: active.id, spaceId: space.id, deletedAt: null } } }),
  ]);
  const rootPages = space.pages.filter((page) => !page.parentId).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="grid gap-5 bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f7faf7)] p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-accent">Uinfo Codex · Space overview</p>
            <h1 className="mt-2 flex items-center gap-3 font-heading text-[34px] font-extrabold tracking-tight text-ink">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/8 text-3xl">{space.iconEmoji}</span>
              {space.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{space.description || "Confluence-like knowledge space for team pages, linked Nexus work, files, comments, and versioned documentation."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/search?q=${encodeURIComponent(space.key)}&type=page`} className="rounded-xl bg-accent px-4 py-2 text-sm font-extrabold text-white">Search this space</Link>
              <a href="#create-page" className="rounded-xl border border-card-border bg-card px-4 py-2 text-sm font-extrabold text-ink hover:bg-page">Create page</a>
            </div>
          </div>
          <div className="rounded-2xl border border-card-border bg-card/90 p-4 shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Space key</p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-ink">{space.key}</p>
            <p className="mt-2 text-sm text-ink-secondary">{space.pages.length} pages · {rootPages} root pages</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm"><p className="text-[11px] font-extrabold uppercase text-ink-secondary">Pages</p><p className="mt-2 font-heading text-2xl font-extrabold text-ink">{space.pages.length}</p><p className="text-sm text-ink-secondary">versioned docs</p></div>
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm"><p className="text-[11px] font-extrabold uppercase text-ink-secondary">Nexus links</p><p className="mt-2 font-heading text-2xl font-extrabold text-ink">{linkedIssueCount}</p><p className="text-sm text-ink-secondary">issue references</p></div>
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm"><p className="text-[11px] font-extrabold uppercase text-ink-secondary">Attachments</p><p className="mt-2 font-heading text-2xl font-extrabold text-ink">{attachmentCount}</p><p className="text-sm text-ink-secondary">stored files</p></div>
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm"><p className="text-[11px] font-extrabold uppercase text-ink-secondary">Comments</p><p className="mt-2 font-heading text-2xl font-extrabold text-ink">{commentCount}</p><p className="text-sm text-ink-secondary">page discussions</p></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-extrabold text-ink">Page tree</h2>
                <p className="text-xs font-semibold text-ink-secondary">Drag/drop, nested, ordered docs</p>
              </div>
              <span className="rounded-full bg-page px-2.5 py-1 text-xs font-bold text-ink-secondary ring-1 ring-card-border">{space.pages.length}</span>
            </div>
            <div className="mt-4"><CodexPageTreeDnd pages={space.pages} spaceKey={space.key} createPageAction={createPage} renamePageAction={renamePage} /></div>
          </section>
        </aside>

        <main className="space-y-6">
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-extrabold text-ink">Recently updated</h2>
                <p className="mt-1 text-sm text-ink-secondary">Latest pages with comments, files, and Nexus links.</p>
              </div>
              <Link href="/spaces" className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold text-ink hover:bg-page">All spaces</Link>
            </div>
            <div className="mt-4 grid gap-3">
              {recentPages.map((page) => (
                <Link key={page.id} href={`/s/${space.key}/pages/${page.id}`} className="rounded-xl border border-card-border bg-page p-4 transition hover:border-accent/40 hover:bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-base font-extrabold text-ink">{page.title}</h3>
                    <span className="text-xs font-bold text-ink-secondary">{formatDate(page.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-ink-secondary">
                    <span>{countChildren(space.pages, page.id)} children</span><span>·</span><span>{page._count.comments} comments</span><span>·</span><span>{page._count.attachments} files</span><span>·</span><span>{page._count.issueLinks} Nexus links</span>
                  </div>
                </Link>
              ))}
              {recentPages.length === 0 && <p className="rounded-xl border border-dashed border-card-border p-5 text-sm text-ink-secondary">No pages yet. Create the first page below.</p>}
            </div>
          </section>

          <section id="create-page" className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Confluence-style authoring</p>
              <h2 className="font-heading text-xl font-extrabold text-ink">Create page</h2>
              <p className="mt-1 text-sm text-ink-secondary">Use headings, tables, code blocks, links, and task-style content with the Workhub rich JSON renderer.</p>
            </div>
            <form action={createPage} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <input name="title" required placeholder="Page title" className="w-full rounded-xl border border-card-border bg-page px-3 py-2 text-sm font-semibold" />
                <select name="parentId" className="w-full rounded-xl border border-card-border bg-page px-3 py-2 text-sm font-semibold" defaultValue="">
                  <option value="">Root page</option>
                  {space.pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <RichTextEditor name="contentText" placeholder="Start with /style markdown: # Heading, - list, | table |, ``` code" minHeightClassName="min-h-48" />
              <button className="rounded-xl bg-accent px-4 py-2 font-heading text-sm font-extrabold text-white">Create page</button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
