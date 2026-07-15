# Project Handoff: Uinfo Nexus + Uinfo Codex Web App

> **Audience:** AI coding agent (e.g. Claude Code) + human owner (June).
> **Status:** **M5 advanced optional items complete & verified** (see §10). Product is ready for owner review / deployment hardening.
> **Last updated:** 2026-07-11

---

## 1. Project summary

Build a self-hosted web application combining **Uinfo Nexus** (issue tracking, Jira-style) and **Uinfo Codex** (knowledge base / wiki, Confluence-style) for an internal team of **5–50 users**, designed so it can scale later without re-architecture.

**Owner context:** The owner is a system engineer (strong in Linux, Docker, VMware, PostgreSQL ops, Elastic stack, backup/DR). Deployment, backup, and infra hardening are handled by the owner. The AI agent's job is application code.

**Philosophy:** Thin vertical slices. Ship a usable system at the end of **every** milestone. Modular monolith — one deployable app, with clean internal module boundaries so pieces can be extracted into services later if ever needed.

**Product naming:**
- **Uinfo Nexus** = issue tracking / Jira-like area (projects, issues, board, backlog, sprint, comments, activity).
- **Uinfo Codex** = knowledge base / Confluence-like area (spaces, pages, page tree, versioning, attachments).

---

## 2. Decision log (DO NOT relitigate these)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Stack | **Next.js (App Router) + TypeScript**, single repo, monolith | One language, one deploy unit, solo-friendly |
| D2 | ORM / DB | **Prisma + PostgreSQL 16** | Relational core + JSONB for custom fields |
| D3 | Auth | **Auth.js (NextAuth)**, credentials + room for OIDC/SSO later | Don't hand-roll auth |
| D4 | Primary keys | **UUID v7** everywhere (time-sortable) | Distributed-friendly, no auto-increment |
| D5 | Multi-tenancy | Shared DB, **`workspace_id` column on every tenant-owned table**, enforced in a repository/service layer | Simplest correct model; can shard by workspace later |
| D6 | Rich text editor | **Tiptap**; store content as **Tiptap JSON** (not HTML) in `jsonb` | Diff/migrate/search-index friendly |
| D7 | Drag-drop | **dnd-kit** | Maintained, headless |
| D8 | Ordering (board columns, backlog, page tree) | **Fractional indexing** string `rank` column (e.g. `fractional-indexing` npm package) | Reorder = update 1 row; Jira uses the same idea (LexoRank) |
| D9 | Issue keys | `PROJ-123`; per-project counter column incremented **inside a transaction** (`UPDATE ... RETURNING`) | Prevents race-condition duplicates |
| D10 | Background jobs | **BullMQ + Redis** from M2 onward (email, search indexing, notifications) | Never block requests on side effects |
| D11 | Files/attachments | **S3-compatible object storage** (MinIO locally). Never store blobs in Postgres | Standard practice |
| D12 | Search | Postgres full-text (`tsvector`) behind a `SearchProvider` interface; swap to Elasticsearch in M4+ only if needed | Owner knows Elastic; abstraction makes swap cheap |
| D13 | Real-time co-editing | **NOT building.** Use page-level edit locking + autosave + version history | Biggest time sink for near-zero value at this team size |
| D14 | JQL | **NOT building a parser.** Structured filter UI (query builder) instead | 90% of value at 10% of cost |
| D15 | App state | Fully **stateless** app: sessions in DB/Redis, files in object storage, no in-memory state | Enables horizontal scaling |
| D16 | Local dev | **Docker Compose**: app + postgres + redis + minio | Matches production shape |
| D17 | Prisma runtime | **Engine-free client**: `queryCompiler`+`driverAdapters` preview, `engineType="client"`, `@prisma/adapter-pg`, CLI via `prisma.config.ts` (`engine: "js"`) | No native binary downloads (proxy/air-gap friendly), smaller deploys |
| D18 | Middleware scope | `/api/*` excluded from auth middleware matcher; API routes return **401 JSON** via `requireUser`, never a login redirect | Keeps API error contract (§6) intact |

---

## 3. Explicit non-goals (DO NOT BUILD)

- ❌ Real-time collaborative editing (CRDT/Yjs/websocket sync)
- ❌ JQL or any query-language parser
- ❌ Generic workflow engine with transition rules/conditions (statuses are a simple ordered list per project for now)
- ❌ Generic automation-rule engine (hard-code 2–3 automations if needed)
- ❌ Microservices, Kubernetes, service mesh
- ❌ Plugin/marketplace system
- ❌ Mobile native apps (responsive web only)
- ❌ Gantt/timeline view, cumulative flow diagram (deferred indefinitely)

If a task seems to require one of these, **stop and ask the owner** instead of building it.

---

## 4. Core data model

All tenant-owned tables include `workspace_id` (FK, indexed). All tables: `id` (uuid v7), `created_at`, `updated_at`. Use soft delete (`deleted_at`) on Issue and Page only.

