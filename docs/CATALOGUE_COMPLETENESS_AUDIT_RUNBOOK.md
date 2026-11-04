# Run the canonical catalogue completeness audit

**Scope:** the ten Simon Kernick works and the local review-only edition manifest. This does not query, change or publish anything in Cloudflare D1.

From `C:\Projects\chapterandsound`:

```powershell
git pull --ff-only
npm test
npm run typecheck
node scripts/audit-catalogue-field-completeness.mjs --input ".private-catalogue-pilot/targeted-format-enriched-candidates.json" --registry "pilot/catalogue-field-source-registry.json" --out ".private-catalogue-pilot"
```

**Inputs**

- `--input`: current canonical *candidate* manifest. The targeted-format enriched manifest contains 10 works and the staged edition records; do not use the older 75-edition baseline.
- `--registry`: the source capability and applicability registry, `pilot/catalogue-field-source-registry.json`.
- `--out`: local private report directory.

**Outputs**

- `catalogue-field-completeness-report.json`: per-field counts, per-edition gaps, per-work summaries, possible duplicates and ranked potential sources.
- Console summary: aggregate totals, top missing required/priority fields, and potential source opportunities.

**Interpretation**

- `present` does **not** mean independently verified.
- `source_backed` means source metadata is attached for that field, **not** that reuse rights were granted.
- `rights_unverified` means the manifest may hold an image or description, but permission to publish is not established.
- `applicability_unknown` is distinct from `not_applicable`: without a proven format, we cannot assume page count or narrator is irrelevant.
- An edition without ISBN can still be legitimate if its source edition / recording identity is established.
- Potential duplicates are flagged; they are never merged automatically.
- Source rankings count which missing fields a source *might* cover, not actual hit rates or permissions. They are research priorities, not automatic source selection.
- This is a **manifest inventory**, not an authoritative production completeness report. Record values may need additional canonical mapping before final publication approval.
- Community reviews, ratings, user shelves and internal licence/verification tables are not present in the staging candidate shape and are reported as `not_audit_target`; they must be audited in their own systems.
- The number of staged edition records may include potential duplicates. Do not equate it to a verified unique-edition count.

The full classification rules and source matrix are documented in `docs/BOOK_FIELD_AUDIT_AND_SOURCE_MATRIX_20261104.md`.

**Next step:** use the missing-fields breakdown to select metadata-provider adapters with both tested coverage and confirmed storage/display permission, then run a **separate read-only production BOOK_DB** audit. Do not silently default formats, languages, narrators, or abridgement statuses to satisfy completeness checks.
