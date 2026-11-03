# Catalogue SQL schema validation

The dedicated migrations in `catalogue-migrations/` are **staging candidates only**. GitHub CI applies these only in an in-memory SQLite fixture, separate from the production application migration runner. **Do not merge this draft PR to deploy schema.**