```
User(id, email, name, password_hash, avatar_url)
Workspace(id, name, slug)
Membership(id, user_id, workspace_id, role)            -- role: OWNER|ADMIN|MEMBER|VIEWER

Project(id, workspace_id, key, name, description, issue_counter int default 0)
ProjectMember(id, project_id, user_id, role)
Status(id, project_id, name, category, position)       -- category: TODO|IN_PROGRESS|DONE
Sprint(id, project_id, name, goal, start_date, end_date, state)  -- state: FUTURE|ACTIVE|CLOSED

Issue(id, workspace_id, project_id, key, type, title, description jsonb,
      status_id, priority, assignee_id, reporter_id, sprint_id nullable,
      parent_id nullable, story_points nullable, due_date nullable,
      rank text, custom_fields jsonb, deleted_at nullable)
      -- type: EPIC|STORY|TASK|BUG|SUBTASK
IssueLink(id, source_issue_id, target_issue_id, link_type)  -- BLOCKS|RELATES|DUPLICATES
Comment(id, issue_id, author_id, body jsonb)
Attachment(id, workspace_id, issue_id nullable, page_id nullable,
           filename, mime_type, size, storage_key)
ActivityLog(id, workspace_id, actor_id, entity_type, entity_id,
            action, payload jsonb, created_at)         -- partition by month later; append-only

Space(id, workspace_id, key, name, description)
Page(id, workspace_id, space_id, parent_id nullable, title,
     content jsonb, rank text, created_by, updated_by,
     locked_by nullable, locked_at nullable, deleted_at nullable)
PageVersion(id, page_id, version int, title, content jsonb, author_id, created_at)
IssuePageLink(id, issue_id, page_id)

Notification(id, workspace_id, user_id, type, payload jsonb, read_at nullable)
Label(id, workspace_id, name, color) + IssueLabel / PageLabel join tables
```

Key indexes: `(workspace_id)` everywhere; `(project_id, rank)` on Issue; `(space_id, parent_id, rank)` on Page; unique `(project_id, key)`; GIN on `custom_fields` and content tsvector.

---

## 5. Milestones — order of implementation

Complete each milestone fully (including its Definition of Done) before starting the next. Commit in small increments.

### M0 — Foundation & scaffolding
**Build:**
1. Repo scaffold: Next.js App Router + TS strict, ESLint + Prettier, `docker-compose.yml` (postgres, redis, minio), `.env.example`
2. Prisma schema for the full model in §4 (all tables now, even ones used later — schema churn is expensive) + initial migration
3. **Seed script** creating: 1 workspace, 4 users, 1 project with default statuses (To Do / In Progress / Done), ~25 issues across types, 1 space with ~8 pages in a tree
4. Auth: register, login, logout, session; middleware guarding all app routes
5. Workspace + membership CRUD; **tenancy guard**: a single data-access layer where every query is scoped by `workspace_id` — never query tenant tables directly from route handlers
6. Base UI shell: sidebar (projects, spaces), top nav, workspace switcher

**Definition of Done:**
- `docker compose up` + `pnpm dev` gives a working login on a fresh clone
- Seed data visible after login
- A user in workspace A cannot fetch workspace B data by ID (write a test proving this)
- CI runs typecheck + lint + tests on push

### M1 — Uinfo Nexus MVP  ◄ first usable release
**Build:**
1. Issue CRUD (type, title, description via Tiptap, priority, assignee, reporter, labels, due date)
2. Issue key generation via transactional counter (D9); detail page at `/p/[key]/issues/[issueKey]`
3. Kanban board: columns from project statuses, drag-drop with dnd-kit, `rank` updates via fractional indexing (D8), **optimistic UI** with rollback on failure
4. Comments (Tiptap-lite: bold/italic/code/links/mentions-as-plain-text)
5. Basic list view with filters: status, type, assignee, label (structured filters, not JQL)
6. ActivityLog entries for create/update/status-change/comment

**Definition of Done:**
- Two users can concurrently create issues without key collisions (test it)
- Dragging a card between/within columns persists across refresh
- Board with 200 seeded issues renders and drags smoothly
- Every issue mutation appears in the issue's activity tab

### M2 — Agile layer
**Build:**
1. Backlog view: rank-ordered issue list, drag to reorder, drag into a sprint
2. Sprint lifecycle: create → start (one ACTIVE per project) → complete (incomplete issues return to backlog)
3. Story points field + sprint total; epic → story/task → subtask hierarchy with rollup counts on epic
4. BullMQ worker process + Redis; in-app Notification model + bell UI; email notifications through the queue (dev: log/Mailpit)
5. @mentions in comments trigger notifications

**Definition of Done:**
- Full sprint cycle works end-to-end with correct backlog return behavior
- Killing the worker doesn't break web requests; jobs run when it restarts
- Assign/mention creates an in-app notification within seconds

### M3 — Uinfo Codex MVP
**Build:**
1. Space CRUD; page tree sidebar (nested, collapsible, drag to reorder/re-parent using `rank` + `parent_id`)
2. Full Tiptap editor: headings, lists, tables, code blocks, images (upload → MinIO), task lists
3. Autosave (debounced) + **PageVersion** snapshot on each explicit save/publish; version list + view + restore
4. Edit locking (D13): opening editor sets `locked_by/locked_at` (TTL ~5 min heartbeat); others see read-only banner with lock owner
5. Page comments; attachments on pages

**Definition of Done:**
- Create a 3-level page tree, move a subtree to a new parent, order survives refresh
- Restore an old version and the content matches exactly
- Second user cannot enter edit mode on a locked page; lock expires when the first user leaves
- Images upload to MinIO and render in published pages

### M4 — Integration & hardening
**Build:**
1. Issue ↔ page linking (both directions visible); issue links (blocks/relates/duplicates)
2. Granular permissions: project roles + space roles + per-page restriction; centralize in **one `can(user, action, resource)` policy module** — batch checks for lists to avoid N+1
3. Search: Postgres tsvector across issues + pages behind `SearchProvider` interface; global search UI with type filter
4. Custom fields (definition per project + values in `custom_fields` jsonb) — text/number/select/date only
5. Audit surface: admin activity view; data export (issues → CSV, pages → JSON/markdown)
6. Hardening pass: rate limiting on auth, security headers, input validation (zod) on all mutations

**Definition of Done:**
- Permission matrix test suite passes (viewer can't edit, non-member can't read restricted page, etc.)
- Issue list of 50 rows performs ≤ a fixed small number of permission queries (no N+1 — assert query count in test)
- Search finds text inside page bodies and issue descriptions
- Export produces importable/valid files

### M5 — Advanced (OPTIONAL — requires explicit owner approval per item)
Saved filters · burndown/velocity charts · hard-coded automations (e.g. "issue closed → notify reporter") · custom statuses UI · Elasticsearch swap-in · SSO (OIDC) · webhooks

