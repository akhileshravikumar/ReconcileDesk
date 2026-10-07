# Milestone 5 package validation

## Completed here, with no paid OpenAI requests

- Prisma generation, ESLint, TypeScript checks and API/frontend builds passed.
- 51 unit/API tests passed. The default test command skips 36 database tests.
- All 36 database integration tests passed against embedded PostgreSQL (PGlite)
  through a PostgreSQL socket with a single-connection test pool. The 15 new
  summary tests were rerun after adding consistent investigation-row locking.
- All four migrations executed successfully in that embedded database.
- 15 Python tests passed under Python 3.12 using the project's pinned packages.
  The existing Starlette/httpx deprecation warning remains visible.
- 13 hand-authored offline contract evaluation cases passed. These test output
  validation, not live model accuracy or prompt-injection resistance.
- The private configuration helper preserved unrelated .env settings and disabled
  AI correctly in a separate synthetic test directory, without network calls.
- The manual-review report calculator passed a synthetic-export smoke check.
- Playwright discovered all 11 browser tests; discovery is not execution.
- The Git patch was checked and applied to a clean Milestone 4 baseline, and
  resulting source files were compared with the prepared source.

The database cases cover disabled mode, request reuse, explicit regeneration,
known/unknown usage, conservative reservations, spending cutoff, concurrent
reservation attempts, pending-request protection, stale notes/snapshots, duplicate
imports, refused/invalid output, role permissions and CSRF. Provider responses
are simulated. Financial findings and manual workflow state remain unchanged.

## Pending on your Windows machine

- Docker rebuild and actual PostgreSQL 17 migration deployment.
- All 36 tests through verify:db with the normal database connection pool.
- Python tests in the Python 3.13 container.
- Live infrastructure/queue checks and authenticated data verification.
- All 11 browser tests and the manual operator/viewer walkthrough.
- One explicitly requested live OpenAI summary, then a small manually reviewed
  sample if the first call succeeds.

Docker and a usable Chromium binary are unavailable in this preparation session.
The earlier Chromium download attempt failed; the expanded browser tests are
included for your existing working Windows setup. Embedded-database results are
not a claim of multi-connection PostgreSQL or Docker validation.

Live model factual accuracy, unsupported-claim rate, latency and cost are not yet
measured. The UI records token usage and estimates cost when real calls run;
manual evaluation exports preserve unreviewed scores as null. No account key was
requested, supplied or used during package preparation.
