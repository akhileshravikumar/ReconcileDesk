# Milestone 4 package validation

## Completed during preparation

- Prisma generation, ESLint, TypeScript checks and API/frontend builds passed.
- 44 unit/API tests passed; 21 database tests skip in that default command.
- All 21 database tests passed separately against embedded PostgreSQL (PGlite)
  through its PostgreSQL socket interface, using a single-connection pool.
- Those 21 comprise six existing financial persistence tests and 15 new
  authentication, role, CSRF, session, investigation and audit tests.
- All three SQL migrations executed successfully in the embedded database.
- An existing Milestone 3 demo database was upgraded: eight investigations and
  eight migration audit events were created. Every ledger record and historical
  reconciliation finding compared equal before and after the upgrade.
- Patch application was verified against the clean Milestone 3 source baseline.

## Pending verification on Windows

- Docker rebuild and actual PostgreSQL 17 migration deployment.
- The isolated database wrapper with its normal connection pool.
- Authenticated live demo verification using real Redis/BullMQ and concurrent
  repeat uploads. The supplied PowerShell script prompts for an operator login.
- Seven browser tests and the manual three-account workflow.

Docker is unavailable here. Chromium installation was attempted but its archive
could not be downloaded successfully; no browser test is claimed as passed here.
Embedded PostgreSQL checks are not Docker or multi-connection concurrency checks.

The user already verified Milestone 3 on Windows: four browser tests, six database
tests, queue smoke, live fixture checks and all 11 expected classifications.
The user's earlier in-process engine benchmark averaged 182.508 ms across five
runs for 10,000 payments plus 10,000 settlements; it excludes HTTP, queueing and
persistence and is not a Milestone 4 full-system benchmark.

The Python service is unchanged. Its two tests previously passed on the user's
computer, with a Starlette/httpx deprecation warning.

Follow MILESTONE_4.md. Do not count skipped tests as passing or claim a public
production deployment, AI summaries, or completed Windows validation yet.
