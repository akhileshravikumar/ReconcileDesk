# ReconcileDesk

A local payment reconciliation portfolio application built with React, TypeScript,
Express, PostgreSQL/Prisma, Redis/BullMQ and a FastAPI service foundation.

**Current stage: Milestone 3 — CSV imports and deterministic matching.**

Start with [docs/MILESTONE_3.md](docs/MILESTONE_3.md) for Windows setup, patching,
verification, demo expectations, metrics and Git commands. Read
[docs/CSV_CONTRACT.md](docs/CSV_CONTRACT.md) for the exact format and approved rules.

## Implemented

- Persistent CSV jobs and row-level import reports.
- Validation, duplicate protection and conflicting-record quarantine.
- Atomic database commits, bounded retries and durable queue dispatch.
- Integer-paise matching, fee/refund checks, orphan detection and immutable snapshots.
- Upload interface, paginated reports and exception filtering.
- Synthetic fixtures, independent expectations, engine evaluation and recovery tests.

Authentication, assignments, investigation notes, resolution workflows, audit
history, OpenAI summaries and public hosting are later milestones. This release
remains bound to localhost and uses synthetic data.

## Start locally

With Docker Desktop running Linux containers, run from the root in PowerShell:

```powershell
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
npm.cmd ci
npm.cmd run check
docker compose up --build --detach --wait --wait-timeout 180
```

Open http://localhost:8080. For React hot reload use `npm.cmd run dev:web` and
http://localhost:5173 while keeping the Docker API running. Rebuild Docker after
backend/worker changes. `docker compose down` retains database volumes.

## Key files

| Path | Purpose |
|---|---|
| apps/api/src/domain.ts | CSV validation, duplicate classification, matching |
| apps/api/src/store.ts | Atomic persistence and reconciliation snapshots |
| apps/api/src/worker.ts | Queue worker and durable dispatcher |
| apps/api/src/routes.ts | HTTP contracts |
| apps/api/prisma/ | Schema and additive migrations |
| apps/api/tests/ | Unit, API and isolated-database tests |
| apps/web/src/ | React workspace and reports |
| data/demo/ | Synthetic CSVs and expected outcomes |
| services/ai/ | FastAPI foundation; no model calls yet |
| metrics/, evaluations/ | Measurement templates and local outputs |

Read AGENTS.md and inspect existing files before asking Cursor to edit. Review
changes and run the relevant checks. Do not modify financial rules or proceed
to later milestones without agreement.
