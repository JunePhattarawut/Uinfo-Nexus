import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { prisma } from "@/lib/db";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RichTextRenderer } from "@/components/RichTextRenderer";
import * as codex from "@/modules/codex/service";
import { addAttachmentAction, addPageCommentAction, lockPageAction, restoreVersionAction, unlockPageAction, updatePageAction } from "../../actions";

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
    .filter((heading) => heading.text)
    .slice(0, 8);
}

export default async function PageDetail({ params }: { params: Promise<{ spaceKey: string; pageId: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { spaceKey, pageId } = await params;
  if (!active) return <p>No active workspace</p>;
  const page = await codex.getPage(user.id, active.id, pageId);
  const [linkedIssues, editorUser] = await Promise.all([
    prisma.issuePageLink.findMany({
      where: { pageId: page.id, page: { workspaceId: active.id }, issue: { workspaceId: active.id, deletedAt: null } },
      include: { issue: { include: { project: true, status: true } } },
      orderBy: { id: "asc" },
      take: 8,
    }),
    prisma.user.findUnique({ where: { id: page.updatedBy }, select: { name: true, email: true } }).catch(() => null),
  ]);
  const lockedByOther = page.lockedBy && page.lockedBy !== user.id && page.lockedAt && Date.now() - page.lockedAt.getTime() < 5 * 60 * 1000;
  const headings = extractHeadings(page.content);
  const update = updatePageAction.bind(null, spaceKey, page.id);
  const addComment = addPageCommentAction.bind(null, spaceKey, page.id);
  const addAttachment = addAttachmentAction.bind(null, spaceKey, page.id);
  const latestVersion = page.versions[0]?.version ?? 1;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_58%,#f7faf7)] p-6">
          <Link href={`/s/${spaceKey}`} className="text-sm font-bold text-accent hover:underline">← {page.space.name}</Link>
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="text-[12px] font-extrabold uppercase tracking-wide text-accent">Uinfo Codex · Page</p>
              <h1 className="mt-2 font-heading text-[36px] font-extrabold tracking-tight text-ink">{page.title}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-ink-secondary">
                <span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-card-border">v{latestVersion}</span>
                <span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-card-border">Updated {formatDate(page.updatedAt)}</span>
                <span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-card-border">By {editorUser?.name ?? editorUser?.email ?? "Unknown"}</span>
                <span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-card-border">{linkedIssues.length} Nexus links</span>
              </div>
            </div>
            <div className="rounded-2xl border border-card-border bg-card/90 p-4 text-sm shadow-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Page health</p>
              <p className="mt-1 font-heading text-lg font-extrabold text-ink">{lockedByOther ? "Locked by another user" : page.lockedBy === user.id ? "Locked for editing" : "Ready to edit"}</p>
              <p className="mt-1 text-ink-secondary">{page.comments.length} comments · {page.attachments.length} files · {page.versions.length} versions</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
            {lockedByOther && <p className="mb-4 rounded-xl bg-yellow-50 p-3 text-sm font-semibold text-yellow-800">Read-only: page locked by another user.</p>}
            <RichTextRenderer doc={page.content} empty="Empty page" />
          </section>

          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Editor</p>
                <h2 className="font-heading text-xl font-extrabold text-ink">Edit / publish</h2>
              </div>
              <div className="flex gap-2">
                <form action={lockPageAction.bind(null, spaceKey, page.id)}><button className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold hover:bg-page">Lock/edit</button></form>
                <form action={unlockPageAction.bind(null, spaceKey, page.id)}><button className="rounded-xl border border-card-border px-3 py-2 text-xs font-bold hover:bg-page">Unlock</button></form>
              </div>
            </div>
            <form action={update} className="space-y-3">
              <input name="title" defaultValue={page.title} disabled={Boolean(lockedByOther)} className="w-full rounded-xl border border-card-border bg-page px-3 py-2 text-sm font-semibold" />
              <RichTextEditor name="contentText" defaultValue={codex.textFromDoc(page.content)} disabled={Boolean(lockedByOther)} minHeightClassName="min-h-[320px]" />
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-secondary"><input type="checkbox" name="publish" defaultChecked /> Save PageVersion</label>
              <button disabled={Boolean(lockedByOther)} className="rounded-xl bg-accent px-4 py-2 font-heading text-sm font-extrabold text-white disabled:opacity-50">Save / publish</button>
            </form>
          </section>

          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Discussion</p>
                <h2 className="font-heading text-xl font-extrabold text-ink">Comments</h2>
              </div>
              <span className="rounded-full bg-page px-2.5 py-1 text-xs font-bold text-ink-secondary ring-1 ring-card-border">{page.comments.length}</span>
            </div>
            <div className="space-y-2">
              {page.comments.map((comment) => <div key={comment.id} className="rounded-xl border border-card-border bg-page p-3 text-sm"><b>{comment.author.name ?? comment.author.email}</b><p className="mt-1 text-ink-secondary">{codex.textFromDoc(comment.body)}</p></div>)}
              {page.comments.length === 0 && <p className="rounded-xl border border-dashed border-card-border p-4 text-sm text-ink-secondary">No comments yet.</p>}
            </div>
            <form action={addComment} className="mt-3 space-y-2">
              <RichTextEditor name="bodyText" placeholder="Add comment" minHeightClassName="min-h-28" />
              <button className="rounded-xl border border-card-border px-3 py-2 text-sm font-bold hover:bg-page">Comment</button>
            </form>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="font-heading text-lg font-extrabold text-ink">Table of contents</h2>
            <div className="mt-3 space-y-2 text-sm">
              {headings.map((heading, index) => <p key={`${heading.text}-${index}`} className="truncate font-semibold text-ink-secondary" style={{ paddingLeft: Math.max(0, heading.level - 1) * 10 }}>{heading.text}</p>)}
              {headings.length === 0 && <p className="text-sm text-ink-secondary">No headings yet. Add # headings in the editor.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="font-heading text-lg font-extrabold text-ink">Linked Nexus work</h2>
            <div className="mt-3 space-y-2">
              {linkedIssues.map((link) => {
                const key = `${link.issue.project.key}-${link.issue.number}`;
                return <Link key={link.id} href={`/p/${link.issue.project.key}/issues/${key}`} className="block rounded-xl border border-card-border bg-page p-3 text-sm hover:border-accent/40"><span className="font-extrabold text-accent">{key}</span><p className="mt-1 font-semibold text-ink">{link.issue.title}</p><p className="mt-1 text-xs font-bold text-ink-secondary">{link.issue.status.name}</p></Link>;
              })}
              {linkedIssues.length === 0 && <p className="rounded-xl border border-dashed border-card-border p-3 text-sm text-ink-secondary">No linked Nexus issues yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="font-heading text-lg font-extrabold text-ink">Versions</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {page.versions.map((version) => <li key={version.id} className="flex items-center justify-between rounded-xl border border-card-border bg-page p-2"><span className="font-bold">v{version.version}</span><form action={restoreVersionAction.bind(null, spaceKey, page.id, version.version)}><button className="text-xs font-bold text-accent hover:underline">Restore</button></form></li>)}
            </ul>
          </section>

          <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <h2 className="font-heading text-lg font-extrabold text-ink">Attachments</h2>
            <p className="mt-1 text-xs text-ink-secondary">Files upload to S3-compatible MinIO; metadata stays linked to this page.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {page.attachments.map((attachment) => <li key={attachment.id} className="rounded-xl border border-card-border bg-page p-3"><a href={`/api/attachments/${attachment.id}`} className="font-semibold text-accent hover:underline">📎 {attachment.filename}</a><p className="text-xs text-ink-secondary">{attachment.mimeType} · {Math.ceil(attachment.size / 1024)} KB</p></li>)}
              {page.attachments.length === 0 && <li className="rounded-xl border border-dashed border-card-border p-3 text-sm text-ink-secondary">No attachments uploaded yet.</li>}
            </ul>
            <form action={addAttachment} className="mt-3 space-y-2" encType="multipart/form-data">
              <input name="file" type="file" required className="w-full rounded-xl border border-card-border bg-page px-3 py-2 text-sm" />
              <button className="rounded-xl border border-card-border px-3 py-2 text-sm font-bold hover:bg-page">Upload file</button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
