# ReconcileDesk working agreement

Current stage: milestone 5, private AI summaries and evaluation.
Read docs/MILESTONE_5.md and docs/AI_DESIGN.md for approved AI and budget rules.
Read docs/MILESTONE_4.md for the approved access and workflow rules.
Read docs/CSV_CONTRACT.md for the approved financial rules and representation.

- Inspect the existing tree and relevant files before adding or changing files.
- Work on the requested milestone only. Ask before changing architecture,
  financial rules, hosting providers, authentication strategy, or scope.
- Preserve existing Git history. Never overwrite unrelated user changes.
- Use PowerShell-compatible commands in Windows instructions; use npm.cmd.
- Use integer paise for INR. Never use floating-point arithmetic for money.
- Financial matching must be deterministic. AI cannot write financial records.
- Keep keys on the server and out of Git, logs, frontend bundles, and fixtures.
- No claims of authentication, reconciliation, deployment, or AI capability
  until that capability is implemented and tested.
- Report measured results separately from planned or hypothetical outcomes.
- For this milestone run npm run check, Python tests, Playwright tests,
  and the Docker smoke test when the environment permits it.
- Do not install additional frameworks or change pinned major versions
  without explaining the need first.

- Require authenticated reads and operator permissions plus CSRF for business writes.
- Keep investigation decisions separate from financial classification.
- Audit state changes in the same transaction; never expose credential hashes.

- GPT-4.1 mini and a $1 lifetime application budget are explicitly approved.
- Never make paid calls in automated tests, CI, fixtures or offline evaluation.
- Preserve spending reservations across failures and restarts; do not reset the budget.
- No automatic paid retries, public access, or financial writes from AI.
- Price/model changes require review and user approval. Do not silently raise the cap.
