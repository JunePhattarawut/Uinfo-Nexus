# Workhub/Nexus Modules Design Note

Created: 2026-07-14 22:40:33 +0700

Purpose: define the safest next step for the deferred Modules gap before any schema or UI implementation.

## Decision summary

Do not add a dedicated Module schema yet.

Start with existing Workhub/Nexus primitives:

- Labels for lightweight cross-cutting grouping.
- Epics and parent/child issue hierarchy for delivery breakdown.
- Custom fields for imported Jira component/module/team metadata.
- Saved filters and project views for repeatable module-like slices.
- Existing Jira source metadata in `Issue.customFields` and `ExternalMapping` for traceability.

A dedicated Module model should be added only after June confirms a workflow that cannot be solved cleanly by those primitives.

## What is a Module?

A Module in Workhub/Nexus should mean a product or system area that groups work items for planning, ownership, and reporting.

Examples:

- Identity / SSO
- Migration tooling
- Workhub UI shell
- Codex documentation
- Infrastructure / deployment

A Module is not automatically the same as a label, an epic, a Jira component, or a saved filter. It may map to any of those depending on the source data and workflow.

## What workflow would Modules solve?

A dedicated Modules feature is justified only if the user needs most of these capabilities:

1. Browse a stable list of product/system areas inside a project.
2. Assign an owner or small owner group to each area.
3. Track module status or health independently from individual issues.
4. See a module dashboard: open work, overdue work, done work, docs, recent activity.
5. Connect imported Jira work to the correct area without losing original Jira fields.
6. Use modules as a planning/reporting concept across board/list/reports.

If the need is only filtering or grouping, use saved filters/custom fields first.

## How Modules differ from existing primitives

| Primitive | Best for | Why not enough for full Modules |
|---|---|---|
| Label | Lightweight tagging and ad hoc grouping | Usually no owner, description, rank, status, or dashboard |
| Epic | Delivery hierarchy and parent rollups | Represents a body of work, not necessarily a stable product area |
| Custom field | Preserving imported metadata such as Jira Component | Raw value only; no first-class UI/ownership by itself |
| Saved filter | Repeatable view/query | Query shortcut, not an entity with lifecycle or ownership |
| Project view | Display mode such as board/list/calendar | Does not define an area of responsibility |

## Jira/import mapping

Preserve imported Jira metadata as source of truth.

Potential mappings:

- Jira Component -> candidate Module only after user approval.
- Jira Epic/Initiative -> keep as issue hierarchy unless explicitly mapped.
- Jira labels -> stay labels by default.
- Existing imported custom fields -> remain visible/searchable even if later mapped to Modules.
- `ExternalMapping` should be used to trace any future imported Module back to its source value or object.

Do not hide original Jira component/custom-field values after introducing module grouping.

## Scope decision

Recommended low-risk path:

### Phase 0 — Design only (current state)

- Keep this note as the canonical Modules decision record.
- No schema migration.
- No route changes.
- No importer changes.

### Phase 1 — Schema-safe UI grouping, if June wants a visible Modules surface

Use existing data only:

- Add a Modules section to project settings or project reports that lists candidate module groups from labels/custom fields.
- Add saved-view presets such as `Module: <value>` using `SavedFilter.filters`.
- Add list filter chips for module-like custom-field values if already present in issue data.
- Make it clear this is a grouping view, not a new persisted Module entity.

Verification for Phase 1:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Browser smoke exact changed project routes on `127.0.0.1:4000`.
- Confirm Jira/source metadata remains visible.

### Phase 2 — Dedicated Module schema, only after approval

Possible schema after workflow approval:

- `ProjectModule`
  - `id`
  - `workspaceId`
  - `projectId`
  - `name`
  - `description`
  - `ownerId` nullable
  - `status` such as `ACTIVE | PAUSED | ARCHIVED`
  - `rank`
  - `metadata Json`
  - timestamps
- Relationship to issues:
  - Prefer `Issue.customFields.moduleId` only for a first migration-light experiment, or
  - Add an explicit join table only if many-to-many is required.

Importer considerations:

- Add dry-run review before mapping Jira Components/custom fields to Modules.
- Preserve source values in custom fields and `ExternalMapping`.
- Do not silently convert labels/components into modules during import.

Verification for Phase 2:

- Migration deploy/generate.
- Service tests for tenancy and mapping.
- Import dry-run tests if importer mapping is touched.
- Full typecheck/lint/test/build.
- Browser smoke project settings, issue list, issue detail, reports.

## Open questions for June

Before implementation beyond Phase 0, confirm:

1. Should Module mean Jira Component, internal product area, team ownership area, or something else?
2. Should an issue belong to one module or multiple modules?
3. Should modules be project-scoped only, or shared across the workspace?
4. Does each module need an owner and status?
5. Should modules appear in issue create/edit forms?
6. Should imported Jira Components become modules automatically, or only after review?
7. Should module reporting be required, or is saved-filter grouping enough?

## Current recommendation

Stop at this design note unless June gives module semantics.

If June wants visible value without schema risk, implement Phase 1: a schema-safe Modules grouping view driven by existing labels/custom fields/saved filters.
