# Milestone 3 — imports and reconciliation

Apply the update to the clean Milestone 2 repository. Extract the update ZIP
outside `C:\PROJECTS\ReconcileDesk`. Its patch does not modify `.git`, `.env` or
database volumes. In PowerShell, run each command separately and stop on error.

```powershell
Set-Location -LiteralPath 'C:\PROJECTS\ReconcileDesk'
git status --short
```

Status must be empty. Then:

```powershell
git switch -c milestone-3
$patch = Read-Host 'Full path to milestone-3.patch, without surrounding quotes'
git apply --check $patch
```

Only after the check succeeds:

```powershell
git apply $patch
git diff --stat
npm.cmd ci
npm.cmd run check
docker compose up --build --detach --wait --wait-timeout 180
```

The additive migration preserves existing volumes. The migration container
must exit with code 0. Do not reset migrations or delete volumes.

## Verification

```powershell
docker compose ps --all
docker compose exec -T api npm run smoke --workspace '@reconciledesk/api'
docker compose exec -T api npm run verify:db --workspace '@reconciledesk/api'
docker compose exec -T api npm run verify:data --workspace '@reconciledesk/api'
npm.cmd run test:e2e
```

- `smoke` checks real dependencies and a queue round trip.
- `verify:db` creates a uniquely named temporary test database, applies both
  migrations, runs six transaction tests and removes only that database. It
  does not clear application data. It requires the local PostgreSQL user's
  CREATE DATABASE permission; it is not intended for a public host.
- `verify:data` loads the synthetic demo, checks import accounting, repeats an
  upload five times concurrently, checks every classification and imports a
  late settlement. It never deletes data. Run it before adding unrelated data;
  it can be repeated against the same demo dataset.
- Browser tests cover four UI scenarios using controlled API responses, separate
  from the live checks above.

`npm run check` normally reports 38 passed and 6 skipped. Those six database
tests are run explicitly by `verify:db`, not counted as passed while skipped.

## Expected demo

| Stage | Payments | Settlements | Refunds | Matched groups | Exception groups |
|---|---:|---:|---:|---:|---:|
| Three base files | 9 | 9 | 5 | 2 | 9 |
| After late settlement | 9 | 10 | 5 | 3 | 8 |

Payment CSV: 13 rows, comprising 9 accepted, 1 duplicate, 2 rejected and
1 quarantined. There are 11 reference groups, including two orphan references.
Group counts therefore differ from payment counts.

The live command reports passes for three import types, concurrent repeated
uploads, unchanged-snapshot reuse, all 11 classifications and late settlement
handling, ending with `Milestone 3 data verification passed.`

## Interface walkthrough

Refresh http://localhost:8080. Milestone 3 includes an upload form, record counts,
import reports, reconciliation results and an exception filter.

After `verify:data`, the dashboard should show 9 payments, 10 settlements,
5 refunds, 3 matched groups and 8 exception groups. Uploading
`data/demo/payments.csv` again should reuse its completed batch. Open View rows
to inspect rejection and quarantine reasons. Reconcile again to reuse the
unchanged snapshot, then toggle Show exceptions only.

To observe the initial two-match snapshot, upload the three base CSVs manually
and reconcile before the verification command or late file. Do not reset data
just to replay that order. Snapshots preserve history.

## Dataset generation and evaluation

```powershell
npm.cmd run fixtures --workspace '@reconciledesk/api' -- --count 10000 --seed 42
npm.cmd run evaluate --workspace '@reconciledesk/api'
```

Generated files appear in `data/generated/seed-42-10000` and are Git-ignored.
Do not upload benchmark files until demo verification is complete, since they
change global counts. Evaluation writes a report under `metrics/runs`, also
ignored. Its five-run benchmark measures in-process CSV parsing, duplicate
classification and matching, excluding HTTP, Redis, PostgreSQL and Docker.
Do not describe that number as full application ingestion performance.

## Commit after verification

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached --name-only
git commit -m "feat: add CSV imports and deterministic reconciliation"
```

Ensure `.env`, `node_modules`, generated Prisma code, generated benchmark files
and local metric runs are absent from the staged list. Send verification and
browser-test summaries before starting Milestone 4.

## Troubleshooting

- Startup failure: `docker compose logs --tail 100 migrate api worker`.
- Imports remain QUEUED: inspect worker/Redis logs. Durable PostgreSQL batches
  are redispatched after connectivity returns.
- FAILED batch: inspect the cause, then use Retry. Partial financial writes
  are rolled back.
- Old UI: refresh after the web image rebuild. Docker is port 8080; Vite
  development is port 5173.
- Patch check fails: share its output and Git status. Do not force the patch
  or discard local changes.
