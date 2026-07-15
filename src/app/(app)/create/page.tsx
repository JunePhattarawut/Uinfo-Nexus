import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as issueService from "@/modules/issue/service";
import { createWorkItemAction } from "./actions";

const TYPES = ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] as const;
const PRIORITIES = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

export default async function CreatePage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  if (!active) return <p>No active workspace</p>;

  const { projects, members } = await issueService.getIssueContext(user.id, active.id);
  const inputClass = "w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent-soft";

  if (!projects.length) {
    return (
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6">
          <p className="text-[12.5px] font-extrabold uppercase tracking-wide text-accent">Create</p>
          <h1 className="mt-1 font-heading text-[32px] font-extrabold text-ink">Create work item</h1>
          <p className="mt-2 text-sm text-ink-secondary">Create a project first, then add work items.</p>
          <Link href="/projects/new" className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 font-heading text-sm font-bold text-white">Create project</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12.5px] font-extrabold uppercase tracking-wide text-accent">Create</p>
              <h1 className="mt-1 font-heading text-[34px] font-extrabold text-ink">Create work item</h1>
              <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
                Global create keeps project selection explicit and uses the same dense Jira/Nexus field language as project forms.
              </p>
            </div>
            <div className="rounded-2xl border border-card-border bg-card/90 p-3 text-sm shadow-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Available projects</p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-ink">{projects.length}</p>
            </div>
          </div>
        </div>
      </section>

      <form action={createWorkItemAction} className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="border-b border-card-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-extrabold text-ink">Work item details</h2>
              <p className="mt-1 text-sm text-ink-secondary">Choose the target project first — Workhub will not silently default to any project.</p>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-soft-text">schema-safe create</span>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <FieldLabel label="Project">
              <select name="projectId" defaultValue="" required className={inputClass}>
                <option value="" disabled>Select target project…</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name} · {project.key}</option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="Title">
              <input name="title" placeholder="What needs to be done?" required className={inputClass} />
            </FieldLabel>
            <FieldLabel label="Description / acceptance criteria">
              <textarea name="descriptionText" placeholder="Add details, context, acceptance criteria…" className={`${inputClass} min-h-44 resize-y`} />
            </FieldLabel>
          </div>

          <div className="rounded-2xl border border-card-border bg-page p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-sm font-extrabold text-ink">Nexus fields</h3>
              <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-ink-secondary">metadata</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <FieldLabel label="Type">
                <select name="type" defaultValue="TASK" className={inputClass}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
              </FieldLabel>
              <FieldLabel label="Priority">
                <select name="priority" defaultValue="MEDIUM" className={inputClass}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
              </FieldLabel>
              <FieldLabel label="Assignee">
                <select name="assigneeId" defaultValue="" className={inputClass}><option value="">Unassigned</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name ?? "Unnamed user"}</option>)}</select>
              </FieldLabel>
              <FieldLabel label="Due date">
                <input name="dueDate" type="date" className={inputClass} />
              </FieldLabel>
              <FieldLabel label="Labels">
                <input name="labels" placeholder="labels, comma-separated" className={inputClass} />
              </FieldLabel>
              <FieldLabel label="Story points">
                <input name="storyPoints" type="number" min="0" placeholder="Optional" className={inputClass} />
              </FieldLabel>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border bg-page px-5 py-4">
          <p className="text-xs font-semibold text-ink-secondary">Create behavior unchanged: redirects to the new issue detail after submit.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects" className="rounded-xl border border-card-border bg-card px-4 py-2.5 text-sm font-bold text-ink hover:border-accent hover:text-accent">Cancel</Link>
            <button className="rounded-xl bg-accent px-5 py-2.5 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Create work item</button>
          </div>
        </div>
      </form>
    </div>
  );
}