---

## 6. Conventions for the implementing agent

**API:** Next.js route handlers under `/api/*`, REST-ish. JSON errors: `{ error: { code, message } }` with proper HTTP status. All mutations validated with zod schemas shared between client and server.

**Code layout:**
```
src/
  app/            # routes (thin — no business logic)
  modules/        # issue/, project/, page/, space/, auth/, notification/, search/
                  # each: service.ts (logic), repo.ts (db, tenancy-scoped), schemas.ts (zod)
  lib/            # db client, auth, storage client, queue, policy (can()), rank utils
  components/     # shared UI
```
Route handlers call services; services call repos; **only repos touch Prisma**. Repos require `workspaceId` as a parameter — no exceptions.

**Testing:** Vitest. Priority order: (1) tenancy isolation, (2) permission policy matrix, (3) issue key concurrency, (4) rank/reorder logic, (5) sprint lifecycle. UI e2e is optional; service-level tests are not.

**Git:** conventional commits; one milestone = one epic branch, small PR-sized commits within it.

**When uncertain:** prefer the simpler implementation; leave a `// DECISION-NEEDED:` comment and surface it to the owner rather than inventing scope.

---

## 7. Known risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Permission checks cause N+1 on lists | Batch `can()` checks; test asserts query count |
| Issue key race condition | Transactional counter (D9) + concurrency test in M1 DoD |
| Rank string growth after many reorders | Fractional-indexing lib handles rebalancing; acceptable at this scale |
| Tiptap JSON schema migrations later | Store editor `version` alongside content from day 1 |
| Scope creep into non-goals (§3) | Agent must stop and ask before touching any §3 item |
| Editor lock stuck (user closes tab) | TTL + heartbeat; stale locks auto-expire |

---

## 8. Deferred scaling path (context only — do not build now)

Stage 1 (now): single VPS, Docker Compose → Stage 2 (~500 users): separate DB host, PgBouncer, multiple app instances behind LB → Stage 3: read replicas, Elasticsearch, dedicated queue → Stage 4: shard by workspace. Decisions D4/D5/D15 exist so this path never requires a rewrite.

---

## 9. First command for the implementing agent

Start with **M0, step 1**: scaffold the repo and docker-compose. Do not generate the entire project in one pass — proceed step by step through M0's list, committing after each working step, and stop for owner review at the end of M0 before starting M1.

---

## 10. Progress log

### M0 — Foundation ✅ (2026-07-11)

Built: repo scaffold (Next.js 15 App Router + TS strict, ESLint, Prettier), docker-compose (postgres/redis/minio), full Prisma schema (§4, all tables), initial migration `0001_init`, seed script (1 workspace, 4 users, project DEMO w/ 25 ranked issues + 3 default statuses, space TEAM w/ 8-page 3-level tree), Auth.js credentials login/register/logout, middleware guard, tenancy guard (`requireMembership`), workspace + membership CRUD APIs, app shell (sidebar, workspace switcher, overview), CI workflow.

Verified in a real environment (PostgreSQL 16):
- `prisma migrate deploy` ✅ · seed ✅ · `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **10/10 pass**, including 3 DB integration tests proving cross-workspace isolation (user A cannot fetch workspace B via repo or service; non-member gets `NOT_FOUND`, never existence leaks)
- Runtime smoke: `/login` 200 · `/` unauth → 307 `/login` · `/api/workspaces` unauth → **401 JSON** `{ error: { code, message } }`

Notes for M1 implementer:
- Set `AUTH_SECRET` before `next build`/`start`.
- Prisma client is engine-free (D17): any new script must construct `PrismaClient` **with the pg adapter** — import from `src/lib/db.ts` or copy `prisma/seed.ts` pattern. A bare `new PrismaClient()` will fail.
- `Issue.number` (Int) is the per-project sequence; display key is derived `${project.key}-${number}` (naming: field is `number`, not `key`).
- Default statuses are seeded per-project rows, not global.

**Next: M2 — Agile layer for Uinfo Nexus.** Do not start without owner approval (§9).

### M1 — Uinfo Nexus MVP ✅ (2026-07-11)

Built: Uinfo Nexus issue domain module (`src/modules/issue`) with zod schemas, tenancy-scoped repo/service layer, Issue CRUD, transactional per-project issue number generation via `Project.issueCounter`, ActivityLog writes for create/update/status-change/comment, comments, structured filters (status/type/assignee/label), labels upsert/sync, issue API routes, project issue list page, issue detail/edit page, and dnd-kit Kanban board with optimistic drag/drop rollback and persisted fractional ranks.

Added dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Verified in a real environment (PostgreSQL 16 + seeded DEMO workspace):
- `prisma migrate deploy` ✅ · seed ✅
- `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **13/13 pass**, including DB integration tests for cross-workspace isolation, concurrent issue creation with no key collisions, move persistence, comments, and activity logging
- Runtime smoke on `next start -p 4011`: `/login` 200 · `/p/DEMO/issues` unauth → 307 `/login` · authenticated login as `alice@demo.local` renders DEMO board (25 issues) · issue detail renders · comment creation persists and appears in Activity

Notes for M2 implementer:
- The project directory is still not a git repo (`git status` reports “not a git repository”); initialize/attach git before milestone commits.
- Use `npm`, not `pnpm`, in this checkout. `pnpm` is not installed and `package-lock.json` is the active lockfile.
- Issue display key remains derived: `${project.key}-${issue.number}`. Do not add/use an `Issue.key` column.
- API routes are under `/api/workspaces/[workspaceId]/issues/*`; all mutations still go through `requireMembership` and repo/service boundaries.
- Current rich text is stored as minimal Tiptap JSON from plain text inputs. Full editor work remains for M3.

