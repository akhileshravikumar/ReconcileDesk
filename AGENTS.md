# ReconcileDesk working agreement

Current stage: milestone 3, CSV imports and deterministic reconciliation.
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
