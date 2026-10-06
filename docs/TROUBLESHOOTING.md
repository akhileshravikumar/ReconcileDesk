# Windows troubleshooting

## Docker cannot connect

Start Docker Desktop and wait until its engine is ready. Run:

```powershell
docker info --format '{{.OSType}}'
```

It must report `linux`. Share the exact error if it does not. Do not reinstall
Docker or change WSL settings without first inspecting the failure.

## npm.ps1 cannot execute

Use `npm.cmd` and `npx.cmd` as shown in the guide. No PowerShell execution-policy
change is needed. Open a new terminal if an installed command is not found.

## Port already in use

Change the relevant `WEB_PORT`, `API_PORT` or `AI_PORT` value in `.env`, then run
the Compose startup command again. Open the new port in your browser. If API_PORT
changes, update the local Vite proxy for frontend hot reload; the Docker Nginx
proxy continues to use the unchanged internal port.

## Startup or migration failure

```powershell
docker compose ps --all
docker compose logs --tail 100 migrate postgres api worker ai
```

The migration must exit with code 0. Share the output before continuing. Never
mark an unapplied migration as applied or delete data to force readiness.

## Password changes after the first start

PostgreSQL initialization credentials apply when its data volume is first
created. Editing `.env` does not change a password inside an existing database.
Keep the initial local password for this milestone; ask for a migration plan if
you need to change it. This avoids accidental data loss.

## Dependency or image download failure

Check internet access and the exact registry error. Do not use `--force`, disable
TLS checks, or delete the lockfile to work around an unexplained installation
failure. The lockfile is part of the reproducible build.

## Browser says services are unavailable

Click Refresh checks after startup finishes. Inspect `/api/ready` and the Compose
logs. A stopped worker can remain visible as connected for up to its 15-second
heartbeat expiry; use the real queue smoke test to verify execution.

## Optional scripts blocked by policy

Run the individual PowerShell commands in README.md. They perform the same
operations without requiring script execution to be enabled.

## Login fails after Milestone 4

Run the demo seed command from MILESTONE_4.md after migration. Existing passwords
are not printed again; use the explicit reset command if you did not save them.
Ten login attempts for one email within 15 minutes trigger a cooldown. Wait for
the cooldown instead of repeatedly retrying. Use the generated operator account
for the data verification script; a viewer correctly receives 403 for writes.

## HTTP 401, 403 or 409

401 means sign in again. 403 on a mutation means viewer access, missing/invalid
CSRF, or an origin outside the configured localhost list. Use the application
login form and the provided authenticated verifier. If you changed WEB_PORT,
rebuild/restart Compose so AUTH_ORIGINS updates. 409 during an investigation
edit means reload the case before saving; another edit changed its version.

## PowerShell blocks Verify-Data.ps1

Open scripts/Verify-Data.ps1 in Cursor and paste its commands into your existing
PowerShell terminal. Run from C:\PROJECTS\ReconcileDesk and omit the Set-Location
line referring to $PSScriptRoot, which only exists when running a script.
Do not put the password directly into a command; retain the Get-Credential prompt.
