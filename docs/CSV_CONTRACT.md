# Approved rules and CSV contract

Scope: synthetic data, INR, one organization. CSV version `csv-v1`;
reconciliation rules `exact-inr-v1`.

Use UTF-8 CSV; BOM, CRLF, quoted fields and reordered columns are supported.
Header names must match exactly, with no extra or duplicate columns. Blank
lines are ignored. Malformed quoting or invalid headers reject the whole file.
Individual invalid rows are rejected while valid rows are accepted.

Limits: 5 MiB, 25,000 data rows, 16 KiB per CSV record. Money is integer paise:
INR 100.00 is `10000`. Payments, refunds and gross amounts must be positive;
fees and net amounts may be zero. Maximum individual value is 9223372036854775807
paise. Computation uses bigint, and persistence uses PostgreSQL BIGINT.

Identifiers are case-sensitive, 1-64 characters, begin with a letter or digit,
and otherwise allow letters, digits, dots, underscores and hyphens. Whitespace
is trimmed. Dates require ISO 8601 with Z or an explicit offset and are
normalized to UTC with millisecond precision.

## Payment CSV

```csv
transaction_ref,amount_paise,currency,paid_at
DEMO-P001,10000,INR,2026-10-01T10:00:00Z
```

## Settlement CSV

```csv
settlement_ref,transaction_ref,gross_paise,fee_paise,net_paise,currency,settled_at
DEMO-S001,DEMO-P001,10000,200,9800,INR,2026-10-01T10:00:00Z
```

## Refund CSV

```csv
refund_ref,transaction_ref,amount_paise,currency,refunded_at
DEMO-R001,DEMO-P001,2500,INR,2026-10-01T11:00:00Z
```

Refund rows represent refunds against a payment. This release does not model a
separate refund-settlement feed or execute refunds.

## Import behavior

| Case | Result |
|---|---|
| New valid identifier | ACCEPTED |
| Same identifier and normalized fields | DUPLICATE; no new financial record |
| Same identifier, changed fields | QUARANTINED; preserve the accepted version |
| Invalid amount, currency, date, identifier or row length | REJECTED with reason |
| Missing/extra/duplicate headers or malformed quoting | Whole-file rejection before persistence |
| Repeated contents of the same record type | Reuse the batch, regardless of filename |
| Worker interruption | Roll back partial writes and retry idempotently |

Identifiers are unique within each record type. Row reports count logical CSV
records, starting at 2 after the header; quoted multiline fields can make these
numbers differ from physical line numbers.

Conflicting versions are preserved in the row report. Their affected transaction
references receive SOURCE_CONFLICT so unresolved ambiguity is not displayed as
a clean match. No accepted record is silently overwritten. Conflict resolution
belongs to later investigation work.

## Reconciliation findings

| Code | Meaning |
|---|---|
| MISSING_SETTLEMENT | Payment has no settlement |
| MISSING_PAYMENT | Settlement refers to an absent payment |
| AMOUNT_MISMATCH | Single settlement gross differs from payment, including partial settlement |
| MULTIPLE_SETTLEMENTS | More than one settlement; never combined into a clean match |
| SETTLEMENT_ARITHMETIC | Gross minus fee does not equal net |
| REFUND_EXCEEDS_PAYMENT | Sum of accepted refunds exceeds payment amount |
| ORPHAN_REFUND | Refund refers to an absent payment |
| SOURCE_CONFLICT | Quarantined data affects the reference |

Multiple findings may apply. A group is one exact transaction reference,
including orphan references. MATCHED means the group has no findings. Multiple
and partial refunds are allowed within the payment total. Invalid/quarantined
rows are excluded from financial totals and displayed separately. Matching is
exact; there is no fuzzy matching, currency conversion or AI decision-making.

## Snapshots

Reconciliation waits for pending imports. A database lock serializes import
commits and reconciliation snapshots. A run stores the rules, input fingerprint,
results and source counts. Unchanged inputs reuse a run; late counterparts
create a new one without modifying history.

Run duration covers matching and result persistence, excluding source loading,
lock wait, upload and queue delay. It is not end-to-end ingestion latency.
