import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RichTextRenderer } from "@/components/RichTextRenderer";
import { CodexPageTreeDnd } from "@/components/CodexPageTreeDnd";
import * as codex from "@/modules/codex/service";
import { addAttachmentAction, addPageCommentAction, deletePageAction, lockPageAction, restoreVersionAction, unlockPageAction, updatePageAction, createPageAction, renamePageByFormAction } from "../../actions";

const EMOJI_PRESETS = ["📄","📝","📚","📖","🗒","🗂","📋","🔖","💡","🚀","⚙️","🎯","🏗","🔧","📊","📈","🗺","🧩","🌐","💬","🔐","📌","✅","🎨","🧪","📦","🛠","👥","🌟","💎","🏠","🔑"];

type RichNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: RichNode[] };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function textContent(nodes: RichNode[] = []): string {
  return nodes.map((node) => node.text ?? textContent(node.content)).join("");
}

function extractHeadings(doc: unknown) {
  if (!doc || typeof doc !== "object") return [] as Array<{ text: string; level: number }>;
  const root = doc as RichNode;
  return (root.content ?? [])
    .filter((node) => node.type === "heading")
    .map((node) => ({ text: textContent(node.content).trim(), level: Number(node.attrs?.level ?? 2) }))
    .filter((h) => h.text)
    .slice(0, 10);
}

type SpacePage = { id: string; title: string; emoji: string | null; parentId: string | null; rank: string };

function buildAncestors(pages: SpacePage[], pageId: string): SpacePage[] {
  const map = new Map(pages.map((p) => [p.id, p]));
  const chain: SpacePage[] = [];
  let cur = map.get(pageId);
  while (cur?.parentId) {
    cur = map.get(cur.parentId);
    if (cur) chain.unshift(cur);
  }
  return chain;
}