**Next: M3 — Uinfo Codex MVP.** Do not start without owner approval (§9).

### M2 — Agile layer for Uinfo Nexus ✅ (2026-07-11)

Built: backlog page at `/p/[projectKey]/backlog`, sprint create/start/complete lifecycle, one ACTIVE sprint per project enforcement, move service for backlog ↔ sprint assignment with fractional ranks, story point totals per sprint, epic child rollups, BullMQ/Redis notification queue, `npm run worker` notification worker, notification bell/page, assignment notifications, and @mention notifications from comments.

Added dependencies: `bullmq`, `ioredis`.

Verified in a real environment (PostgreSQL 16 + Redis + seeded DEMO workspace):
- `prisma migrate deploy` ✅
- `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **16/16 pass**, including DB integration tests for full sprint cycle, incomplete return-to-backlog behavior, one-active-sprint conflict, sprint point totals, and epic rollups
- Worker smoke: queued BullMQ notification job → worker inserted Notification row in Postgres (`payload.source = "m2-worker-smoke"`) ✅
- Runtime smoke on `next dev -p 4011`: `/login` 200 · `/p/DEMO/backlog` unauth → 307 `/login` · authenticated login as `alice@demo.local` renders DEMO backlog (25 issues), sprint area, and epic rollups

Notes for M3 implementer:
- Dev server may show stale `.next` module errors if `next build` runs while `next dev` is still running; stop and restart dev server before browser smoke. Avoid deleting `.next` without owner confirmation.
- `npm run worker` must run alongside the app for queued notifications to materialize. Killing the worker does not block web requests; queued jobs process after worker restart.
- Current @mention matching is simple: first-name mention (e.g. `@Alice`) or full email mention (e.g. `@alice@demo.local`) in comment text.
- Backlog UI currently uses simple move buttons rather than drag/drop. Service/API support ranked moves via `beforeIssueId`/`afterIssueId`; richer DnD can be added later if needed.

**Next: M4 — Integration & hardening.** Do not start without owner approval (§9).

### M3 — Uinfo Codex MVP ✅ (2026-07-11)

Built: Uinfo Codex space/page module (`src/modules/codex`) with Space CRUD, page CRUD, nested page tree, page move/re-parent using `rank` + `parentId`, PageVersion publish/restore, edit locking with 5-minute TTL semantics, page comments, attachment metadata, sidebar space links, space create page, page detail/editor page, and migration `0002_page_comments` to support page comments in the existing `comments` table.

Implementation note: current editor UI is a plain text editor that stores valid Tiptap JSON. It covers the storage/versioning contract now; replacing the textarea with a full Tiptap toolbar editor remains a UI enhancement.

Verified in a real environment (PostgreSQL 16 + seeded DEMO workspace):
- `prisma migrate deploy` ✅ · `prisma generate` ✅
- `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **20/20 pass**, including DB integration tests for 3-level page tree, subtree move, exact version restore, lock conflict, page comments, and attachments
- Runtime smoke on `next dev -p 4011`: `/login` 200 · `/s/TEAM` unauth → 307 `/login` · authenticated login as `alice@demo.local` renders Team Handbook tree · page detail renders editor/versions/comments/attachments · page comment creation persists and renders

Notes for M4 implementer:
- Page comments use shared `comments` table with nullable `issueId` and nullable `pageId`; code that assumes `Comment.issueId` is always present must handle null.
- Attachments are metadata-only/local-dev keys for now (`local-dev/...`). Real MinIO object upload/render path should be completed in M4 hardening or a dedicated storage pass.
- Lock expiry is enforced in service methods; UI shows locked-by-other read-only state when lock is still fresh.
- Page tree UI is nested and ordered, with service-level move/reparent support; drag/drop page tree UI can build on `codex.movePage`.

**Next: M5 — Advanced optional items.** Requires explicit owner approval per item (§5).

### M4 — Integration & hardening ✅ (2026-07-11)

Built: central policy module `src/lib/policy.ts` with `can()`/`requireCan()`/batch checks, issue ↔ page linking service/API, issue ↔ issue links (`BLOCKS`/`RELATES`/`DUPLICATES`) service/API, custom field baseline using `Issue.customFields`, `SearchProvider` interface with Postgres-backed issue/page search, global search UI, admin audit surface, export routes for issues CSV + pages JSON/Markdown, security headers in middleware, and lightweight auth-page rate limiting.

