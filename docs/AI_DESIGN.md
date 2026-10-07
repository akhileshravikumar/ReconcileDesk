# AI summary design and accounting

## Request path

React -> authenticated Express API -> internal-token-protected FastAPI -> OpenAI
Responses API. GPT-4.1 mini is the sole allowed model. Python uses the existing
httpx dependency with redirects and automatic retries disabled. No new framework,
SDK, model weights, vector store, agent tools, embeddings or paid judging service.
The OpenAI key is available only to the Python service.

The API allows operators to generate; viewers may read. Existing session, origin
and CSRF middleware protects writes. The Python route also requires an internal
secret; health remains public. There is no browser-side call to OpenAI.

## Evidence and output

The API constructs evidence from the latest deterministic finding, up to 20
accepted records and the five latest notes. Notes are explicitly unverified.
A source hash includes model, prompt version, case version and context. Newly
imported financial changes must be reconciled first; duplicate-only imports do
not invalidate a matching financial snapshot. Financial and investigation locks
keep context consistent while it is assembled. No database transaction stays
open during the provider call.

Context is capped at 12,000 UTF-8 bytes; the full Python request is capped at
24,000 bytes with a conservative 32,000 input-token reservation. Requests use
`service_tier:default`, `store:false`, no tools, no prior conversation, and `max_output_tokens:1000`.
This does not claim zero provider retention; OpenAI's applicable retention rules
still apply. Use only synthetic data.

Structured output contains findings, suggested checks and uncertainties. Each
finding/check must reference at least one supplied evidence ID. Node validates
shape, bounded text and reference membership before saving a successful result.
This verifies structure and reference integrity, not semantic truth. Human
review is required to assess factual support and resistance to malicious notes.
AI output is rendered as text, never HTML; it cannot run tools or mutate ledger,
notes, assignments, workflow or deterministic findings.

## Lifetime budget

Amounts use integer microdollars. 1 USD = 1,000,000 microdollars. At the configured
standard rates, cost = ceil((2 * input_tokens + 8 * output_tokens) / 5).
The per-call reservation is 14,400 microdollars. Cached-input discounts are
ignored, so reported estimated cost can be higher than billed cost.

AiBudget holds a $1 lifetime cap, spentMicros and reservedMicros. A SQL check
prevents negative balances, a cap above $1, or spending-plus-reservations above
the cap. The budget and new AiRequest are updated atomically under a PostgreSQL
advisory lock. All cases share the same budget. Each request has a client UUID;
repeated UUIDs reuse the persisted request and cannot dispatch a second call.
Concurrent new requests for the same case are rejected while a call is active.
An unchanged successful context is reused unless regeneration is explicit.

Known usage converts the reservation to spent plus an unused-reservation refund
in one transaction alongside the result and audit event. Refused/incomplete or
invalid outputs still count known usage. Missing/invalid usage, network errors,
and interrupted requests retain the entire reservation. After 90 seconds an
unfinished request is displayed as interrupted; no reservation is released.
The UI may allow a fresh manual attempt, which requires a new reservation.
There is no monthly reset, budget reset endpoint, automatic retry or paid CI.

This app can control only requests through its persisted budget and the configured
pricing assumptions. Never bypass it with direct provider calls, reuse its key
elsewhere, reset the database, or silently update pricing/model constants. An
OpenAI project hard limit and disabled automatic credit recharge are additional
account-level controls. Recheck official prices before changing the model or
using the app after a long gap. The account dashboard is the billing authority.

## Files

- summary-contract.ts: model, limits, prices, schema, reference validation, transport.
- summaries.ts: consistent evidence, cache, reservations, persistence and audit.
- services/ai/app/summaries.py: prompt, bounded provider payload and response parsing.
- services/ai/app/main.py: internal authentication, disabled gate and one-call dispatch.
- SummaryPanel.tsx: explicit generation, references, stale state, budget and export.
- evaluations/summary-contract-cases.json: synthetic offline validator fixtures.
- report-summary-evaluation.ts: manual-review aggregation with no API calls.

## Official sources checked 2026-10-06

- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/reference/python/resources/responses/methods/create
- https://developers.openai.com/api/docs/guides/spend-limits

## First live-review correction (case-summary-v2)

The first three reviewed live outputs cost an estimated $0.002. One attributed
an unsupported statement to an empty limitations list and converted units; another
mixed payment-versus-gross matching with a payment-versus-net gap. The v2 prompt
clarifies these rules. The API additionally checks numeric paise mentions against
cited authoritative fields, rejects common INR/rupee conversions, requires wording
mentioning limitations to equal a supplied limitation, and rejects net wording
for an amount mismatch without a separate settlement-arithmetic exception.

The numeric scanner is a targeted textual guard, not a language parser. It can
reject benign alternative phrasing and does not prove semantic truth, detect every
spelled-out number or verify all causal claims. Human review is still required.
The rule-version change invalidates reuse of old summaries without rewriting them.
Existing usage and reservations are retained. Regression replay of old output is
free and must not be reported as a new model-quality result.
