# Synthetic fixtures

`demo/` contains payment, settlement, refund and late-settlement CSVs, plus
`expected.json`. All data is fictional. Expected findings are explicitly
specified independently of the reconciliation engine.

Regenerate with `npm run fixtures --workspace @reconciledesk/api`. The generator
refuses to replace changed fixture contents. Add `-- --count 10000 --seed 42`
for a separate all-matched benchmark under `data/generated`.

See docs/CSV_CONTRACT.md and docs/MILESTONE_3.md for the format and expected counts.
