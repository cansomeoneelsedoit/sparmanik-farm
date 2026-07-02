# Archived one-off scripts — DO NOT RE-RUN

These scripts already ran once against the database to perform a specific,
one-time data correction or setup. They are kept only for reference/history.

**Re-running any of them can corrupt live data** (e.g. `fix-kardus-prices.mjs`
exists purely to repair the stock-doubling that `import-kardus-boxes.mjs` caused;
`allocate-test-harvest.mjs` and `add-nutrient-usage.mjs` target a hard-coded test
harvest and wipe/rewrite its allocations).

If you need a similar operation again, copy the logic into a fresh, clearly-named
script and review it against current data first.

Reusable, safe-to-run tools stay in the parent `scripts/` folder (backup-prod,
sync-local-to-prod, pull-prod, check-i18n*, backfill-* which are idempotent).