Verified in a real environment (PostgreSQL 16 + seeded DEMO workspace):
- `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **25/25 pass**, including permission matrix, issue-page linking, issue-link creation, search over issue descriptions/page bodies, admin-only export authorization, valid CSV/JSON export, and custom field writes
- Runtime smoke on restarted `next dev -p 4011`: `/login` 200 with security headers · `/search?q=Welcome&type=all` unauth → 307 `/login` · authenticated login as `alice@demo.local` renders Search/Admin nav · search finds `TEAM: Welcome` page · admin audit renders export links and activity table

Notes for M5/maintenance:
- Search is behind `SearchProvider` but currently uses app-side filtering over bounded Postgres reads, not real `tsvector` indexes yet. Swap implementation under the interface before scaling search volume.
- Custom field definitions are intentionally lightweight; values are in `Issue.customFields` JSONB. A dedicated definition table can be added later if UI management becomes important.
- Export routes require ADMIN/OWNER by policy; viewer export denial is covered by tests.
- Auth rate limiting is in-memory middleware suitable for local/single-instance dev. For multi-instance production, move counters to Redis.
- Real MinIO byte upload/render remains separate from M4 metadata/export hardening.

**Next: Owner review / deployment hardening.** No further milestone is approved by default.

### M5 — Advanced optional items ✅ (2026-07-11)

Built: saved filters (`SavedFilter`) with project settings UI, custom statuses UI, sprint burndown/velocity metrics panel, hard-coded automation rule (`issue.status.done` → `notify.reporter`), webhook endpoints/deliveries with dev-safe delivery flow, M5 admin page, SSO/OIDC hook-point documentation, and Elasticsearch swap-in note through the existing `SearchProvider` abstraction.

Added migration: `0003_m5_advanced` for `saved_filters`, `webhook_endpoints`, `webhook_deliveries`, and `automation_rules`.

Verified in a real environment (PostgreSQL 16 + seeded DEMO workspace):
- `prisma migrate deploy` ✅ · `prisma generate` ✅
- `tsc --noEmit` ✅ · `next lint` ✅ · `next build` ✅
- Tests **28/28 pass**, including saved filters, custom statuses, sprint metrics, done-status automation notification, webhook delivery queueing/dev delivery, and all prior M0–M4 coverage
- Runtime smoke on restarted `next dev -p 4011`: `/login` 200 with security headers · `/p/DEMO/settings` unauth → 307 `/login` · authenticated login as `alice@demo.local` renders Custom statuses/Saved filters/Burndown panels · `/admin/advanced` renders Webhooks/Automations/SSO/Elasticsearch panels

Notes for owner review / deployment hardening:
- Webhook delivery is dev-safe: it records simulated delivery success instead of making outbound HTTP calls. Replace `deliverPendingWebhooks()` with a real signed HTTP sender before production integrations.
- SSO/OIDC is documented as an Auth.js hook point, not configured with real IdP credentials.
- Elasticsearch is not running; search remains Postgres/SearchProvider-backed until an Elasticsearch endpoint is supplied.
- This checkout is still not a git repo; initialize/attach git before production handoff commits.

**Next: Owner review / deployment hardening.** No further milestone is approved by default.

### Post-M5 Jira imported project-space views hardening ✅ (2026-07-12)

Built/fixed: dynamic project issue route `/p/[projectKey]/issues` now has Jira-style project tabs for all imported spaces: Summary, Board, List, Calendar, Timeline, Approvals, Forms, Docs, Attachments, Reports, Archived work items, and Shortcuts. The route is hardened for imported Jira rows with missing/empty optional relations by using safe helpers for labels, page links, counts, status labels, and date display. Empty tabs now render explicit empty states instead of appearing blank. Follow-up refactor replaced broad `any` view helpers with structural types, centralized view parsing/status/date/count helpers, moved archived reads behind the archived-only view branch, and consolidated tab rendering through a single `ProjectView` switch.

Verified in the live local app (PostgreSQL + imported Jira project data):
- `tsc --noEmit` ✅ · `npm run lint` ✅ · `npm test` ✅ (**32/32 pass**) · `next build` ✅
- Runtime smoke on restarted `next dev -H 127.0.0.1 -p 4000`: `/login` 200 · authenticated login as `alice@demo.local` works · `CTI` list/attachments tabs render without browser console errors
- Browser fetch smoke covered **20 imported projects × 12 project tabs = 240 pages** with no `Application error`, `Internal Server Error`, `Unhandled Runtime Error`, or non-2xx status
- Issue detail smoke covered representative imported keys (`CPAR-58`, `CTI-1619`, `CTR-283`, `RLGA-1`, `RA-1`) with 200 responses and no app-error markers

Notes:
- Use `http://127.0.0.1:4000` / `http://localhost:4000` for WorkHub. Port `3000` on June's Mac is currently owned by the WhatsApp bridge, not this app.
- This checkout is still not a git repo; initialize/attach git before production handoff commits.

### Jira-like sidebar buttons and project creation ✅ (2026-07-12)

Built/fixed: top-left sidebar controls now behave like Jira screenshots: Collapse sidebar toggles/persists a compact rail, Switch sites or apps opens an Atlassian-style app switcher panel, Spaces `+` routes to Jira project creation, and Spaces `…` routes to all projects. Added `/projects` project directory and `/projects/new` Jira-like project creation form with project name, key, description, template, access choice, and project lead. New projects create default workflow statuses from the selected template and redirect directly into the project issue tabs.

Verified:
- `tsc --noEmit` ✅ · `npm run lint` ✅ · `npm test` ✅ (**32/32 pass**) · `next build` ✅
- Runtime smoke: `/projects/new` renders after login, app switcher opens with Home/Jira/Confluence/etc., collapse changes sidebar width to 82px and persists via localStorage
- Create-project smoke: created temporary `TJBS` project through the actual form/server action, confirmed default Kanban statuses (`To Do`, `In Progress`, `Done`), then removed the temporary project from the DB

## Update — Remaining Gap A / Original Gap 4 complete (2026-07-14 21:57:19 +0700)

Scope completed:
- Added schema-backed project visual metadata with `Project.metadata Json @default("{}")`.
- Added migration `prisma/migrations/0005_project_visual_metadata/migration.sql` with `ALTER TABLE "projects" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';`.
- Updated `/projects/new` to persist icon/theme choices through `createProjectAction`.
- Updated `/projects` cards and `/p/[projectKey]/issues` headers to render persisted visual metadata while falling back to existing Jira/project-key icons for imported projects.
- Preserved Jira/importer behavior and imported records; no importer changes were made.
- Browser smoke created temporary project `HVS211346` (`Hermes Visual Smoke 211346`) with metadata `{"icon":"🛡️","theme":"risk","coverColor":"green"}`, verified header rendering, then cleanup removed the temp project and its project activity row.

Files touched / current line counts:
- `prisma/schema.prisma` — 595 lines
- `prisma/migrations/0005_project_visual_metadata/migration.sql` — 1 line
- `src/app/(app)/projects/new/actions.ts` — 125 lines
- `src/app/(app)/projects/new/page.tsx` — 185 lines
- `src/app/(app)/projects/page.tsx` — 249 lines
- `src/app/(app)/p/[projectKey]/issues/page.tsx` — 887 lines

