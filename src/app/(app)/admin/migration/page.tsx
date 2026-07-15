import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import * as migration from "@/modules/migration/jira";
import { createJiraDryRunAction } from "./actions";

function renderJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function formatDate(value: Date | string | null | undefined, empty = "Not finished") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "COMPLETED" ? "bg-[#E3FCEF] text-[#006644]" : status === "FAILED" ? "bg-[#FFECEB] text-[#AE2A19]" : status === "DRY_RUN" ? "bg-[#E9F2FF] text-[#0C66E4]" : "bg-page text-ink-secondary";
  return <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}>{status}</span>;
}

function WizardStep({ number, title, description, active = false }: { number: number; title: string; description: string; active?: boolean }) {
  return (
    <li className={`rounded-2xl border p-4 ${active ? "border-accent bg-accent-soft text-accent-soft-text" : "border-card-border bg-card text-ink"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-extrabold ${active ? "bg-accent text-white" : "bg-page text-ink-secondary"}`}>{number}</span>
        <div>
          <h3 className="font-heading text-sm font-extrabold">{title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{description}</p>
        </div>
      </div>
    </li>
  );
}

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

export default async function JiraMigrationPage() {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const jobs = active ? await migration.listImportJobs(user.id, active.id).catch(() => []) : [];
  const latestJob = jobs[0];
  const dryRuns = jobs.filter((job) => job.dryRun).length;
  const completed = jobs.filter((job) => job.status === "COMPLETED").length;
  const failed = jobs.filter((job) => job.status === "FAILED" || job.errors.length > 0).length;
  const inputClass = "w-full rounded-xl border border-card-border bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-secondary/70 focus:border-accent focus:ring-2 focus:ring-accent-soft";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[12.5px] font-extrabold uppercase tracking-wide text-accent">Admin / Migration</p>
              <h1 className="mt-2 font-heading text-[34px] font-extrabold tracking-tight text-ink">Jira setup & import wizard</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                Guided Jira migration wrapper for Workhub/Nexus. This page keeps dry-run first, surfaces review evidence, and does not trigger real import writes silently.
              </p>
            </div>
            <div className="rounded-2xl border border-card-border bg-card/90 p-4 text-sm shadow-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Current gate</p>
              <p className="mt-1 font-heading text-lg font-extrabold text-ink">Dry-run review</p>
              <p className="text-xs font-semibold text-ink-secondary">Import action stays gated by existing backend flow.</p>
            </div>
          </div>
        </div>
      </section>

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <WizardStep number={1} title="Source" description="Confirm Jira site and credential readiness." active />
        <WizardStep number={2} title="Project keys" description="Scope CTI, RA, UCR, or all projects." active />
        <WizardStep number={3} title="Dry run" description="Create review-only ImportJob evidence." active />
        <WizardStep number={4} title="Review" description="Check mappings, warnings, errors, and counts." active={Boolean(latestJob)} />
        <WizardStep number={5} title="Import gate" description="No write import from this UI without explicit owner review." />
        <WizardStep number={6} title="Verify" description="Open imported project links and compare counts." />
      </ol>

      <div className="grid gap-4 md:grid-cols-4">
        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Jobs</p>
          <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{jobs.length}</p>
          <p className="mt-1 text-sm font-semibold text-ink-secondary">Migration audit records</p>
        </section>
        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Dry-runs</p>
          <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{dryRuns}</p>
          <p className="mt-1 text-sm font-semibold text-ink-secondary">Review-only jobs</p>
        </section>
        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Completed</p>
          <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{completed}</p>
          <p className="mt-1 text-sm font-semibold text-ink-secondary">Imported fixture/jobs</p>
        </section>
        <section className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Needs review</p>
          <p className="mt-2 font-heading text-3xl font-extrabold text-ink">{failed}</p>
          <p className="mt-1 text-sm font-semibold text-ink-secondary">Failed or error-bearing jobs</p>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
          <div className="border-b border-card-border bg-[linear-gradient(135deg,#ffffff,#f6f7fa)] px-5 py-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Step 1–3</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Create dry-run plan</h2>
            <p className="mt-1 text-sm text-ink-secondary">This stores a reviewable migration job only. It does not import Jira issue records.</p>
          </div>
          <form action={createJiraDryRunAction} className="grid gap-4 p-5 md:grid-cols-2">
            <FieldLabel label="Jira site URL" className="md:col-span-2">
              <input name="sourceUrl" defaultValue="https://uin-gc.atlassian.net" className={inputClass} />
            </FieldLabel>
            <FieldLabel label="Project keys">
              <input name="projectKeys" placeholder="CTI, RA, UCR" className={inputClass} />
            </FieldLabel>
            <FieldLabel label="Issue limit">
              <input name="issueLimit" type="number" min="1" max="1000" defaultValue="100" className={inputClass} />
            </FieldLabel>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-card-border pt-4">
              <p className="text-xs font-semibold text-ink-secondary">Dry-run first guardrail: review mappings and errors before any import write path.</p>
              <button className="rounded-xl bg-accent px-5 py-2.5 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Create dry-run</button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Step 4</p>
              <h2 className="font-heading text-xl font-extrabold text-ink">Latest review packet</h2>
            </div>
            {latestJob ? <StatusBadge status={latestJob.status} /> : <StatusBadge status="DRAFT" />}
          </div>
          {latestJob ? (() => {
            const summary = asRecord(latestJob.summary);
            const config = asRecord(latestJob.config);
            const projectKeys = asStringArray(summary.projectKeys ?? config.projectKeys);
            const checks = asStringArray(summary.checks);
            return (
              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-xl border border-card-border bg-page p-4">
                  <p className="font-heading text-lg font-extrabold text-ink">{latestJob.name}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-secondary">{latestJob.sourceUrl} · created {formatDate(latestJob.createdAt)} · finished {formatDate(latestJob.finishedAt)}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Project keys</p><p className="mt-1 font-heading text-xl font-extrabold text-ink">{projectKeys.length || "All"}</p></div>
                  <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Issue limit</p><p className="mt-1 font-heading text-xl font-extrabold text-ink">{String(summary.issueLimit ?? config.issueLimit ?? "—")}</p></div>
                  <div className="rounded-xl bg-page p-3"><p className="text-[11px] font-bold uppercase text-ink-secondary">Errors</p><p className="mt-1 font-heading text-xl font-extrabold text-ink">{latestJob.errors.length}</p></div>
                </div>
                {projectKeys.length > 0 && <p className="rounded-xl bg-page p-3 text-xs font-bold text-ink-secondary">Projects: {projectKeys.join(", ")}</p>}
                <ul className="space-y-2">
                  {checks.map((check) => <li key={check} className="rounded-xl border border-card-border bg-page p-3 font-semibold text-ink-secondary">✓ {check}</li>)}
                  {!checks.length && <li className="rounded-xl border border-dashed border-card-border bg-page p-3 text-ink-secondary">No checks stored in this job summary.</li>}
                </ul>
              </div>
            );
          })() : (
            <p className="mt-4 rounded-xl border border-dashed border-card-border bg-page p-4 text-sm text-ink-secondary">No migration jobs yet. Create a dry-run to populate the review packet.</p>
          )}
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <h3 className="font-heading font-extrabold text-ink">Schema ready</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-ink-secondary">
            <li>✓ ImportJob / ImportError audit trail</li>
            <li>✓ ExternalMapping for Jira IDs and keys</li>
            <li>✓ Existing issue/page/comment/attachment metadata tables</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <h3 className="font-heading font-extrabold text-ink">Mapping ready</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-ink-secondary">
            <li>✓ ADF description/comment to Tiptap JSON</li>
            <li>✓ Issue type / priority normalization</li>
            <li>✓ Unmapped user/status warnings</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
          <h3 className="font-heading font-extrabold text-ink">Import guardrail</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-ink-secondary">
            <li>• Add JIRA_EMAIL and JIRA_API_TOKEN for live API reads</li>
            <li>• Run one-project fixture/import first</li>
            <li>• Verify counts before full migration</li>
          </ul>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Step 4–6</p>
            <h2 className="font-heading text-xl font-extrabold text-ink">Recent migration jobs</h2>
          </div>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary">{jobs.length} jobs</span>
        </div>
        {jobs.length === 0 ? (
          <p className="p-5 text-sm text-ink-secondary">No migration jobs yet.</p>
        ) : (
          <div className="divide-y divide-card-border">
            {jobs.map((job) => {
              const summary = asRecord(job.summary);
              const config = asRecord(job.config);
              const projectKeys = asStringArray(summary.projectKeys ?? config.projectKeys);
              return (
                <article key={job.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-extrabold text-ink">{job.name}</h3>
                      <p className="mt-1 text-xs font-semibold text-ink-secondary">{job.sourceUrl} · created {formatDate(job.createdAt)} · {job.dryRun ? "dry run" : "import"}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-ink-secondary">
                    <span className="rounded-full bg-page px-3 py-1">Source {job.source}</span>
                    <span className="rounded-full bg-page px-3 py-1">Projects {projectKeys.length ? projectKeys.join(", ") : "all"}</span>
                    <span className="rounded-full bg-page px-3 py-1">Errors {job.errors.length}</span>
                  </div>
                  <details className="mt-3 rounded-xl border border-card-border bg-page">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink">Review JSON summary</summary>
                    <pre className="max-h-64 overflow-auto border-t border-card-border bg-gray-950 p-3 text-xs text-gray-100">{renderJson(job.summary)}</pre>
                  </details>
                  {job.errors.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm font-semibold text-red-700">
                      {job.errors.map((error) => <li key={error.id}>{error.entity} {error.sourceKey ? `(${error.sourceKey})` : ""}: {error.message}</li>)}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
