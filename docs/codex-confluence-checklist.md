# Uinfo Codex Confluence-style Migration Checklist

Updated: 2026-07-15

Purpose: track Plane/modern-workspace ideas adapted into Uinfo Codex as Workhub-native, Confluence-like documentation UX.

## Completed

- [x] Codex space overview shell
  - Route: `/s/[spaceKey]`
  - Adds Confluence-like space header, key, description, quick actions, and live KPI cards.

- [x] Space-level document metrics
  - Shows page count, root page count, linked Nexus issue count, attachment count, and comment count from live DB data.

- [x] Page tree card polish
  - Keeps existing drag/drop tree component.
  - Presents the tree as the main navigation card with live page count.

- [x] Recently updated pages panel
  - Shows latest pages with updated timestamp, child count, comments, files, and Nexus links.

- [x] Confluence-style create page panel
  - Keeps existing create action and schema.
  - Uses rich editor and parent-page selector.
  - No schema/importer changes.

- [x] Confluence-like page hero
  - Route: `/s/[spaceKey]/pages/[pageId]`
  - Adds page title area, space backlink, version, updated timestamp, updater, Nexus link count, and page health.

- [x] Page read view polish
  - Rich content renders in a dedicated document card.
  - Lock/read-only banner remains visible when needed.

- [x] Page editor card polish
  - Keeps lock/edit and unlock controls.
  - Keeps existing save/publish/PageVersion behavior.
  - Uses the existing Workhub rich editor.

- [x] Page discussion polish
  - Comments show as a Confluence-like discussion section.
  - Existing comment action is preserved.

- [x] Table of contents panel
  - Extracts heading nodes from existing rich JSON content.
  - No schema changes.

- [x] Linked Nexus work panel
  - Shows issues linked to the current page through existing `IssuePageLink` records.
  - Preserves Jira/Nexus issue keys and routes.

- [x] Versions and attachments side panels
  - Keeps version restore and MinIO-backed attachment upload/download behavior.

## Not done yet / future candidates

- [ ] Slash-command menu for editor actions.
- [ ] Better table editing controls.
- [ ] Callout/panel authoring buttons for Info/Warning/Decision blocks.
- [ ] Image embed from existing attachment route.
- [ ] Page labels UI and space-level label filters.
- [ ] Page tree expand/collapse persistence.
- [ ] Page context menu: new child, rename, move, archive.
- [ ] Docs tab inside Nexus project as a linked-docs hub.
- [ ] Confluence import dry-run wizard if real Confluence export/source details exist.

## Guardrails

- Plane remains UX reference only; no copied Plane source/assets/components.
- Uinfo Codex remains Workhub-native and Confluence-like.
- Preserve existing Page, PageVersion, Attachment, Comment, and IssuePageLink data.
- Prefer schema-safe UI slices before new schema.
