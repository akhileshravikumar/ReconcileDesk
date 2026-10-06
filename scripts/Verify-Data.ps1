$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
$credential = Get-Credential -UserName 'operator.one@reconciledesk.local' -Message 'Enter the generated demo operator password'
if ($null -eq $credential) { throw 'Credentials are required.' }
try {
    $payload = @{ email = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
    $payload | docker compose exec -T api node apps/api/dist/verify-data.js
    if ($LASTEXITCODE -ne 0) { throw 'Authenticated data verification failed.' }
} finally {
    $payload = $null
    $credential = $null
}
