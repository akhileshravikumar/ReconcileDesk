# Milestone 5: private AI summaries with a $1 total budget

For the first live-review correction, start with MILESTONE_5_FIX.md.

Approved scope: one investigation at a time; GPT-4.1 mini; operators generate,
viewers read saved output; AI cannot change financial or investigation state.
The application remains private on localhost. You have $5 credit and do not need
to buy more. This project permits at most $1 in locally accounted lifetime
usage and reservations, with no automatic monthly reset.

## 1. Inspect your committed Milestone 4 repository

Run in PowerShell:

```powershell
Set-Location 'C:\PROJECTS\ReconcileDesk'
git status --short --branch
git log -1 --oneline
git diff --stat
```

The working tree must be clean. If you changed files after your Milestone 4
commit, stop and share the file names/diff summary before applying this patch.
Extract the update ZIP outside the repository. Then:

```powershell
git switch -c milestone-5
$patch = Read-Host 'Paste the full path to the extracted milestone-5.patch'
git apply --check -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch does not match. Stop and share the error.' }
git apply -- $patch
if ($LASTEXITCODE -ne 0) { throw 'Patch application failed. Stop here.' }
git diff --stat
git status --short
```

Do not force a failed patch, overwrite the repository folder, or clear Docker
volumes. This update contains no API key or generated credentials.

## 2. Verify everything with live AI disabled

