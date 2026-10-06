# ReconcileDesk

Payment reconciliation and exception-management portfolio project.
This release is **milestone 2: the local service foundation**. It does not yet
import financial records, authenticate users, reconcile payments, or call OpenAI.
No sample performance numbers are represented as measured results.

## Start here on Windows

Your existing repository at `C:\PROJECTS\ReconcileDesk` is preserved. The ZIP
contains no `.git` directory. Extract its contents into that folder, not into a
nested `reconciledesk-milestone-2` folder. Follow the guarded extraction commands
provided with the download before running these steps.

Open the folder in Cursor. Use **Terminal > New Terminal > PowerShell**.
Start Docker Desktop in Linux-container mode. Each command below is separate:
stop at the first failure and share its output.

```powershell
Set-Location -LiteralPath 'C:\PROJECTS\ReconcileDesk'
Get-ChildItem -Force | Select-Object Mode, Name
git status --short --branch
docker info --format '{{.OSType}}'
```

The Docker command must report `linux`. Then:

```powershell
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
npm.cmd ci
npm.cmd run check
docker compose config --quiet
docker compose up --build --detach --wait --wait-timeout 180
docker compose ps --all
```

The first install/build needs internet access to npm, PyPI, and Docker image
registries. It may take several minutes. `migrate` exiting with code 0 is normal;
it is a one-off migration job. It must not exit with a nonzero code.

Open **http://localhost:8080**. All four service cards should say **Connected**.
The API is at http://localhost:4000/api/health and the Python service at
http://localhost:8000/health. Database and Redis ports are not exposed to Windows.
All published application ports are bound to localhost. This Compose setup is
for local development, not public hosting.

## Verify this milestone

```powershell
docker compose exec -T api npm run smoke --workspace '@reconciledesk/api'
docker compose exec -T ai python -m pytest -q -p no:cacheprovider
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

`npm run check` already checks generation, lint, types, API tests and builds.
The smoke command checks PostgreSQL migration state, Redis, the worker heartbeat,
the Python service, and a real BullMQ job round trip. The Playwright tests use
mocked API responses to test the UI independently; they do not replace the live
smoke test.

Expected smoke output:

```text
PASS database
PASS redis
PASS worker
PASS aiService
PASS queue round trip
Milestone 2 smoke checks passed.
```

Send the smoke output, test summaries, and any errors back before milestone 3.

## Record the verified foundation in Git

Do not run `git init`: a repository already exists. Do not overwrite its branch
or history. After checks pass, inspect and commit the new files:

```powershell
git status --short --branch
git check-ignore .env
git add .
git diff --cached --stat
git diff --cached --name-only
git commit -m "chore: add ReconcileDesk service foundation"
```

Confirm `.env`, `node_modules`, and generated Prisma code do not appear in the
staged file list. If Git requests an identity, configure your real name and
preferred Git email **for this repository**, then retry the commit:

```powershell
git config user.name "YOUR NAME"
git config user.email "YOUR GIT EMAIL"
```

No GitHub remote is created or pushed by the package. We will handle that once
you choose the remote and repository visibility.

## File map

| Location | Purpose |
|---|---|
| `apps/web/src/` | React workspace and live connectivity cards |
| `apps/api/src/app.ts` | Express liveness/readiness routes |
| `apps/api/src/server.ts` | Dependency wiring and shutdown |
| `apps/api/src/worker.ts` | BullMQ diagnostic worker and heartbeat |
| `apps/api/src/smoke.ts` | Live dependency and queue checks |
| `apps/api/prisma/` | Prisma schema and initial SQL migration |
| `apps/api/tests/` | API failure-path and configuration tests |
| `services/ai/` | FastAPI skeleton and Python tests |
| `tests/e2e/` | Browser checks with controlled API responses |
| `infra/nginx.conf` | Frontend hosting and same-origin API proxy |
| `compose.yaml` | Local services, dependency ordering, persistent volumes |
| `.github/workflows/ci.yml` | Checks, builds, browser tests and Docker smoke CI |
| `.cursor/rules/project.mdc` | Automatically applied Cursor project guidance |
| `AGENTS.md` | Project constraints and review expectations |
| `docs/` | Architecture, milestone plan, troubleshooting and validation notes |
| `data/` | Financial fixtures planned for milestone 3 |
| `metrics/` | Empty performance-report template |
| `evaluations/` | Empty AI-evaluation template |

## Development loop

For React changes with hot reload, leave Docker running and run:

```powershell
npm.cmd run dev:web
```

Open http://localhost:5173. Vite proxies `/api` to the API on port 4000.
For changes to API, worker, Python, Docker configuration, or the packaged UI:

```powershell
docker compose up --build --detach --wait --wait-timeout 180
```

The Node image intentionally retains development dependencies in this foundation
release so checks can run locally. Later deployment work will choose the host,
runtime image, authentication, secrets, and operational limits explicitly.

## Stop and inspect

```powershell
docker compose logs --tail 80 api worker ai migrate
docker compose down
```

Normal `down` preserves named data volumes. Do not delete volumes to resolve an
error without first checking the cause. See `docs/TROUBLESHOOTING.md`.

## Cursor task example

Use this as your first bounded request after verification:

> Read AGENTS.md, docs/MILESTONES.md, and the existing source tree. Explain how
> the readiness endpoint and queue smoke test work. Do not edit files. Identify
> the product decisions we need before adding the milestone 3 financial schema.

The `.ps1` scripts are optional wrappers for the documented commands. You can
use the inline commands if your PowerShell policy does not allow local scripts;
no execution-policy change is required.
