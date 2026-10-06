# Architecture — Milestone 3

React is served by Nginx, which proxies same-origin /api requests to Express.
PostgreSQL is the source of truth. The API stores a validated CSV batch as a
QUEUED row. The separate BullMQ worker dispatches pending batches into Redis
and processes them; Redis is not the only record of accepted work.

## Import transaction

1. Parse the strict CSV contract and classify invalid rows.
2. Acquire the shared PostgreSQL advisory transaction lock.
3. Check whether the batch already completed.
4. Compare identifiers and canonical fingerprints against accepted records.
5. Insert accepted records and all row outcomes in bounded SQL batches.
6. Commit counts and COMPLETED status in the same transaction.

A transaction failure leaves no partial accepted records or row outcomes.
BullMQ retries are bounded with backoff. Stalled jobs can be recovered. The
worker's dispatcher checks durable pending batches every three seconds, allowing
recovery when a database batch was saved but its Redis publication failed.
The FAILED state requires an explicit operator retry after inspecting the cause.

## Reconciliation

The API acquires the same lock, rejects requests while imports are pending,
loads accepted records and conflict references, and computes an input digest.
An existing rules-plus-digest pair reuses its run. Otherwise it persists every
result and its source counts atomically. Old snapshots are never overwritten.
Financial records remain immutable in this milestone.

## Health and limits

/api/health is liveness. /api/ready checks the migrated database marker, Redis,
the worker heartbeat and FastAPI. Heartbeat availability is not proof that a
financial job completed; smoke and verify:data exercise actual processing.
The AI service remains a foundation and performs no model calls.

Only localhost application ports are published. Database and Redis ports stay
inside Compose. No authentication exists yet. The synchronous reconciliation
engine loads the accepted dataset in memory; this is a bounded local portfolio
implementation, not a demonstrated large-scale payment platform.

Uploads are capped at 5 MiB and 25,000 records. HTTP request bodies are not logged.
Queue messages contain batch IDs, not CSV contents. Historical raw inputs and
row reports are retained for the synthetic demonstration. Retention controls,
authentication, operator audit events and hosting decisions are later work.

## Validation boundaries

Unit tests cover parsing and rules. API tests cover request/error contracts.
The dedicated database suite exercises transaction rollback and snapshot
persistence. Live Docker checks cover the real queue and services. Browser tests
use controlled responses and therefore do not substitute for live verification.

JavaScript dependencies and Python requirements are pinned. Only csv-parse was
added for this milestone. Docker image tags remain major-series tags, not
immutable digests, so rebuilds still require verification.