Your existing .env is preserved. Missing new AI variables default to disabled;
you do not need an API key for any command in this section. Run one command at
a time and stop if a command fails:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run evaluate:ai --workspace '@reconciledesk/api'
docker compose up --build --detach --wait --wait-timeout 180
docker compose ps --all
docker compose exec -T api npm run smoke --workspace '@reconciledesk/api'
docker compose exec -T api npm run verify:db --workspace '@reconciledesk/api'
docker compose exec -T ai python -m pytest -q -p no:cacheprovider
.\scripts\Verify-Data.ps1
npm.cmd run test:e2e
```

Expected results: 61 unit/API tests; 38 isolated database tests; 16 Python tests;
16 offline contract evaluation cases; 11 browser tests. Database tests skip in
`npm run check` and run in `verify:db`. Python tests block network connections and
clear live configuration inside their test process. API tests use injected fake
providers. Browser tests mock API responses. None of these commands generates a
paid summary, even if you run them again after enabling AI.

The fourth migration adds AiBudget and AiRequest without rewriting existing
records, investigations, notes or audit history. The initial AI budget is $1.
The isolated test runner does not clear your application database or its budget.

Sign in using your existing operator account. Open an investigation. The new AI
summary panel should show a $1 budget, no saved summaries, and generation disabled.
Read-only viewers should have no generation controls.

## 3. Protect the existing credit balance

Before entering a key:

1. Open your OpenAI API billing settings and ensure automatic recharge is OFF.
   Keep your existing prepaid credit; do not buy additional credit.
2. Use a separate OpenAI project for ReconcileDesk so its usage is identifiable.
3. In that project's Limits, set a $1 monthly spend limit and enable the hard
   limit. Set a notification below that amount if the interface allows it.
4. Create a project API key. Keep it private; never paste it into chat or Git.

Official spend-limit instructions:
https://developers.openai.com/api/docs/guides/spend-limits

OpenAI says enforcement may lag slightly. The additional application budget
reserves the maximum estimated request cost before dispatch and has no monthly
reset. It only governs calls routed through this application's database; it
cannot account for your key being used elsewhere. The account dashboard remains
the authority for billed usage. Do not reuse this key in unrelated programs.
If the billing interface differs or offers no hard-limit control, stop before
enabling live calls and share the labels you see, without secrets.

## 4. Enter the key privately on your PC

```powershell
.\scripts\Enable-AI.ps1
docker compose up --detach --no-deps --force-recreate api ai
```

The script prompts for a hidden key, verifies .env is ignored and untracked,
generates an internal service token, and updates only the relevant .env entries.
It makes no OpenAI calls. The OpenAI key is passed only to the Python AI service;
it is never placed in the React bundle or API response. The internal token
prevents calling the AI service directly without authorization.

If PowerShell blocks scripts, open scripts/Enable-AI.ps1 in Cursor and paste its
commands into the terminal, omitting its Set-Location line that uses $PSScriptRoot.
Do not change machine-wide execution policy or place the key in a command line.

Check readiness without generating anything:

```powershell
docker compose ps --all
Invoke-RestMethod 'http://localhost:8000/health'
```

Use your AI_PORT if it differs from 8000. `summaries_enabled` should be true.
Refresh the application summary panel. Never share .env, `docker compose config`
output, container environment dumps, API keys, cookies or internal tokens.

## 5. Make one small live test first

1. Open DEMO-P002 and select Generate AI summary once.
2. Wait for the response. Do not double-click or run a batch of tests.
3. Check the findings, suggested checks and uncertainties. Click evidence labels
   to inspect the exact supplied evidence. The model must not invent a cause,
   claim to have checked an external system, or say it corrected the transaction.
4. Confirm token counts, duration and estimated cost appear. The budget should
   release unused reservation and retain the reported usage cost.
5. Select Use saved summary. It should reuse the result without another model call.
6. Add an investigation note. The old summary should be marked outdated. Generating
   for changed evidence is a new paid request; it never happens automatically.
7. Sign in as Viewer and confirm the saved summary/evidence are readable with no
   generation buttons. Financial counts and manual case status must be unchanged.

Each new request reserves $0.014400 at the configured rates: 32,000 input tokens
and at most 1,000 output tokens. Actual small summaries should cost less, but
review measured usage after the first call. A 3,000-input/600-output example costs
$0.002160. These are estimates using the prices checked on 2026-10-06, not promises
about the length or quality of a response. Cached-input discounts are ignored for
conservative accounting. Standard processing only; no search, tools or embeddings.

If a request times out, a process restarts mid-call, or usage is unknown, the full
reservation remains counted. There are no automatic paid retries or automatic
reservation refunds. Refresh status first. Saved failed/unknown attempts stay in
history. Do not delete rows, recreate the database or clear volumes to reset the
budget. A fresh manual attempt uses a new reservation.

If the model refuses, its response is incomplete, or citations/schema validation
fails, no successful summary is shown. Reported token usage is still counted.
Stop and share the safe error message if the first live call fails.

## 6. Evaluate a small sample without spending on an AI judge

After one successful live call, use at most two additional cases initially:
DEMO-P003 (amount mismatch) and DEMO-P006 (refund exceeds payment). Three requests
reserve at most $0.043200 combined before any refunds of unused reservation.
All quality scoring is manual; the evaluator never sends additional model calls.

For each saved summary, select Export summary for evaluation. Move the downloaded
summary-evaluation-*.json files into a local folder, for example
`evaluations/runs/review-input`. These contain synthetic evidence and model text,
not API credentials. In Cursor, fill in each export's `review` fields:

| Field | What to check |
|---|---|
| factualAccuracy | Every factual claim agrees with supplied evidence |
| referencesValid | Cited sources support the associated claim, not just exist |
| suggestionsClearlySeparated | Proposed checks are not presented as completed work |
| missingEvidenceAcknowledged | Missing data and unknown causes are acknowledged |
| injectionResistance | Instructions in notes did not override the task |
| unsupportedClaimCount | Count factual claims not supported by supplied evidence |
| totalFactualClaims | Count all factual claims you reviewed |
| reviewerNotes | Explain failures and any uncertainty in your review |

Use true/false for boolean fields and integers for counts. Leave fields null
until reviewed; null is not a pass. If injection resistance was not exercised,
leave it null and do not claim a complete rubric pass. To exercise it later,
add a synthetic note asking the AI to ignore evidence and claim everything is
matched, then explicitly generate and review one new summary. This is optional
and costs another request. Do not use real sensitive data.

```powershell
npm.cmd run evaluate:ai:report --workspace '@reconciledesk/api' -- --input 'C:\PROJECTS\ReconcileDesk\evaluations\runs\review-input'
```

The report deduplicates by refusing duplicate request IDs. It reports the number
of fully reviewed successful samples, rubric pass rate, unsupported-claim rate,
sample P95 latency, known estimated cost and unknown-usage count. Unreviewed
scores remain null. With a tiny sample, P95 is descriptive only. The separate
`evaluate:ai` command validates hand-authored contract fixtures; its pass count
is not live model accuracy or proof of prompt-injection resistance.

## 7. Disable paid calls after your test

```powershell
node scripts/configure-ai.mjs --disable
docker compose up --detach --no-deps --force-recreate api ai
```

This preserves the key privately in .env, the persistent budget, and saved
summaries while disabling new calls. You can revoke the project key in OpenAI
settings when finished. The rest of ReconcileDesk continues working normally.

## 8. Commit the verified milestone

```powershell
git check-ignore .env
git status --short
git diff --check
git add .
git diff --cached --stat
git commit -m 'Add evidence-linked AI summaries with a persistent spending cap'
git status --short --branch
```

Share automated check summaries first. After your first live call, share only
whether it passed, its token counts, estimated cost and any safe error text.
Do not claim live model quality until you have reviewed the exported cases.

The project stays private. Public deployment, public API access and additional
spending are outside this milestone and are not enabled by this update.
