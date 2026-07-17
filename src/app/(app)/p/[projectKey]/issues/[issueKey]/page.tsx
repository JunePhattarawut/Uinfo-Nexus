import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { RichTextRenderer } from "@/components/RichTextRenderer";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CommentForm } from "@/components/CommentForm";
import { DescriptionSection } from "@/components/DescriptionSection";
import { IssueDirtySaveGuard } from "@/components/IssueDirtySaveGuard";
import { prisma } from "@/lib/db";
import * as issueService from "@/modules/issue/service";
import { addCommentAction, addReferenceAction, updateIssueAction, uploadIssueAttachmentAction } from "../actions";

const TYPES = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"];
const PRIORITIES = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

function statusClass(category: string) {
  if (category === "DONE") return "bg-lime-200 text-lime-900";
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
}

function custom(issue: { customFields: unknown }, key: string) {
  const fields = issue.customFields as Record<string, unknown> | null;
  const value = fields?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 py-2 sm:grid-cols-[150px_1fr] sm:items-center">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}


function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function activityField(action: string, payload: unknown) {
  const data = payloadRecord(payload);
  const changes = Array.isArray(data.changes) ? data.changes : [];
  const first = changes[0];
  if (first && typeof first === "object" && "field" in first) return String((first as Record<string, unknown>).field);
  if (action === "status_changed") return "Status";
  if (action === "reference_added") return "Reference";
  if (action === "page_reference_added") return "RemoteIssueLink";
  if (action === "commented") return "Comment";
  if (action === "created") return "Issue";
  return "Issue details";
}

function activityTitle(action: string, actorName: string, payload: unknown) {
  if (action === "created") return <><b>{actorName}</b> created this issue</>;
  if (action === "commented") return <><b>{actorName}</b> added a comment</>;
  return <><b>{actorName}</b> updated the <b>{activityField(action, payload)}</b></>;
}

function changeRows(payload: unknown, statusMap: Map<string, string>) {
  const data = payloadRecord(payload);
  const changes = Array.isArray(data.changes) ? data.changes : [];
  if (changes.length > 0) {
    return changes.map((item, index) => {
      const row = payloadRecord(item);
      return (
        <div key={`${String(row.field ?? "field")}-${index}`} className="mt-2">
          <span className="font-semibold text-gray-700">{String(row.field ?? "Field")}: </span>
          <span className="text-gray-500">{String(row.from ?? "None")}</span>
          <span className="px-2 text-gray-500">→</span>
          <span>{String(row.to ?? "Updated")}</span>
        </div>
      );
    });
  }
  if (typeof data.beforeStatusId === "string" || typeof data.afterStatusId === "string") {
    const before = statusMap.get(String(data.beforeStatusId)) ?? "None";
    const after = statusMap.get(String(data.afterStatusId)) ?? "Updated";
    if (before === after) return [];
    return [
      <div key="status" className="mt-2">
        <span className="font-semibold text-gray-700">Status: </span>
        <span className="text-gray-500">{before}</span>
        <span className="px-2 text-gray-500">→</span>
        <span>{after}</span>
      </div>,
    ];
  }
  return [];
}

function activityChangeText(action: string, payload: unknown, statusMap: Map<string, string>) {
  const data = payloadRecord(payload);
  const rows = changeRows(payload, statusMap);
  if (rows.length > 0) return rows;
  if (action === "created") return <span>{typeof data.title === "string" ? data.title : "Issue created"}</span>;
  if (action === "reference_added") return <span><span className="text-gray-500">None</span><span className="px-2 text-gray-500">→</span>{String(data.title ?? data.url ?? "External reference")}</span>;
  if (action === "page_reference_added") return <span><span className="text-gray-500">None</span><span className="px-2 text-gray-500">→</span>This issue links to “{String(data.title ?? "Page (Confluence)")}”</span>;
  if (action === "commented") return <span>{typeof data.bodyText === "string" ? data.bodyText : "Comment added"}</span>;
  return <span>Issue fields were saved</span>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function ReadonlyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-2 sm:grid-cols-[150px_1fr] sm:items-center">
      <span className="text-sm font-semibold text-ink-secondary">{label}</span>
      <div className="min-h-10 rounded-lg bg-page px-3 py-2 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const high = priority === "HIGHEST" || priority === "HIGH";
  const low = priority === "LOW" || priority === "LOWEST";
  const className = high ? "bg-priority-high text-priority-high-text" : low ? "bg-page text-ink-secondary" : "bg-priority-med text-priority-med-text";
  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${className}`}>{priority}</span>;
}

function statusHeroClass(category: string) {
  if (category === "DONE") return "bg-lime-100 text-lime-900 ring-lime-200";
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800 ring-blue-200";
  return "bg-page text-ink-secondary ring-card-border";
}

export default async function IssueDetailPage({ params }: { params: Promise<{ projectKey: string; issueKey: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const { projectKey, issueKey } = await params;
  if (!active) return <p>No active workspace</p>;

  const [{ issue, activity }, { projects, members }, referencePages] = await Promise.all([
    issueService.getIssueByKey(user.id, active.id, issueKey),
    issueService.getIssueContext(user.id, active.id),
    prisma.page.findMany({
      where: { workspaceId: active.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { space: { select: { key: true, name: true } } },
    }),
  ]);

  const project = projects.find((p) => p.id === issue.projectId)!;
  const update = updateIssueAction.bind(null, projectKey, issue.id, issueKey);
  const addComment = addCommentAction.bind(null, projectKey, issue.id, issueKey);
  const addReference = addReferenceAction.bind(null, projectKey, issue.id, issueKey);
  const uploadAttachment = uploadIssueAttachmentAction.bind(null, projectKey, issue.id, issueKey);
  const externalReferences = issueService.issueExternalReferences(issue);
  const actorIds = [...new Set(activity.map((item) => item.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const statusMap = new Map(project.statuses.map((status) => [status.id, status.name]));
  const labels = issue.labels.map((x) => x.label.name).join(", ");
  const displayKey = issueService.issueDisplayKey(issue);
  const jiraUrl = custom(issue, "originalJiraUrl");
  const jiraIssueType = custom(issue, "jiraIssueType");
  const originalJiraKey = custom(issue, "originalJiraKey");
  const originalJiraId = custom(issue, "originalJiraId");
  const jiraStatusName = custom(issue, "jiraStatusName");
  const descriptionText = issueService.issueDescriptionText(issue);

  return (
    <div className="-m-6 min-h-screen bg-page">
      <form id="issue-update-form" action={update} className="hidden" />
        <section className="border-b border-card-border bg-card px-8 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-secondary">
                <Link href={`/p/${projectKey}/issues`} className="hover:text-accent">{project.name}</Link>
                <span>/</span>
                <span>{displayKey}</span>
                <span className={`rounded-full px-2.5 py-1 ring-1 ${statusHeroClass(issue.status.category)}`}>{issue.status.name}</span>
                <PriorityBadge priority={issue.priority} />
                {jiraUrl && <a href={jiraUrl} className="text-accent hover:underline" target="_blank">Open in Jira ↗</a>}
              </div>
              <input
                form="issue-update-form"
                name="title"
                defaultValue={issue.title}
                required
                className="mt-3 w-full rounded-xl border border-transparent bg-transparent px-2 py-2 font-heading text-3xl font-extrabold tracking-tight text-ink outline-none hover:border-card-border hover:bg-page focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/10"
              />
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-secondary">
                <span className="rounded-full bg-accent-soft px-3 py-1.5 text-accent-soft-text">Overview</span>
                <a href="#comments" className="rounded-full px-3 py-1.5 hover:bg-page hover:text-ink">Comments</a>
                <a href="#activity" className="rounded-full px-3 py-1.5 hover:bg-page hover:text-ink">Activity / History</a>
                <a href="#references" className="rounded-full px-3 py-1.5 hover:bg-page hover:text-ink">References</a>
              </div>
            </div>
            <div className="flex gap-2 text-ink-secondary">
              <button type="button" className="rounded-xl border border-card-border bg-page px-3 py-2 hover:bg-card" title="Watch">👁</button>
              <button type="button" className="rounded-xl border border-card-border bg-page px-3 py-2 hover:bg-card" title="Share">↗</button>
              <button type="button" className="rounded-xl border border-card-border bg-page px-3 py-2 hover:bg-card" title="More">•••</button>
            </div>
          </div>
        </section>

        <div className="grid gap-8 px-8 py-6 xl:grid-cols-[minmax(0,1fr)_430px]">
          <main className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-card-border bg-card p-4 text-sm text-ink-secondary shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-extrabold text-ink">Attachments</h2>
                  <p className="mt-1 text-sm text-ink-secondary">Files upload to S3-compatible MinIO and metadata stays scoped to this issue.</p>
                </div>
                <form action={uploadAttachment} className="flex flex-wrap items-center gap-2">
                  <input name="file" type="file" required className="max-w-64 rounded-xl border border-card-border bg-page px-3 py-2 text-sm font-semibold text-ink" />
                  <button className="rounded-xl bg-accent px-4 py-2 font-heading text-sm font-extrabold text-white hover:opacity-90">Upload</button>
                </form>
              </div>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {issue.attachments.map((attachment) => (
                  <li key={attachment.id} className="rounded-xl border border-card-border bg-page p-3">
                    <a href={`/api/attachments/${attachment.id}`} className="font-semibold text-accent hover:underline">📎 {attachment.filename}</a>
                    <p className="mt-1 text-xs font-semibold text-ink-secondary">{attachment.mimeType} · {Math.ceil(attachment.size / 1024)} KB</p>
                  </li>
                ))}
                {issue.attachments.length === 0 && <li className="rounded-xl border border-dashed border-card-border bg-page p-3 text-sm text-ink-secondary">No attachments uploaded yet.</li>}
              </ul>
            </section>

            <DescriptionSection
              form="issue-update-form"
              name="descriptionText"
              defaultValue={descriptionText}
              placeholder="Add a description, context, findings, acceptance criteria…"
            />

            <section id="references" className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-xl font-extrabold text-ink">References</h2>
                <span className="text-xs text-ink-secondary">Source links and Uinfo Codex pages</span>
              </div>
              <div className="space-y-3">
                {externalReferences.map((ref) => (
                  <a key={ref.id} href={ref.url} target="_blank" className="block rounded-lg border bg-gray-50 p-3 hover:border-blue-300 hover:bg-blue-50">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-xl">🔗</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-blue-700 underline">{ref.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{ref.source}{ref.note ? ` · ${ref.note}` : ""}</p>
                        <p className="mt-1 truncate text-xs text-gray-400">{ref.url}</p>
                      </div>
                    </div>
                  </a>
                ))}
                {issue.pageLinks.map((link) => (
                  <Link key={link.id} href={`/s/${link.page.space.key}/pages/${link.page.id}`} className="block rounded-lg border bg-blue-50 p-3 hover:border-blue-300">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-xl">📘</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-blue-700 underline">{link.page.title}</p>
                        <p className="mt-1 text-xs text-gray-500">Codex / {link.page.space.name}</p>
                      </div>
                    </div>
                  </Link>
                ))}
                {externalReferences.length === 0 && issue.pageLinks.length === 0 && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No references yet. Add a source link or connect a Codex page.</p>}
              </div>
            </section>

            <details className="-mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-bold text-blue-700">+ Add reference</summary>
              <form action={addReference} className="mt-3 grid gap-2 md:grid-cols-2">
                <input name="title" placeholder="Reference title" required className="rounded border border-blue-100 bg-white px-3 py-2 text-sm" />
                <input name="url" type="url" placeholder="https://example.com/article" required className="rounded border border-blue-100 bg-white px-3 py-2 text-sm" />
                <input name="source" placeholder="Source e.g. NCSA Webboard" className="rounded border border-blue-100 bg-white px-3 py-2 text-sm" />
                <input name="note" placeholder="Short note" className="rounded border border-blue-100 bg-white px-3 py-2 text-sm" />
                <button className="rounded bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 md:col-span-2">Add external link</button>
              </form>
              {referencePages.length > 0 && (
                <form action={addReference} className="mt-3 flex gap-2 border-t border-blue-100 pt-3">
                  <select name="pageId" className="min-w-0 flex-1 rounded border border-blue-100 bg-white px-3 py-2 text-sm" defaultValue="">
                    <option value="" disabled>Link Uinfo Codex page</option>
                    {referencePages.map((page) => <option key={page.id} value={page.id}>{page.space.key} · {page.title}</option>)}
                  </select>
                  <button className="rounded border border-blue-100 bg-white px-3 py-2 text-sm font-bold hover:bg-blue-50">Link page</button>
                </form>
              )}
            </details>

            <section id="activity" className="-mt-3 rounded-2xl border border-card-border bg-card p-5 shadow-sm activity-tabs">
              <style>{`
                .activity-tabs .activity-panel { display: none; }
                .activity-tabs #activity-tab-comments:checked ~ .activity-panels .comments-panel { display: block; }
                .activity-tabs #activity-tab-history:checked ~ .activity-panels .history-panel { display: block; }
                .activity-tabs #activity-tab-all:checked ~ .activity-panels .all-panel { display: block; }
                .activity-tabs .tab-label { border-left: 1px solid rgb(209 213 219); cursor: pointer; padding: 0.5rem 1rem; }
                .activity-tabs .tab-label:first-of-type { border-left: 0; }
                .activity-tabs #activity-tab-all:checked ~ .activity-tab-list label[for="activity-tab-all"],
                .activity-tabs #activity-tab-comments:checked ~ .activity-tab-list label[for="activity-tab-comments"],
                .activity-tabs #activity-tab-history:checked ~ .activity-tab-list label[for="activity-tab-history"] {
                  background: rgb(239 246 255);
                  color: rgb(29 78 216);
                  box-shadow: inset 0 0 0 1px rgb(37 99 235);
                }
              `}</style>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Activity</h2>
                <button type="button" className="text-lg text-gray-500 hover:text-gray-900" title="Sort activity">☷↧</button>
              </div>

              <input id="activity-tab-all" name="activity-tab" type="radio" className="sr-only" />
              <input id="activity-tab-comments" name="activity-tab" type="radio" className="sr-only" defaultChecked />
              <input id="activity-tab-history" name="activity-tab" type="radio" className="sr-only" />
              <div className="activity-tab-list mb-5 inline-flex overflow-hidden rounded-md border bg-white text-sm font-semibold text-gray-600">
                <label htmlFor="activity-tab-all" className="tab-label">All</label>
                <label htmlFor="activity-tab-comments" className="tab-label">Comments</label>
                <label htmlFor="activity-tab-history" className="tab-label">History</label>
                <span className="border-l px-4 py-2 text-gray-400">Work log</span>
              </div>

              <div className="activity-panels">
                <div className="activity-panel comments-panel">
                  <CommentForm action={addComment} authorInitial={user.name?.[0] ?? "U"} />
                  <div className="mt-5 space-y-3">
                    {issue.comments.map((c) => (
                      <div key={c.id} className="rounded-lg border p-3">
                        <p className="text-xs text-gray-500">{c.author.name} · {new Date(c.createdAt).toLocaleString()}</p>
                        <RichTextRenderer doc={c.body} empty="" />
                      </div>
                    ))}
                    {issue.comments.length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
                  </div>
                </div>

                <div className="activity-panel history-panel">
                  <div id="activity-feed" className="space-y-7">
                    {activity.map((a) => {
                      const actor = actorMap.get(a.actorId);
                      const actorName = actor?.name ?? "UIN CMP";
                      return (
                        <div key={a.id} className="flex gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-400 text-sm font-bold text-gray-900">{initials(actorName)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base text-gray-900">{activityTitle(a.action, actorName, a.payload)}</p>
                            <p className="mt-1 text-sm text-gray-500">{new Date(a.createdAt).toLocaleString()}</p>
                            <p className="mt-3 break-words text-base text-gray-800">{activityChangeText(a.action, a.payload, statusMap)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {activity.length === 0 && <p className="text-sm text-gray-500">No activity yet.</p>}
                  </div>
                </div>

                <div className="activity-panel all-panel space-y-6">
                  <div className="space-y-3">
                    {issue.comments.map((c) => (
                      <div key={c.id} className="rounded-lg border p-3">
                        <p className="text-xs text-gray-500">{c.author.name} · {new Date(c.createdAt).toLocaleString()}</p>
                        <RichTextRenderer doc={c.body} empty="" />
                      </div>
                    ))}
                    {issue.comments.length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
                  </div>
                  <div className="space-y-4">
                    {activity.map((a) => {
                      const actor = actorMap.get(a.actorId);
                      const actorName = actor?.name ?? "UIN CMP";
                      return (
                        <div key={a.id} className="flex gap-4 rounded-lg bg-gray-50 p-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-400 text-xs font-bold text-gray-900">{initials(actorName)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">{activityTitle(a.action, actorName, a.payload)}</p>
                            <p className="mt-1 text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</p>
                            <p className="mt-2 break-words text-sm text-gray-700">{activityChangeText(a.action, a.payload, statusMap)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </main>
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-lg font-extrabold text-ink">Details</h2>
                <span className="rounded-full bg-page px-2 py-1 text-xs font-bold text-ink-secondary">Pinned fields</span>
              </div>

              <div className="space-y-1">
                <FieldRow label="Status">
                  <select form="issue-update-form" name="statusId" defaultValue={issue.statusId} className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold ${statusClass(issue.status.category)}`}>
                    {project.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Assignee">
                  <select form="issue-update-form" name="assigneeId" defaultValue={issue.assigneeId ?? ""} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                  </select>
                </FieldRow>
                <ReadonlyRow label="Reporter">{issue.reporter.name}</ReadonlyRow>
                <FieldRow label="Issue type">
                  <select form="issue-update-form" name="type" defaultValue={issue.type} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </FieldRow>
                {jiraIssueType && <ReadonlyRow label="Jira type">{jiraIssueType}</ReadonlyRow>}
                {originalJiraKey && <ReadonlyRow label="Original key">{originalJiraKey}</ReadonlyRow>}
                {originalJiraId && <ReadonlyRow label="Original ID">{originalJiraId}</ReadonlyRow>}
                {jiraStatusName && <ReadonlyRow label="Jira status">{jiraStatusName}</ReadonlyRow>}
                <FieldRow label="Priority">
                  <select form="issue-update-form" name="priority" defaultValue={issue.priority} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Labels">
                  <input form="issue-update-form" name="labels" defaultValue={labels} placeholder="None" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </FieldRow>
                <FieldRow label="Due date">
                  <input form="issue-update-form" name="dueDate" type="date" defaultValue={dateInputValue(issue.dueDate)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </FieldRow>
                <FieldRow label="Story points">
                  <input form="issue-update-form" name="storyPoints" type="number" min="0" defaultValue={issue.storyPoints ?? ""} placeholder="None" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </FieldRow>
                <ReadonlyRow label="Complied">{issue.status.category === "DONE" ? "☑ Yes" : "☐ No"}</ReadonlyRow>
                <ReadonlyRow label="Not Complied">{issue.status.category !== "DONE" ? "☑ Yes" : "☐ No"}</ReadonlyRow>
                <ReadonlyRow label="Key Point">{labels || "None"}</ReadonlyRow>
              </div>

              <div className="mt-5 border-t pt-4">
                <button id="issue-save-button" form="issue-update-form" className="w-full rounded-xl bg-[var(--wh-accent)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90">Save changes</button>
              </div>
            </section>
          </aside>
        </div>
      <IssueDirtySaveGuard formId="issue-update-form" buttonId="issue-save-button" />
    </div>
  );
}
