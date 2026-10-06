# Milestone 3 package validation

## Completed during preparation

- Prisma client generation, ESLint, TypeScript checks, API build and frontend build passed.
- 38 unit/API tests passed.
- Six database integration tests passed against embedded PostgreSQL (PGlite)
  over its PostgreSQL socket interface, using a single-connection test pool.
- Both SQL migrations executed successfully in that embedded database.
- Database tests verified rollback after injected writes, safe retries,
  cross-file duplicates, conflict preservation, snapshot persistence/reuse,
  late counterpart handling and refusal of invalid/pending work.
- All 11 demo classifications matched independently specified expected results.
- Five in-process runs parsed/classified/reconciled 10,000 payments plus
  10,000 settlements. The generated report explicitly excludes networking,
  queueing, PostgreSQL persistence and Docker startup.

## Still requires the user's Windows environment

- Docker rebuild and Prisma migration deployment on PostgreSQL 17.
- The isolated database test wrapper against actual PostgreSQL with its normal pool.
- Real Redis/BullMQ import dispatch, concurrent repeated uploads and live demo verification.
- The four updated browser tests. The earlier Milestone 2 browser tests passed
  on the user's computer; the expanded suite has not been run here.

Docker and a usable browser binary are unavailable in the package-building
session. Embedded database tests are not claimed as Docker/PostgreSQL 17 or
multi-connection concurrency validation.

Run the commands in MILESTONE_3.md and record actual local results. The database
suite skips by default without TEST_DATABASE_URL; verify:db provides its isolated
execution environment. No skipped test is counted as passing.

The user previously verified the unchanged Python foundation under Python 3.13:
2 tests passed, with the visible Starlette/httpx deprecation warning.
