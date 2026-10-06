# Milestone 4: authentication, investigations and audit

This update extends the verified Milestone 3 source. It does not require a new
repository or resetting Docker volumes. Stop after verifying this milestone.

## 1. Inspect and preserve your current work

In PowerShell:

```powershell
Set-Location 'C:\PROJECTS\ReconcileDesk'
git status --short --branch
git diff --stat
git log -1 --oneline
```

If Milestone 3 is not committed, review `git diff`, then commit the intended
project changes. `git check-ignore .env` must print `.env` before staging.
Do not stage unrelated changes or credential files.

```powershell
git check-ignore .env
git add .
git diff --cached --stat
git commit -m 'Implement CSV imports and deterministic reconciliation'
```

Skip that commit block if Milestone 3 is already committed. Continue only with
a clean working tree. Extract the update ZIP outside the repository. Set `$patch`
to the actual extracted patch path. Do not copy the package over the repository.

```powershell
git switch -c milestone-4
$patch = Read-Host 'Paste the full path to the extracted milestone-4.patch'
git apply --check -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch does not match. Stop and share the error.' }
git apply -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch application failed. Stop here.' }
git diff --stat
git status --short
```

Never force a failed patch or use `git reset --hard`. This patch checks existing
file content and applies changes plus new files; it preserves your Git history.

## 2. Build and migrate

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed.' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Node checks failed.' }
docker compose up --build --detach --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed. Inspect docker compose logs.' }
docker compose ps --all
```

The third migration adds users, sessions, investigations, notes and audit tables.
It opens investigations for exceptions in the latest existing snapshot. With your
verified demo including the late settlement, expect eight open investigations.
It changes no accepted financial records or historical reconciliation findings.
The migration container should exit with code 0; the application services should
be running. Do not use `docker compose down -v`.

## 3. Create accounts and sign in

```powershell
docker compose exec -T api npm run seed:demo --workspace '@reconciledesk/api'
```

Save the displayed generated passwords privately. Do not paste them into chat,
commit them, or include them in screenshots. The accounts are:

| Email | Role |
|---|---|
| viewer@reconciledesk.local | Viewer |
| operator.one@reconciledesk.local | Operator |
| operator.two@reconciledesk.local | Operator |

Open http://localhost:8080 and sign in as Operator One. There is no public signup.
Rerunning the seed command preserves existing passwords. If lost, explicitly
reset all three demo passwords and revoke their existing sessions:

```powershell
docker compose exec -T api npm run seed:demo --workspace '@reconciledesk/api' -- --reset-passwords
```

## 4. Automated verification

```powershell
docker compose exec -T api npm run smoke --workspace '@reconciledesk/api'
docker compose exec -T api npm run verify:db --workspace '@reconciledesk/api'
.\scripts\Verify-Data.ps1
npm.cmd run test:e2e
```

Run one command at a time; stop on a failure. `verify:db` creates an isolated
throwaway database, runs 21 tests, and removes only that test database. Its
fixtures never clear the application database. `Verify-Data.ps1` prompts for the
operator password privately and passes credentials on stdin. It verifies the
same demo imports, five concurrent repeat uploads, snapshot reuse and late
settlement behavior through authenticated HTTP requests. It signs out afterward.
Use this script instead of the old unauthenticated `verify:data` command.

Expect 44 unit/API tests in `npm run check`; the 21 database tests skip there
and run through `verify:db`. Expect seven browser tests. Browser tests mock HTTP
responses; the live checks and manual workflow below cover the deployed app.
If Chromium is missing, run `npx.cmd playwright install chromium`, then retry.
The FastAPI service is unchanged; its two tests previously passed on your PC.

## 5. Verify the workflow in your browser

1. As Operator One, open DEMO-P002 in Investigations. Assign it to Operator Two.
2. Add an investigation note, then select Start investigation.
3. Confirm Resolve investigation is disabled until you enter a resolution note.
4. Enter the note and resolve. Check audit history for actor, timestamp and changes.
5. Confirm the latest financial finding still says EXCEPTION / MISSING_SETTLEMENT.
   The overall financial exception count remains eight; manual resolution only
   changes investigation status.
6. Sign out. Sign in as Operator Two and reopen that investigation. Both operators
   can act regardless of assignment; assignment tracks responsibility.
7. Sign out and sign in as Viewer. Reports, notes and audit history are readable;
   upload, reconciliation, assignment and workflow writes are unavailable.
8. Sign out. Refresh and confirm the login form appears.
9. Optional concurrency check: open one investigation in two tabs as an operator.
   Save a note in the first, then try saving from the second without reloading.
   Expect a conflict message; Reload investigation before trying again.

Approved transitions: OPEN -> IN_PROGRESS -> RESOLVED; RESOLVED -> OPEN.
New snapshots preserve manual investigation state. If a later settlement clears a
financial exception, its existing investigation remains available for review.
Audit and note history have no edit/delete controls.

## 6. Commit after verification

```powershell
git status --short
git diff --check
git add .
git diff --cached --stat
git commit -m 'Add sessions, role permissions, investigations and audit history'
git status --short --branch
```

Share check summaries, `verify:db` results, authenticated data verification,
browser test output, and whether the manual workflow behaves as described.
Never share passwords, cookies, CSRF tokens or `.env` contents.

## Files and next milestone

`auth.ts` owns sign-in, session checks, throttling and CSRF. `investigations.ts`
owns case state and optimistic version checks. `audit.ts` centralizes event
creation. `seed-demo.ts` creates local accounts. React's `App.tsx` handles login;
`Workspace.tsx` retains the financial dashboard; `InvestigationDesk.tsx` handles
cases and audit views. `auth.integration.test.ts` contains the 15 new database
security/workflow tests. Existing six persistence tests remain in place.

Milestone 5 will add OpenAI summaries and evaluation after we verify this update
and agree on model, budget, summary contents and evaluation criteria. Existing
metrics and AI evaluation placeholders remain available; no model calls occur
in Milestone 4.
