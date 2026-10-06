# Guided implementation checkpoints

| Milestone | Scope | Gate |
|---|---|---|
| 1 | Windows, Cursor, tools, folder inspection | Environment output reviewed |
| 2 — current | Local service foundation | Checks and queue smoke test pass on Windows |
| 3 | Synthetic data, schema, validated imports, matching | Independent expected results; retries create no duplicates |
| 4 | Authentication, roles, exception workflow, audit | Authorization and state-transition tests |
| 5 | OpenAI summaries, evaluation, failure handling | Held-out evidence-based rubric; no AI financial writes |
| 6 | Benchmarks, deployment, demo and portfolio | Measured reports and reproducible demonstration |

## Confirm before milestone 3

1. Can a payment have multiple or partial settlements? The initial scope approved
   exact matching but did not yet define payment-to-settlement cardinality.
2. Are settlement CSV amounts gross transaction amounts or net amounts after fees?
3. How are refunds represented, and are partial/multiple refunds in scope?
4. Are duplicate references invalid rows, quarantined records, or exceptions?
5. Does a file with invalid rows fail entirely or accept valid rows with a report?

Propose concrete sample CSVs and expected classifications for approval before
writing the financial schema or dataset generator. Do not try to resolve these
with an LLM. These are deterministic product rules.

## Decisions that remain open

- Public hosting: the user wants free hosting; external services and sleeping
  instances have not yet been approved. No cloud services are provisioned.
- Authentication mechanism and demo-user access.
- OpenAI model and per-request budget.
- GitHub repository visibility and remote URL.
