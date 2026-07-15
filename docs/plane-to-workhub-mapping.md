# Plane-to-Workhub/Nexus Mapping

Created: 2026-07-14
Source reference: `/Users/phattarawutsakonsaringkarn/Documents/ClaudexOb/ClaudexOB/AI_Generated/workhub-plane-integration-handoff-2026-07-14.md`
Workhub path: `/Users/phattarawutsakonsaringkarn/Documents/Work/UinfoJira&ConfluProject/workhub`

## Guardrails

- Plane is AGPL-3.0. Use Plane as a product/UX reference only unless June explicitly approves license review and AGPL obligations.
- Do not copy Plane source code, components, assets, or implementation details directly into Workhub.
- Keep Workhub/Nexus data fidelity first: Jira keys, original IDs, source URLs, statuses, issue types, comments, activity history, custom fields, references, tables, and imported attributes must remain visible/searchable.
- Before UI changes, inspect existing data-backed surfaces and preserve current routes.
- Browser-smoke every vertical slice on the active Workhub port, normally `http://127.0.0.1:4000`.

## Current Workhub assessment

### Runtime and repo

- Stack: Next.js App Router + TypeScript + Prisma + PostgreSQL + Auth.js.
- Package manager in this checkout: `npm` scripts are available; `pnpm-lock.yaml` also exists, but historical handoff says use npm for this checkout.
- This folder is not currently a git repository; initialize or attach git before production commits.
- Docker services are defined in `docker-compose.yml`: PostgreSQL `5432`, Redis `6379`, MinIO `9000/9001`.

### Verification snapshot

- `docker compose up -d`: services started.
- PostgreSQL health: healthy.
- `npx prisma migrate status`: database schema is up to date, 4 migrations found.
- `npm run typecheck`: passed.
- `npm test`: 9 files passed, 32 tests passed.

Current DB counts observed after services started:

| Entity | Count |
|---|---:|
| Workspaces | 1 |
| Projects | 21 |
| Issues | 202 |
| Spaces | 1 |
| Pages | 8 |
| Import jobs | 23 |
| External mappings | 192 |
| Activity logs | 47 |
| Comments | 5 |
| Attachments | 0 |

Imported/project inventory includes CTI, CTR, CPAR, DAR, GSR, MA, OM, RLGA, RLR, RA, RAS, UCR, UDC, GWM, IN, UIA, RTP, TPM, TPRM, TPRR, plus DEMO.

### Existing routes relevant to Plane-inspired work

| Workhub route | Current role |
|---|---|
| `/projects` | Project directory/table |
| `/projects/new` | Jira-like project creation form |
| `/p/[projectKey]/issues` | Project issue surface with Summary/Board/List/Calendar/Timeline/Reports tabs |
| `/p/[projectKey]/issues/[issueKey]` | Issue detail with Details, References, Activity tabs |
| `/p/[projectKey]/backlog` | Agile backlog/sprint surface |
| `/p/[projectKey]/settings` | Project settings, statuses, saved filters |
| `/s/[spaceKey]` | Codex/space page tree |
| `/admin/migration` | Jira migration console and dry-run jobs |
| `/search` | Global search |

### Existing data model support

Workhub already supports most foundational concepts needed for Plane-style UX:

- Workspace: `Workspace`, `Membership`.
- Project: `Project`, `ProjectMember`, `Status`, `Sprint`.
- Work item: `Issue`, `IssueLink`, `Comment`, `Label`, `IssueLabel`, `ActivityLog`.
- Docs/pages: `Space`, `Page`, `PageVersion`, `IssuePageLink`.
- Import/migration: `ImportJob`, `ImportError`, `ExternalMapping`.
- Saved views/basic automation: `SavedFilter`, `AutomationRule`, `WebhookEndpoint`.
- Original Jira metadata: `Issue.customFields` and `ExternalMapping.metadata`.

## Feature mapping

