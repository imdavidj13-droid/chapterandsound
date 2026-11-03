# Full 59-table catalogue validation

Draft CI-only review marker. Migrations 0003–0005 are additive; they do not modify or remove the existing 28 tables. The integration test asserts precisely 15, 28, 38, 50 and 59 application tables after migrations 0001–0005 respectively. The code changes are already committed to main. Do not merge this draft PR as an additional release step.
