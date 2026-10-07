$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
git check-ignore -q .env
if ($LASTEXITCODE -ne 0) { throw '.env must be ignored by Git before entering a key.' }
$tracked = @(git ls-files -- .env)
if ($tracked.Count -gt 0) { throw '.env is tracked. Stop and remove the secret file from tracking before proceeding.' }
$secret = Read-Host 'Paste your OpenAI API key (hidden; never send it in chat)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | node scripts/configure-ai.mjs
    if ($LASTEXITCODE -ne 0) { throw 'AI setup failed. No OpenAI request was made.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secret.Dispose()
}