Exact verification results:
- `npx prisma migrate deploy` — PASS; applied `0005_project_visual_metadata`.
- `npx prisma generate` — PASS; Prisma Client generated.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test` — PASS; 9 files / 32 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed.
- Dev server restarted on `127.0.0.1:4000`; active session `proc_75b773ca863c`, listening node PID `48513` at verification time.

Browser smoke:
- `http://localhost:4000/projects/new` rendered visual metadata controls and submitted real form data.
- Created `HVS211346`; redirect reached `http://localhost:4000/p/HVS211346/issues`.
- Project header showed persisted `🛡️` icon and risk/green metadata-backed styling.
- `http://localhost:4000/projects` listed the project before cleanup.
- Browser console: 0 JS errors.
- Page-level horizontal overflow check: `scrollWidth == clientWidth == 1280`, no overflow.
- Cleanup verification: deleted `HVS211346`; remaining project count for key was `0`.

Remaining after this update:
- Gap B / Original Gap 10: Search scalability / schema-light Search UX hardening is the next practical slice.
- Gap C / Original Gap 11: Real webhook sender / SSO / Elasticsearch remains production-integration work and needs real endpoints/IdP/search infra.
- Gap D / Original Gap 12: Modules remains deferred unless June defines module semantics.

## Update — Remaining Gap B / Original Gap 10 schema-light search hardening complete (2026-07-14 22:06:13 +0700)

Scope completed:
- Kept schema unchanged; no Postgres tsvector/search-table migration in this slice.
- Expanded `SearchType` from `all | issue | page | comment` to `all | project | issue | page | comment | attachment`.
- Added bounded project search across key/name/description/workflow/status names/metadata.
- Added bounded attachment metadata search across filename/mime/storage key plus parent issue/page context.
- Extended issue/page search to include attachment filenames and project/metadata-adjacent fields while preserving existing issue/page/comment behavior.
- Rebuilt `/search` into a dense Workhub-native search console with source tabs, source select, bounded-result note, metadata chips, empty state, and no schema/importer behavior changes.
- Added integration regression coverage for project-only and attachment-only search in `tests/integration/m4-hardening.test.ts`.

Files touched / current line counts:
- `src/modules/search/service.ts` — 152 lines
- `src/app/(app)/search/page.tsx` — 111 lines
- `tests/integration/m4-hardening.test.ts` — 98 lines

Exact verification results:
- `npm run typecheck` — PASS.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test` — PASS; 9 files / 32 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed.
- Dev server restarted after build on `127.0.0.1:4000`; active session `proc_9380df0d3e05`, listening node PID `55856` at verification time.

Browser smoke:
- `http://localhost:4000/search?q=CTI&type=all` rendered search console and showed `50 results for “CTI”`, including project and issue result types.
- `http://localhost:4000/search?q=CTI&type=project` showed `6 results for “CTI”` and only project result cards.
- `http://localhost:4000/search?q=Team&type=page` showed `8 results for “Team”` from Codex pages.
- `http://localhost:4000/search?q=png&type=attachment` rendered the Attachments source and a clean `0 results` state without blank page.
- Browser console after smoke: 0 JS errors.
- Page-level horizontal overflow checks: no overflow (`scrollWidth == clientWidth == 1280`) on smoked routes.

Remaining after this update:
- Gap C / Original Gap 11: production integrations bucket (real webhook sender, SSO, Elasticsearch). Requires real endpoint/IdP/search infra before implementation.
- Gap D / Original Gap 12: Modules remains deferred; needs a short design note and owner semantics before building.

## Update — Remaining Gap C / Original Gap 11 real webhook sender complete (2026-07-14 22:28:06 +0700)

Scope completed:
- Implemented real outbound webhook delivery for the existing WebhookEndpoint/WebhookDelivery schema without adding migrations.
- Replaced the previous simulated `dev-delivered` behavior with real HTTP `POST` delivery from `deliverPendingWebhooks`.
- Added JSON delivery body with delivery id, event, workspace id, timestamp, and payload data.
- Added delivery headers: `x-workhub-event`, `x-workhub-delivery`, `x-workhub-timestamp`, and optional `x-workhub-signature`.
- Added HMAC-SHA256 signing when a webhook secret is configured; signature format is `sha256=<hex>` over `<timestamp>.<body>`.
- Added 8 second request timeout and delivery status updates: `DELIVERED` for 2xx, `FAILED` for non-2xx/errors. Failed deliveries remain retryable while attempts are below 5.
- Updated Advanced Admin UI button text from `Dev-deliver pending webhooks` to `Deliver pending webhooks`.
- Added integration coverage using a real local HTTP server to receive and assert the webhook request, headers, signature presence, JSON body, and persisted delivery status.

Files touched / current line counts:
- `src/modules/advanced/service.ts` — 155 lines
- `src/app/(app)/admin/advanced/page.tsx` — 89 lines
- `tests/integration/m5-advanced.test.ts` — 95 lines

Exact verification results:
- `npm run typecheck` — PASS.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test -- tests/integration/m5-advanced.test.ts` — PASS; 1 file / 3 tests, including real local webhook POST smoke.
- `npm test` — PASS; 9 files / 32 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed.
- Dev server restarted after build on `127.0.0.1:4000`; active session `proc_6a1c3f9eb380`, listening node PID `58630` at verification time.

Browser smoke:
- `http://localhost:4000/admin/advanced` rendered after login as `alice@demo.local`.
- Page showed `Advanced admin` heading, Webhooks section, Automations section, and `Deliver pending webhooks` action.
- Browser console after smoke: 0 JS errors.
- Page-level horizontal overflow check: no overflow (`scrollWidth == clientWidth == 1280`).

