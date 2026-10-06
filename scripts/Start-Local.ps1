$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path 'compose.yaml') -or -not (Test-Path 'package-lock.json')) {
    throw 'Run this script from the complete milestone package.'
}
Get-ChildItem -Force | Select-Object Mode, Name | Format-Table
docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and retry.' }
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }

npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Share the error before continuing.' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Foundation checks failed.' }
docker compose up --build --detach --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) {
    docker compose logs --tail 80
    throw 'One or more services did not become ready.'
}
Write-Host 'Open http://localhost:8080. Next run the verification commands in README.md.'
