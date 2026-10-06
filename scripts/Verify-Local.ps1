$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)

docker compose exec -T api npm run smoke --workspace '@reconciledesk/api'
if ($LASTEXITCODE -ne 0) { throw 'Dependency or queue smoke check failed.' }
docker compose exec -T ai python -m pytest -q -p no:cacheprovider
if ($LASTEXITCODE -ne 0) { throw 'Python service tests failed.' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Node checks failed.' }
Write-Host 'Core milestone checks passed. See README.md for browser tests.'