| Plane capability | Workhub target route/data | Current status | Recommended Workhub-native action | Risk |
|---|---|---|---|---|
| Instance/workspace onboarding | `Workspace`, `/admin`, `/admin/migration` | Basic workspace exists; migration console exists | Build a setup/import wizard inspired by Plane admin flow: Connect Jira → Dry run → Review mapping → Import → Verify | Medium: avoid writing imports without dry-run |
| Workspace home | `/(app)/page.tsx`, sidebar shell | Existing app shell and home | Add compact dashboard cards for Projects, Docs, Imports, Recent activity, My work | Low |
| Project directory | `/projects` | Data-backed table exists | Upgrade to Plane-like cards/table hybrid with empty state, counts, lead/avatar, source badges | Low |
| Project creation modal | `/projects/new`, `Project`, `Status`, `ProjectMember` | Jira-like full page exists | Convert or supplement with compact Plane-inspired modal/card flow: cover/icon/theme, name, auto key, description, access, lead, template, collapsed Jira mapping | Medium: Project schema lacks cover/icon/theme fields |
| Project cover/icon/theme | `Project` currently has no fields | Not supported | Add fields only if needed: `icon`, `coverImage`, `themeColor`, `visibility/sourceType` or store initially in metadata if adding a dedicated JSON field is approved | Medium: schema migration required |
| Project visibility/public-private | `ProjectMember`, membership policy | Partial: create action handles open/private by members | Make access state visible in project list/detail and enforce policy consistently | Medium: must verify permissions |
| Work items / issues | `/p/[projectKey]/issues`, `Issue` | Data-backed board/list exists | Polish layout using Plane interaction patterns while preserving Jira fields and original Jira links | Medium: avoid hiding imported attributes |
| Board view | `/p/[projectKey]/issues?view=board`, dnd-kit | Exists | Improve column/card density, drag affordances, assignee initials, issue metadata chips | Low/Medium: browser drag smoke required |
| List view | `/p/[projectKey]/issues?view=list` | Exists | Add saved columns, quick filters, source/Jira fields toggle | Medium |
| Calendar/timeline views | Existing route tabs | Exists in simple form | Keep as lightweight data-backed views; avoid building full Gantt | Low |
| Cycles | `Sprint` / backlog | Existing sprint model | Treat Plane Cycle as Workhub Sprint/Cycle label in UI; optionally rename display only, no schema change | Low |
| Modules | No dedicated model | Not implemented | Map to Jira Component/Epic/Initiative via existing labels/customFields first; only add `Module` model after real use case | Medium |
| Views/filters | `SavedFilter` | Exists | Build Plane-like saved-view UX on top of `SavedFilter.filters` with scope private/workspace | Low |
| Pages/docs | `/s/[spaceKey]`, `Page`, `IssuePageLink` | Exists | Cross-link docs inside project tabs; keep Codex pages as source of truth | Low |
| Analytics/reports | `/p/[projectKey]/issues?view=reports`, sprint metrics | Partial | Add compact project reports: status, priority, overdue, throughput from existing issues/activity | Low |
| Comments/activity/history | Issue detail Activity section | Exists and recently hardened | Preserve Jira-style tabs. History visible only when selected; no-op saves must not create activity logs | High: regression-prone |
| Attachments/files | `Attachment`; metadata-only currently | Metadata only, count 0 | Do not claim file upload is complete until MinIO byte upload/render exists | High |
| Admin/god mode | `/admin`, `/admin/migration`, `/admin/advanced` | Exists | Use Plane admin flow as reference for setup steps and migration status | Medium |

## Data model gap list

Only add these after a focused UI slice proves they are needed:

1. Project visual metadata
   - `icon`, `coverImage`, `themeColor` or a `Project.metadata Json` field.
   - Needed for Plane-style project cards/modal.

2. Project source/type metadata
   - `sourceType`: manual, jira-imported, template.
   - Could be inferred from `ExternalMapping`, but explicit display may simplify UI.

3. Module/grouping model
   - Avoid initially. Use labels, epics, customFields, and saved filters first.

4. Real attachment storage
   - Existing `Attachment` is metadata; implement MinIO/S3 byte upload before Plane-like cover images or issue attachments.

## Recommended vertical slices

### Slice 1 — Project directory + empty state polish

Target files:

- `src/app/(app)/projects/page.tsx`
- optional small shared components under `src/components/`

Work:

- Keep data from `prisma.project.findMany`.
- Add Plane-inspired empty state: “No active projects”, explanation, Create project CTA, Import Jira CTA.
- Upgrade rows/cards with issue count, workflow preview, source badge, icon/initial fallback.
- No schema changes.

Verification:

- `npm run typecheck`
- `npm test`
- Browser smoke `/projects` after login.

### Slice 2 — Project creation UX refresh

Target files:

- `src/app/(app)/projects/new/page.tsx`
- `src/app/(app)/projects/new/actions.ts`

Work:

- Redesign as compact Plane-inspired creation surface.
- Keep existing safe fields: name, key, description, template, access, lead.
- Add UI-only cover/icon/theme preview first; do not persist until schema change is approved.
- Keep collapsed Jira mapping/source section with clear labels.

Verification:

- Create temporary project through real form.
- Confirm default statuses.
- Delete temporary DB row after smoke if approved.

### Slice 3 — Project header/view shell polish

Target files:

- `src/app/(app)/p/[projectKey]/issues/page.tsx`
- `src/app/(app)/p/[projectKey]/issues/KanbanBoard.tsx`

Work:

- Plane-like compact project header, tabs, quick actions.
- Preserve current view keys: Summary, Board, List, Calendar, Timeline, Reports.
- Keep hidden views addressable if already supported: Approvals, Forms, Docs, Attachments, Archived, Shortcuts.

Verification:

- Smoke representative imported projects: CTI, RA, RLGA.
- Verify no app error markers and no console errors.

### Slice 4 — Issue detail usability pass

Target files:

- `src/app/(app)/p/[projectKey]/issues/[issueKey]/page.tsx`
- `src/modules/issue/service.ts`

Work:

- Keep Jira-like detail fidelity.
- Improve Plane-style interaction only around layout/sections.
- Must preserve: original Jira link, issue type, status, assignee, reporter, custom fields, references, comments, history tab.
- No-op save behavior must remain clean.

Verification:

- Smoke imported keys: `CPAR-58`, `CTI-1619`, `CTR-283`, `RLGA-1`, `RA-1` if present.
- Confirm Activity tabs work and History is only visible when selected.

## Do not do yet

- Do not copy Plane files/components.
- Do not add Module/Cycle schema until the first UI slices prove the gap.
- Do not change Jira migration importer behavior in the UI-polish phase.
- Do not delete or regenerate imported data.
- Do not implement real-time collaboration, JQL parser, generic workflow engine, or Gantt.

## Suggested next prompt

Continue with Slice 1: upgrade `/projects` into a Plane-inspired but Workhub-native project directory and empty state. Preserve real DB data, Jira keys, counts, and Workhub theme. Do not change schema or migration code. Verify with `npm run typecheck`, `npm test`, and browser smoke on `http://127.0.0.1:4000/projects`.
