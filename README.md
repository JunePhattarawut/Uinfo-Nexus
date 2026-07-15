# WorkHub

Self-hosted Uinfo Nexus (issue tracking, Jira-style) + Uinfo Codex (team knowledge base, Confluence-style).
Built per `HANDOFF.md` — read that first; it is the source of truth for scope and decisions.

## Quick start

```bash
cp .env.example .env          # then set a real AUTH_SECRET: openssl rand -base64 32
docker compose up -d          # postgres + redis + minio
npm install
npx prisma migrate deploy     # apply schema
npm run db:seed               # demo data
npm run dev                   # http://localhost:3000
```

Sign in with a seeded account (password `password123`):

| Email | Workspace role |
|---|---|
| alice@demo.local | OWNER |
| bob@demo.local | ADMIN |
| chai@demo.local | MEMBER |
| dao@demo.local | VIEWER |

## Scripts

- `npm run dev` / `build` / `start`
- `npm run typecheck` · `npm run lint` · `npm test`
- `npm run db:migrate` · `npm run db:seed`

## Architecture (short version)

Modular monolith. Route handlers → services → repos; **only repos touch Prisma**, and every
repo call is scoped by `workspaceId`/membership (see `src/lib/tenancy.ts`). Full model and
milestone plan in `HANDOFF.md`.

Current milestone: **M1 — Uinfo Nexus MVP** ✅ (issues, kanban board, comments, activity)
Next: **M2 — Agile layer for Uinfo Nexus** — do not start without owner approval.