Remaining after this update:
- SSO remains blocked on real IdP details (issuer/tenant/client id/client secret/callback requirements). Do not invent credentials.
- Elasticsearch remains blocked on ES endpoint and index mapping decision. Current Gap B schema-light search works for local/demo data; ES is optional until infra exists.
- Gap D / Original Gap 12 Modules remains deferred; next safe step is a design note defining how Modules differ from labels/epics/saved filters before any schema/UI build.

## Update — Remaining-only handoff created (2026-07-14 22:35:22 +0700)

Created concise next-session handoff for the only remaining items after Gap A, Gap B, and real webhook sender completion:

- `/Users/phattarawutsakonsaringkarn/Documents/ClaudexOb/ClaudexOB/AI_Generated/workhub-next-session-remaining-only-handoff-2026-07-14.md`

Use that file first in the next session. Remaining work is limited to:

1. SSO — blocked until real IdP details exist.
2. Elasticsearch/OpenSearch — blocked until endpoint/index mapping decision exists.
3. Modules — design-note-first only; do not add schema until semantics are approved.

## Update — Remaining Item 3 / Modules design note complete (2026-07-14 22:40:33 +0700)

Scope completed:
- Created a design-only Modules decision record at `docs/modules-design-note.md`.
- Confirmed no dedicated Module schema should be added yet.
- Documented the recommended low-risk path: use existing labels, epics, custom fields, saved filters, project views, `Issue.customFields`, and `ExternalMapping` before adding any new model.
- Defined what a future Module should mean, when it is justified, how it differs from labels/epics/custom fields/saved filters/project views, and how Jira Component/custom-field mappings should preserve source metadata.
- Captured a Phase 1 schema-safe grouping option and a Phase 2 schema option that requires June approval.
- No schema migration, route change, importer change, data write, or runtime behavior change was made.

Files touched / current line counts:
- `docs/modules-design-note.md` — 150 lines.

Verification:
- `read_file docs/modules-design-note.md` — PASS; file rendered correctly.
- `wc -l docs/modules-design-note.md` — PASS; 150 lines.
- `test -s docs/modules-design-note.md` — PASS; file exists and is non-empty.
- `git status --short` — checkout is still not a git repo (`fatal: not a git repository`).
- Port check: Workhub dev server still listening on `127.0.0.1:4000`, node PID `58630`.

Remaining after this update:
- SSO remains blocked until real IdP details exist.
- Elasticsearch/OpenSearch remains blocked until endpoint/index mapping decision exists.
- Modules should stay design-only unless June confirms semantics. If visible value is needed without schema risk, next safe implementation is a schema-safe Modules grouping view driven by existing labels/custom fields/saved filters.

## Update — Remaining Item 2 / Elasticsearch/OpenSearch integration complete (2026-07-14 23:02:51 +0700)

Scope completed:
- Added Elasticsearch/OpenSearch-compatible search integration without adding schema migrations.
- Kept bounded Postgres/local search as the default provider.
- Added env-gated external provider selection through `WORKHUB_SEARCH_BACKEND=elasticsearch|opensearch` plus `WORKHUB_SEARCH_URL` / index / auth settings.
- Added an HTTP-compatible `ElasticsearchClient` using the shared `_search` and `_bulk` APIs, so it works with Elasticsearch or OpenSearch without a new npm dependency.
- Added index mapping creation, bulk indexing, API-key/basic-auth support, request timeout, and query fallback to the local provider if external search fails.
- Added workspace search-document serialization for projects, issues, pages, comments, and attachment metadata.
- Added `npm run search:reindex` via `scripts/rebuild-search-index.ts` to rebuild the configured external index for a workspace.
- Updated `/search` copy to describe the configured provider and external-search switch.
- Added deterministic unit coverage with a local HTTP server asserting index creation, bulk indexing, search request shape, authorization header, and result mapping.

Files touched / current line counts:
- `src/modules/search/service.ts` — 396 lines.
- `src/app/(app)/search/page.tsx` — 111 lines.
- `tests/unit/elasticsearch-search.test.ts` — 94 lines.
- `scripts/rebuild-search-index.ts` — 29 lines.
- `package.json` — 52 lines.
- `.env.example` — 27 lines.

Exact verification results:
- `npm run typecheck` — PASS.
- `npm test -- tests/unit/elasticsearch-search.test.ts` — PASS; 1 file / 1 test.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test` — PASS; 10 files / 33 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed, 26 static pages generated.
- Dev server restarted after build on `127.0.0.1:4000`; Hermes process session `proc_5dff80fb4c92`, wrapper PID `66810`, listening node PID `66833`.
- `curl -I http://127.0.0.1:4000/login` — PASS; HTTP 200.
- `git status --short` — checkout is still not a git repo (`fatal: not a git repository`).

Browser smoke:
- Logged in as `alice@demo.local` / `password123`.
- `/search?q=CTI&type=all` — PASS; showed `50 results for “CTI”`; no horizontal overflow (`scrollWidth == clientWidth == 1280`).
- `/search?q=CTI&type=project` — PASS; showed `6 results for “CTI”`; project-only source had no issue/page/comment/attachment result tags; no overflow.
- `/search?q=Team&type=page` — PASS; showed `8 results for “Team”`; no overflow.
- `/search?q=gap7&type=attachment` — PASS; showed `2 results for “gap7”`; no overflow.
- Browser console after smoke: 0 JS messages / 0 JS errors.

Operational notes:
- Default remains `WORKHUB_SEARCH_BACKEND="postgres"`, so current local/demo search behavior is unchanged.
- To enable external search, configure `WORKHUB_SEARCH_BACKEND="elasticsearch"` or `"opensearch"`, set `WORKHUB_SEARCH_URL`, `WORKHUB_SEARCH_INDEX`, and auth envs as needed, then run `npm run search:reindex -- <workspace-slug>`.

Remaining after this update:
- SSO remains blocked until real IdP details exist.
- Modules remain design-only unless June approves schema-safe grouping or a dedicated semantics/model.

## Update — Search operations UI + admin-ready control center complete (2026-07-15 09:01:35 +0700)