export default async function PageDetail({ params }: { params: Promise<{ spaceKey: string; pageId: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { spaceKey, pageId } = await params;
  if (!active) return <p>No active workspace</p>;

  const page = await codex.getPage(user.id, active.id, pageId);

  const [linkedIssues, editorUser, spacePages] = await Promise.all([
    prisma.issuePageLink.findMany({
      where: { pageId: page.id, page: { workspaceId: active.id }, issue: { workspaceId: active.id, deletedAt: null } },
      include: { issue: { include: { project: true, status: true } } },
      orderBy: { id: "asc" },
      take: 8,
    }),
    prisma.user.findUnique({ where: { id: page.updatedBy }, select: { name: true, email: true } }).catch(() => null),
    prisma.page.findMany({
      where: { workspaceId: active.id, spaceId: page.spaceId, deletedAt: null },
      orderBy: { rank: "asc" },
      select: { id: true, title: true, emoji: true, parentId: true, rank: true },
    }),
  ]);

  const lockedByOther = page.lockedBy && page.lockedBy !== user.id && page.lockedAt && Date.now() - page.lockedAt.getTime() < 5 * 60 * 1000;
  const headings = extractHeadings(page.content);
  const ancestors = buildAncestors(spacePages, page.id);
  const currentPage = spacePages.find((p) => p.id === page.id);
  const latestVersion = page.versions[0]?.version ?? 1;

  const update = updatePageAction.bind(null, spaceKey, page.id);
  const addComment = addPageCommentAction.bind(null, spaceKey, page.id);
  const addAttachment = addAttachmentAction.bind(null, spaceKey, page.id);
  const createPage = createPageAction.bind(null, spaceKey, page.spaceId);
  const renamePage = renamePageByFormAction.bind(null, spaceKey);
  const deletePage = deletePageAction.bind(null, spaceKey, page.id);
  const deletePageFromTree = deletePageAction.bind(null, spaceKey);

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb ── */}
      <nav className="flex flex-wrap items-center gap-1 text-[12.5px] font-semibold text-ink-secondary">
        <Link href="/spaces" className="flex items-center gap-1 hover:text-accent">
          <span>📚</span> Uinfo Codex
        </Link>
        <ChevronRight size={12} strokeWidth={2} className="text-ink-secondary/40" />
        <Link href={`/s/${spaceKey}`} className="flex items-center gap-1 hover:text-accent">
          <span>{page.space.iconEmoji}</span>
          {page.space.name}
        </Link>
        {ancestors.map((ancestor) => (
          <>
            <ChevronRight key={`sep-${ancestor.id}`} size={12} strokeWidth={2} className="text-ink-secondary/40" />
            <Link key={ancestor.id} href={`/s/${spaceKey}/pages/${ancestor.id}`} className="flex items-center gap-1 hover:text-accent">
              <span>{ancestor.emoji ?? "📄"}</span>
              <span className="max-w-[160px] truncate">{ancestor.title}</span>
            </Link>
          </>
        ))}
        <ChevronRight size={12} strokeWidth={2} className="text-ink-secondary/40" />
        <span className="flex items-center gap-1 text-ink">
          <span>{currentPage?.emoji ?? "📄"}</span>
          <span className="max-w-[200px] truncate font-bold">{page.title}</span>
        </span>
      </nav>

      {/* ── Page title hero ── */}
      <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_58%,#f7faf7)] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/8 text-4xl">
              {currentPage?.emoji ?? "📄"}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-[30px] font-extrabold tracking-tight text-ink leading-tight">{page.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">v{latestVersion}</span>
                <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                  Updated {formatDate(page.updatedAt)}
                </span>
                <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                  By {editorUser?.name ?? editorUser?.email ?? "Unknown"}
                </span>
                {lockedByOther && (
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
                    🔒 Locked
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main layout ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">

        {/* ── Left: content + edit + comments ── */}
        <main className="space-y-5">
          {/* Page content */}
          <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
            {lockedByOther && (
              <div className="flex items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-5 py-3 text-[13px] font-semibold text-yellow-800">
                🔒 Read-only — page is locked by another user.
              </div>
            )}
            <div className="px-6 py-5">
              <RichTextRenderer doc={page.content} empty="This page has no content yet. Click Edit below to add some." />
            </div>
          </section>

          {/* Edit form */}
          <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border/60 bg-page/50 px-5 py-3">
              <div>
                <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-accent">Editor</p>
                <h2 className="font-heading text-[15px] font-extrabold text-ink">Edit page</h2>
              </div>
              <div className="flex gap-2">
                <form action={lockPageAction.bind(null, spaceKey, page.id)}>
                  <button className="rounded-xl border border-card-border px-3 py-1.5 text-[12px] font-bold text-ink-secondary hover:bg-page hover:text-ink">
                    🔒 Lock
                  </button>
                </form>
                <form action={unlockPageAction.bind(null, spaceKey, page.id)}>
                  <button className="rounded-xl border border-card-border px-3 py-1.5 text-[12px] font-bold text-ink-secondary hover:bg-page hover:text-ink">
                    🔓 Unlock
                  </button>
                </form>
                <form action={deletePage} onSubmit={(e) => { if (!confirm(`Delete "${page.title}" and all its children? This cannot be undone.`)) e.preventDefault(); }}>
                  <button className="rounded-xl border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 hover:bg-red-50">
                    🗑 Delete page
                  </button>
                </form>
              </div>
            </div>
            <form action={update} className="space-y-4 p-5">
              <input
                name="title"
                defaultValue={page.title}
                disabled={Boolean(lockedByOther)}
                placeholder="Page title"
                className="w-full rounded-xl border border-card-border bg-page px-3 py-2.5 font-heading text-[15px] font-bold text-ink outline-none placeholder:text-ink-secondary/50 focus:border-accent/60 disabled:opacity-50"
              />
              {/* Page emoji picker */}
              <div>
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Page icon</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_PRESETS.map((emoji) => (
                    <label key={emoji} className="cursor-pointer rounded-lg border border-card-border p-1.5 text-base leading-none transition has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                      <input type="radio" name="emoji" value={emoji} defaultChecked={emoji === (currentPage?.emoji ?? "📄")} className="sr-only" />
                      {emoji}
                    </label>
                  ))}
                </div>
              </div>
              <RichTextEditor
                name="contentText"
                defaultValue={codex.textFromDoc(page.content)}
                disabled={Boolean(lockedByOther)}
                minHeightClassName="min-h-[320px]"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-ink-secondary">
                  <input type="checkbox" name="publish" defaultChecked className="accent-[var(--wh-accent)]" />
                  Save as new version
                </label>
                <button
                  disabled={Boolean(lockedByOther)}
                  className="rounded-xl bg-accent px-5 py-2 font-heading text-[13px] font-extrabold text-white transition-all hover:opacity-90 active:scale-[.98] disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </form>
          </section>

          {/* Comments */}
          <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-card-border/60 bg-page/50 px-5 py-3">
              <div>
                <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-accent">Discussion</p>
                <h2 className="font-heading text-[15px] font-extrabold text-ink">Comments</h2>
              </div>
              <span className="rounded-full bg-page px-2.5 py-1 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                {page.comments.length}
              </span>
            </div>
            <div className="divide-y divide-card-border/50 px-5">
              {page.comments.map((comment) => (
                <div key={comment.id} className="py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/80 text-[10px] font-bold text-white">
                      {comment.author.name?.[0] ?? comment.author.email?.[0] ?? "?"}
                    </span>
                    <span className="text-[12.5px] font-bold text-ink">{comment.author.name ?? comment.author.email}</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-ink-secondary">{codex.textFromDoc(comment.body)}</p>
                </div>
              ))}
              {page.comments.length === 0 && (
                <p className="py-6 text-center text-[13px] italic text-ink-secondary/50">No comments yet.</p>
              )}
            </div>
            <div className="border-t border-card-border/60 p-5">
              <form action={addComment} className="space-y-3">
                <RichTextEditor name="bodyText" placeholder="Add a comment…" minHeightClassName="min-h-[100px]" />
                <button className="rounded-xl border border-card-border px-4 py-2 text-[12.5px] font-bold text-ink hover:bg-page">
                  Post comment
                </button>
              </form>
            </div>
          </section>
        </main>

        {/* ── Right sidebar ── */}
        <aside className="space-y-4">

          {/* Page tree */}
          <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-card-border/60 bg-page/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px]">{page.space.iconEmoji}</span>
                <h2 className="font-heading text-[13px] font-extrabold text-ink">{page.space.name}</h2>
              </div>
              <Link href={`/s/${spaceKey}`} className="text-[11px] font-bold text-ink-secondary/60 hover:text-accent">
                All pages
              </Link>
            </div>
            <div className="p-3">
              <CodexPageTreeDnd
                pages={spacePages}
                spaceKey={spaceKey}
                createPageAction={createPage}
                renamePageAction={renamePage}
                deletePageAction={deletePageFromTree}
                activePageId={page.id}
              />
            </div>
          </section>

          {/* Table of contents */}
          {headings.length > 0 && (
            <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-heading text-[13px] font-extrabold text-ink">On this page</h2>
              <nav className="space-y-1">
                {headings.map((h, i) => (
                  <p
                    key={`${h.text}-${i}`}
                    className="truncate text-[12px] font-medium text-ink-secondary hover:text-accent"
                    style={{ paddingLeft: Math.max(0, h.level - 1) * 10 }}
                  >
                    {h.text}
                  </p>
                ))}
              </nav>
            </section>
          )}

          {/* Linked Nexus issues */}
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-heading text-[13px] font-extrabold text-ink">
              Linked Nexus issues
              {linkedIssues.length > 0 && (
                <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                  {linkedIssues.length}
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {linkedIssues.map((link) => {
                const key = `${link.issue.project.key}-${link.issue.number}`;
                return (
                  <Link
                    key={link.id}
                    href={`/p/${link.issue.project.key}/issues/${key}`}
                    className="block rounded-xl border border-card-border bg-page p-3 text-[12px] hover:border-accent/40 transition-colors"
                  >
                    <span className="font-extrabold text-accent">{key}</span>
                    <p className="mt-0.5 font-semibold text-ink truncate">{link.issue.title}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-ink-secondary">{link.issue.status.name}</p>
                  </Link>
                );
              })}
              {linkedIssues.length === 0 && (
                <p className="rounded-xl border border-dashed border-card-border p-3 text-[12px] text-ink-secondary">
                  No linked Nexus issues yet.
                </p>
              )}
            </div>
          </section>

          {/* Versions */}
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-heading text-[13px] font-extrabold text-ink">
              Versions
              <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                {page.versions.length}
              </span>
            </h2>
            <ul className="space-y-1.5">
              {page.versions.slice(0, 8).map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-xl border border-card-border bg-page px-3 py-2">
                  <div>
                    <span className="text-[12px] font-bold text-ink">v{v.version}</span>
                    <span className="ml-2 text-[11px] text-ink-secondary/60">
                      {new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <form action={restoreVersionAction.bind(null, spaceKey, page.id, v.version)}>
                    <button className="text-[11px] font-bold text-accent hover:underline">Restore</button>
                  </form>
                </li>
              ))}
              {page.versions.length === 0 && (
                <li className="rounded-xl border border-dashed border-card-border p-3 text-[12px] text-ink-secondary">
                  No saved versions yet — check "Save as new version" when editing.
                </li>
              )}
            </ul>
          </section>

          {/* Attachments */}
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-heading text-[13px] font-extrabold text-ink">
              Attachments
              {page.attachments.length > 0 && (
                <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[11px] font-bold text-ink-secondary ring-1 ring-card-border">
                  {page.attachments.length}
                </span>
              )}
            </h2>
            <ul className="space-y-1.5">
              {page.attachments.map((a) => (
                <li key={a.id} className="rounded-xl border border-card-border bg-page p-3">
                  <a href={`/api/attachments/${a.id}`} className="text-[12px] font-semibold text-accent hover:underline">
                    📎 {a.filename}
                  </a>
                  <p className="mt-0.5 text-[11px] text-ink-secondary">{a.mimeType} · {Math.ceil(a.size / 1024)} KB</p>
                </li>
              ))}
              {page.attachments.length === 0 && (
                <li className="rounded-xl border border-dashed border-card-border p-3 text-[12px] text-ink-secondary">
                  No files uploaded yet.
                </li>
              )}
            </ul>
            <form action={addAttachment} encType="multipart/form-data" className="mt-3 space-y-2">
              <input name="file" type="file" required className="w-full rounded-xl border border-card-border bg-page px-3 py-2 text-[12px] file:mr-2 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-1 file:text-[11px] file:font-bold file:text-accent" />
              <button className="w-full rounded-xl border border-card-border px-3 py-2 text-[12px] font-bold text-ink-secondary hover:bg-page">
                Upload file
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
