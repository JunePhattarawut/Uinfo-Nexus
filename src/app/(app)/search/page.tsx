import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/active-workspace";
import { searchProvider, type SearchType } from "@/modules/search/service";

const SEARCH_TYPES: Array<{ key: SearchType; label: string; hint: string }> = [
  { key: "all", label: "All", hint: "Projects, work items, docs, comments, files" },
  { key: "project", label: "Projects", hint: "Keys, names, workflows, visual metadata" },
  { key: "issue", label: "Issues", hint: "Keys, titles, descriptions, fields" },
  { key: "page", label: "Pages", hint: "Codex titles and rich content" },
  { key: "comment", label: "Comments", hint: "Issue and page discussion" },
  { key: "attachment", label: "Attachments", hint: "File names and metadata" },
];

function parseSearchType(value: string | undefined): SearchType {
  return SEARCH_TYPES.some((item) => item.key === value) ? (value as SearchType) : "all";
}

function typeClass(type: Exclude<SearchType, "all">) {
  return {
    project: "bg-violet-50 text-violet-700",
    issue: "bg-blue-50 text-blue-700",
    page: "bg-emerald-50 text-emerald-700",
    comment: "bg-amber-50 text-amber-700",
    attachment: "bg-slate-100 text-slate-700",
  }[type];
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const user = await requireUser();
  const { active } = await getActiveWorkspace(user.id);
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const type = parseSearchType(params.type);
  const results = active && q ? await searchProvider.search(user.id, active.id, q, type) : [];
  const activeType = SEARCH_TYPES.find((item) => item.key === type) ?? SEARCH_TYPES[0];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm">
        <div className="grid gap-5 bg-[linear-gradient(135deg,#eef1fc,#ffffff_55%,#f6f7fa)] p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-accent">Uinfo Nexus · Global search</p>
            <h1 className="mt-2 font-heading text-[32px] font-extrabold tracking-tight text-ink">Search workspace data</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
              Searches workspace data through the configured provider. Local installs use bounded Postgres search by default; production can switch to Elasticsearch/OpenSearch with WORKHUB_SEARCH_BACKEND and WORKHUB_SEARCH_URL.
            </p>
          </div>
          <div className="rounded-2xl border border-card-border bg-card/90 p-4 text-sm shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Current source</p>
            <p className="mt-1 font-heading text-lg font-extrabold text-ink">{activeType.label}</p>
            <p className="mt-1 text-ink-secondary">{activeType.hint}</p>
          </div>
        </div>
      </section>

      <form className="rounded-2xl border border-card-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Query</span>
            <input name="q" defaultValue={q} placeholder="Search CTI, Jira key, page term, filename…" className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-secondary">Source</span>
            <select name="type" defaultValue={type} className="w-full rounded-xl border border-card-border bg-page px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft">
              {SEARCH_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-xl bg-accent px-5 py-3 font-heading text-sm font-extrabold text-white shadow-sm hover:opacity-90">Search</button>
          </div>
        </div>
      </form>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-card-border bg-card p-2 shadow-sm" aria-label="Search source filters">
        {SEARCH_TYPES.map((item) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          params.set("type", item.key);
          const activeTab = item.key === type;
          return (
            <Link key={item.key} href={`/search?${params.toString()}`} className={`min-w-fit rounded-xl px-3 py-2 text-sm font-bold transition ${activeTab ? "bg-accent text-white" : "text-ink-secondary hover:bg-page hover:text-ink"}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-extrabold text-ink">{q ? `${results.length} results for “${q}”` : "Enter a search term"}</h2>
          <span className="rounded-full bg-page px-3 py-1 text-xs font-bold text-ink-secondary ring-1 ring-card-border">bounded to 50 rendered results</span>
        </div>
        <div className="space-y-2">
          {results.map((result) => (
            <Link key={`${result.type}-${result.id}`} href={result.href} className="block rounded-2xl border border-card-border bg-card p-4 shadow-sm transition hover:border-accent/40 hover:bg-page">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${typeClass(result.type)}`}>{result.type}</span>
                {result.meta ? <span className="text-xs font-bold text-ink-secondary">{result.meta}</span> : null}
              </div>
              <h3 className="mt-2 font-heading text-base font-extrabold text-ink">{result.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-secondary">{result.excerpt || "Matched record metadata"}</p>
            </Link>
          ))}
          {q && results.length === 0 && <p className="rounded-2xl border border-dashed border-card-border bg-card p-6 text-sm text-ink-secondary">No results. Try All sources or a broader Jira/Codex term.</p>}
          {!q && <p className="rounded-2xl border border-dashed border-card-border bg-card p-6 text-sm text-ink-secondary">Search is scoped to the active workspace and preserves permissions through membership checks.</p>}
        </div>
      </section>
    </div>
  );
}