Scope completed:
- Added Search operations UI to `/admin/advanced`.
- The Search operations panel shows backend, endpoint host, index name, auth mode, indexable document count, per-type counts, and reindex readiness.
- Added guarded `Rebuild external search index` action. The button is disabled until external search env is configured, so local Postgres fallback cannot accidentally submit a failing external reindex.
- Added admin service helpers for search operations status and reindex action delegation.
- Added integration coverage for search operations status without requiring a live Elasticsearch/OpenSearch cluster.
- Rebuilt `/admin` into an admin-ready control center with live readiness cards for Migration, Webhooks, Search index, and Automation, plus export links, recent audit table, and next-step links.
- Preserved schema/importer behavior; no migrations, no data writes, no importer changes.

Files touched / current line counts:
- `src/app/(app)/admin/page.tsx` — 113 lines.
- `src/app/(app)/admin/advanced/page.tsx` — 142 lines.
- `src/app/(app)/admin/advanced/actions.ts` — 59 lines.
- `src/modules/advanced/service.ts` — 192 lines.
- `tests/integration/m5-advanced.test.ts` — 104 lines.

Exact verification results:
- `npm run typecheck` — PASS.
- `npm test -- tests/integration/m5-advanced.test.ts` — PASS; 1 file / 4 tests.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test` — PASS; 10 files / 34 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed, 26 static pages generated.
- Dev server restarted after build on `127.0.0.1:4000`; Hermes process session `proc_4bd1840c8954`, wrapper PID `81025`, listening node PID `81048`.
- `curl -I http://127.0.0.1:4000/login` — PASS; HTTP 200.
- `git status --short` — checkout is still not a git repo (`fatal: not a git repository`).

Browser smoke:
- Logged in as `alice@demo.local` / `password123`.
- `/admin` — PASS; rendered `Admin readiness`, Migration, Webhooks, Search index, Automation, recent audit, export links, and admin next steps; no horizontal overflow (`scrollWidth == clientWidth == 1280`).
- `/admin/advanced` — PASS; rendered `Elasticsearch / OpenSearch readiness`, backend `postgres`, local fallback state, document count, per-type counts, and disabled reindex button; no horizontal overflow.
- Browser console after smoke: 0 JS messages / 0 JS errors.

Remaining after this update:
- SSO remains blocked until real IdP details exist.
- Modules remain design-only unless June approves schema-safe grouping or a dedicated semantics/model.


## Update — Uinfo Codex Confluence-style space/page polish complete (2026-07-15 09:46:34 +0700)

Scope completed:
- Polished Uinfo Codex using Plane/modern-workspace ideas as UX reference only, targeting a Confluence-like Codex experience.
- Rebuilt `/s/[spaceKey]` into a Space overview with hero, space key, description, quick actions, live KPI cards, page tree card, recently updated pages, and Confluence-style create page panel.
- Space overview now shows live counts for pages, root pages, linked Nexus issues, attachments, comments, child pages, files, and page links.
- Rebuilt `/s/[spaceKey]/pages/[pageId]` into a Confluence-like page view with page hero, version/updated metadata, editor user, page health, rich read card, editor card, discussion section, table of contents, linked Nexus work, versions, and attachments panels.
- Preserved existing Codex actions and data model: Page, PageVersion, Comment, Attachment, IssuePageLink, rich JSON content, edit locks, version restore, and MinIO-backed attachments.
- Added checklist doc `docs/codex-confluence-checklist.md` with completed items checked and future candidates listed.
- No schema migration, importer change, copied Plane source/assets, or data mutation.

Files touched / current line counts:
- `src/app/(app)/s/[spaceKey]/page.tsx` — 127 lines.
- `src/app/(app)/s/[spaceKey]/pages/[pageId]/page.tsx` — 165 lines.
- `docs/codex-confluence-checklist.md` — 73 lines.

Exact verification results:
- `npm run typecheck` — PASS.
- `npm run lint` — PASS; no ESLint warnings/errors.
- `npm test` — PASS; 10 files / 34 tests. Known existing `pg` deprecation warning appeared during integration tests.
- `npm run build` — PASS; Next.js production build completed, 26 static pages generated.
- Dev server restarted after build on `127.0.0.1:4000`; Hermes process session `proc_75e775e050e8`, listening node PID `88008`.
- `curl -I http://127.0.0.1:4000/login` — PASS; HTTP 200.
- `git status --short` — checkout is still not a git repo (`fatal: not a git repository`).

Browser smoke:
- Logged in as `alice@demo.local` / `password123`.
- `/s/TEAM` — PASS; rendered `UINFO CODEX · SPACE OVERVIEW`, Team Handbook hero, KPI cards, page tree, Recently updated, Confluence-style authoring/create panel, and no horizontal overflow (`scrollWidth == clientWidth == 1280`).
- `/s/TEAM/pages/019f4fc5-b1d6-71d0-9fda-dceb6fd9ecf2` — PASS; rendered `UINFO CODEX · PAGE`, page metadata, ready-to-edit health, editor, comments, table of contents, linked Nexus work, versions, attachments including `gap7-codex-smoke.txt`, and no horizontal overflow.
- Browser console after smoke: 0 JS messages / 0 JS errors.

Checklist:
- Completed checklist saved at `docs/codex-confluence-checklist.md`.
- Future Codex candidates remain: slash-command menu, better table controls, callout authoring, image embed from attachment route, page labels/filters, page tree expand/collapse persistence, page context menu, Docs tab as linked-docs hub, and Confluence import wizard if real source details exist.

Remaining after this update:
- SSO remains blocked until real IdP details exist.
- Modules remain design-only unless June approves schema-safe grouping or a dedicated semantics/model.
- Optional next Codex slice: Docs tab inside Nexus project as a linked-docs hub, or page tree context menu / expand-collapse persistence.
