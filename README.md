# ReconcileDesk

A local payment reconciliation portfolio application built with React, TypeScript,
Express, PostgreSQL/Prisma, Redis/BullMQ and a FastAPI service foundation.

**Current stage: Milestone 5 — private AI summaries with a $1 lifetime budget.**

Start with [docs/MILESTONE_5.md](docs/MILESTONE_5.md) for Windows setup, patching,
verification, demo expectations, metrics and Git commands. Read
[docs/CSV_CONTRACT.md](docs/CSV_CONTRACT.md) for the exact format and approved rules.

## Implemented

- Persistent CSV jobs and row-level import reports.
- Validation, duplicate protection and conflicting-record quarantine.
- Atomic database commits, bounded retries and durable queue dispatch.
- Integer-paise matching, fee/refund checks, orphan detection and immutable snapshots.
- Upload interface, paginated reports and exception filtering.
- Synthetic fixtures, independent expectations, engine evaluation and recovery tests.

- Email/password sign-in, server-side sessions and viewer/operator permissions.
- Operator assignments, notes, resolution/reopening and stale-edit protection.
- Transactional audit history with database UPDATE/DELETE protection.

- Evidence-linked GPT-4.1 mini summaries with manual generation, stale detection and history.
- Persistent spending reservations, zero-cost automated tests and manual evaluation exports.

Live AI is disabled by default; follow the Milestone 5 guide to enable it privately.
Public hosting is not enabled. This release
remains bound to localhost and uses synthetic data.

## Start locally

With Docker Desktop running Linux containers, run from the root in PowerShell:

```powershell
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
npm.cmd ci
npm.cmd run check
docker compose up --build --detach --wait --wait-timeout 180
docker compose exec -T api npm run seed:demo --workspace '@reconciledesk/api'
```

Save the generated passwords privately. Open http://localhost:8080 and sign in. For React hot reload use `npm.cmd run dev:web` and
http://localhost:5173 while keeping the Docker API running. Rebuild Docker after
backend/worker changes. `docker compose down` retains database volumes.

## Key files

| Path | Purpose |
|---|---|
| apps/api/src/domain.ts | CSV validation, duplicate classification, matching |
| apps/api/src/store.ts | Atomic persistence and reconciliation snapshots |
| apps/api/src/worker.ts | Queue worker and durable dispatcher |
| apps/api/src/routes.ts | Protected HTTP contracts |
| apps/api/src/auth.ts | Passwords, sessions, CSRF and permissions |
| apps/api/src/investigations.ts | Assignment, notes and workflow |
| apps/api/src/audit.ts | Transactional audit event creation |
| apps/api/src/summaries.ts | Evidence, budget reservations and summary persistence |
| apps/api/src/summary-contract.ts | Model, price and output validation |
| apps/api/prisma/ | Schema and additive migrations |
| apps/api/tests/ | Unit, API and isolated-database tests |
| apps/web/src/ | React workspace and reports |
| data/demo/ | Synthetic CSVs and expected outcomes |
| services/ai/ | Protected, bounded OpenAI summary service |
| metrics/, evaluations/ | Measurement templates and local outputs |

Read AGENTS.md and inspect existing files before asking Cursor to edit. Review
changes and run the relevant checks. Do not modify financial rules or proceed
to later milestones without agreement.
