# Milestone 5 correction: findings from the first live evaluation

Your Windows results passed: 51 unit/API tests, 36 database tests, 15 Python
tests, 11 browser tests, 13 offline cases and authenticated data verification.
The three uploaded live exports succeeded with $0.002 total estimated usage.
This correction addresses the observed output errors before closing Milestone 5.

## What changes

- Prompt version case-summary-v2 requires supplied integer paise, payment-versus-
  gross matching, and no invented attribution to an empty limitations list.
- API validation rejects common rupee conversions, numeric paise amounts absent
  from cited authoritative *Paise fields, unsupported limitation wording, and
  net-settlement wording for AMOUNT_MISMATCH without SETTLEMENT_ARITHMETIC.
- Unverified notes cannot establish accepted financial amounts.
- Three preserved v1 outputs become offline regression fixtures. P006 remains
  accepted; the observed P002 and P003 outputs are rejected under v2 rules.
- Older summaries stay visible with a warning when evidence or summary rules
  change. No automatic replacement, paid retry or budget reset occurs.

These are conservative checks for the observed failures, not a general factual
accuracy proof. A value existing in a cited record does not prove correct field
attribution or causal interpretation. Human review remains necessary. Changes
to model, pricing, $1 cap, database schema or financial matching are not needed.

## 1. Inspect and save your baseline

In PowerShell:

```powershell
Set-Location 'C:\PROJECTS\ReconcileDesk'
git status --short --branch
git diff --stat
git log -1 --oneline
```

If the verified Milestone 5 source is not committed, review and commit those
intended files first. Inspect staged files; keep .env untracked. Preserve your
review folder and original exports as the v1 evaluation baseline. You do not
need to delete or replace them to apply this patch.

```powershell
git check-ignore .env
git add .
git diff --cached --stat
git commit -m 'Implement and verify initial AI summaries'
```

Skip that commit block if you already committed Milestone 5. Then extract the
correction ZIP outside the repository and run:

```powershell
git switch -c milestone-5-summary-fix
$patch = Read-Host 'Full path to the extracted milestone-5-summary-fix.patch'
git apply --check -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch does not match. Stop and share the error.' }
git apply -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch failed. Stop here.' }
git diff --stat
```

A failed check may mean Cursor changed a touched source file. Do not force the
patch, overwrite changed files, or reset Git. Share the error and changed paths.

## 2. Verify without paid calls

Run commands one at a time, stopping on failure:

```powershell
npm.cmd run check
npm.cmd run evaluate:ai --workspace '@reconciledesk/api'
docker compose up --build --detach --wait --wait-timeout 180
docker compose exec -T api npm run verify:db --workspace '@reconciledesk/api'
docker compose exec -T ai python -m pytest -q -p no:cacheprovider
npm.cmd run test:e2e
```

Expected: 61 unit/API tests, 38 database tests, 16 Python tests, 16 offline cases
and 11 browser tests. The default Node command skips the 38 database tests;
verify:db runs them separately. No tests call OpenAI. No dependency or schema
migration is added by this correction.

In the UI, old v1 summaries should still be present with an outdated warning.
The budget should retain all previously recorded usage and reservations. Do not
expect exactly $0.002 spent if you made other requests beyond the three exports.

## 3. Retest only the two affected cases

After the free checks pass, explicitly generate once each for DEMO-P002 and
DEMO-P003. If live AI was disabled after your earlier test, use Enable-AI.ps1 and
recreate api/ai as documented in MILESTONE_5.md. Otherwise no key change is needed.
The new prompt version prevents the old saved output from being reused as current.
Two calls reserve at most $0.028800 at the configured rates; actual usage is
recorded normally. Do not repeatedly regenerate to obtain a passing sample.

- P002: expect 20000 paise, no invented claim about declared limitations, and no
  assumption that RESOLVED means the missing settlement was financially corrected.
- P003: expect payment 30000 paise versus gross settlement 29000 paise. The normal
  fee/net relationship must not be presented as the mismatch or an unexplained gap.
- Stop if the response is REJECTED/UNKNOWN and share the safe error. A rejection
  is a visible validation failure, not a passing live-quality result.

Export the two new summaries into a separate review-v2 folder. Preserve v1 exports.
Compare the actual output with the evidence and review the same rubric. Leave
injectionResistance null unless an adversarial note was actually tested. You do
not need to rerun P006 merely because its old prompt version is marked outdated.

After the small live test, disable paid calls again:

```powershell
node scripts/configure-ai.mjs --disable
docker compose up --detach --no-deps --force-recreate api ai
```

## 4. Commit the correction after verification

```powershell
git diff --check
git status --short
git add .
git diff --cached --stat
git commit -m 'Constrain AI monetary wording and add live-output regressions'
git status --short --branch
```

Share updated test summaries and the two v2 exports. Never share keys or .env.
