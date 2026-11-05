#!/usr/bin/env python3
"""Plan a bulk Open Library import against a READ-ONLY exported BOOK_DB snapshot.

Inputs:
  --prepared: folder containing candidates-*.json from prepare-openlibrary-pilot.mjs
  --db-sql: SQL export of the canonical BOOK_DB, made with wrangler d1 export
  --out: private output directory

This command NEVER connects to Cloudflare, sends API requests, or writes to BOOK_DB.
It deliberately separates safe new works from identity/ISBN conflicts and records
with incomplete edition metadata. A plan is not permission to import automatically.
"""
import argparse
import json
import re
import sqlite3
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

WORK_KEY = re.compile(r"^/works/OL\d+W$")
AUTHOR_KEY = re.compile(r"^/authors/OL\d+A$")
EDITION_KEY = re.compile(r"^/books/OL\d+M$")
SUPPORTED = {"paperback", "hardback", "ebook", "other_print", "other_digital"}


def normal(value):
    return " ".join(str(value or "").casefold().split())


def isbn(value):
    return re.sub(r"[\s-]", "", str(value or "")).upper()


def valid_isbn(value):
    v = isbn(value)
    if len(v) == 13 and re.fullmatch(r"97[89]\d{10}", v):
        return (10 - sum(int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(v[:12])) % 10) % 10 == int(v[-1])
    if len(v) == 10 and re.fullmatch(r"\d{9}[\dX]", v):
        return sum((10 - i) * (10 if ch == "X" else int(ch)) for i, ch in enumerate(v)) % 11 == 0
    return False


def tables(con):
    return {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def add(review, reason, book):
    review.append({"workSourceKey": book.get("workSourceKey"), "title": book.get("title"), "reason": reason})


def analyze(prepared, con, out):
    input_files = sorted(prepared.glob("candidates-*.json"))
    if not input_files:
        raise ValueError("No candidates-*.json files found in the prepared directory")
    required = {"works", "people", "contributions", "editions", "entity_identifiers", "identifier_schemes", "catalogue_audit_log"}
    missing = required - tables(con)
    if missing:
        raise ValueError("BOOK_DB export is missing required tables: " + ", ".join(sorted(missing)))

    # Load canonical identifiers and audit keys from the *exported* database.
    isbn_existing = defaultdict(set)
    for value, work in con.execute("""
        SELECT ei.normalized_value, e.work_id
        FROM entity_identifiers ei
        JOIN identifier_schemes s ON ei.scheme_id=s.id
        JOIN editions e ON ei.entity_id=e.id AND ei.entity_kind='edition'
        WHERE s.code IN ('ISBN13','ISBN10')
    """):
        isbn_existing[isbn(value)].add(work)

    source_existing = {}
    for work_id, details in con.execute(
        "SELECT target_id,details_json FROM catalogue_audit_log WHERE action='import_draft'"
    ):
        try:
            key = json.loads(details or "{}").get("workSourceKey")
            if key:
                source_existing.setdefault(key, set()).add(work_id)
        except (ValueError, TypeError):
            pass
    if "source_records" in tables(con) and "metadata_sources" in tables(con):
        # A source record can exist without being an imported work; such matches
        # are reviewed rather than presumed safe to reuse.
        for key, in con.execute("""
            SELECT sr.external_key FROM source_records sr
            JOIN metadata_sources ms ON ms.id=sr.source_id
            WHERE lower(ms.name)='openlibrary'
        """):
            if WORK_KEY.fullmatch(key or ""):
                source_existing.setdefault(key, set()).add("source_record_present")

    existing_by_title_author = defaultdict(set)
    for work_id, title, author in con.execute("""
        SELECT w.id,w.canonical_title,p.preferred_name FROM works w
        JOIN contributions c ON c.work_id=w.id AND c.role_code IN ('author','coauthor')
        JOIN people p ON p.id=c.person_id
        WHERE w.status NOT IN ('suppressed','withdrawn')
    """):
        existing_by_title_author[(normal(title), normal(author))].add(work_id)

    authors_by_name = defaultdict(set)
    for person_id, name in con.execute("""
        SELECT id,preferred_name FROM people
        WHERE identity_status NOT IN ('merged','suppressed')
    """):
        authors_by_name[normal(name)].add(person_id)

    seen_work = set()
    seen_isbn = defaultdict(set)
    seen_edition_keys = defaultdict(set)
    seen_title_author = defaultdict(set)
    books = []
    for file in input_files:
        payload = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(payload.get("candidates"), list):
            raise ValueError("Invalid candidates array in " + file.name)
        books.extend(payload["candidates"])

    # First pass accounts for conflicts *across all 50 input files*.
    for book in books:
        key = str(book.get("workSourceKey") or book.get("sourceKey") or "")
        seen_work.add(key)
        signature = (normal(book.get("title")), normal(book.get("author")))
        seen_title_author[signature].add(key)
        for edition in book.get("editions") or []:
            if edition.get("sourceKey"):
                seen_edition_keys[str(edition["sourceKey"])].add(key)
            for code in (edition.get("isbn13"), edition.get("isbn10")):
                if valid_isbn(code):
                    seen_isbn[isbn(code)].add(key)

    ready, review, enrich = [], [], []
    distinct_works = set()
    for book in books:
        key = str(book.get("workSourceKey") or book.get("sourceKey") or "")
        title = str(book.get("title") or "").strip()
        author = str(book.get("author") or "").strip()
        signature = (normal(title), normal(author))
        if key in distinct_works:
            add(review, "duplicate_work_key_in_input", book)
            continue
        distinct_works.add(key)
        author_keys = list(book.get("authorSourceKeys") or [])
        if not WORK_KEY.fullmatch(key) or not title or not author or not author_keys or any(
            not AUTHOR_KEY.fullmatch(k or "") for k in author_keys
        ):
            add(review, "invalid_work_or_author_identity", book)
            continue
        if len(set(author_keys)) != 1:
            add(review, "multiple_contributors_require_review", book)
            continue
        if key in source_existing:
            add(review, "source_work_already_present_in_book_db", book)
            continue
        if signature in existing_by_title_author:
            add(review, "title_and_author_already_in_book_db", book)
            continue
        if len(seen_title_author[signature]) > 1:
            add(review, "same_title_and_author_across_input_works", book)
            continue
        if len(authors_by_name[normal(author)]) > 1:
            add(review, "ambiguous_existing_author_name", book)
            continue
        if authors_by_name[normal(author)]:
            # Confirming source-author linkage requires source identity evidence;
            # a name alone must not cause a silent canonical author merge.
            add(review, "existing_author_requires_identity_confirmation", book)
            continue

        editions = []
        blocked = None
        local_codes = set()
        local_edition_keys = set()
        for edition in book.get("editions") or []:
            ekey = str(edition.get("sourceKey") or "")
            if not EDITION_KEY.fullmatch(ekey):
                blocked = "invalid_edition_source_key"
                break
            if ekey in local_edition_keys or len(seen_edition_keys[ekey]) > 1:
                blocked = "edition_key_reused_across_candidates"
                break
            local_edition_keys.add(ekey)
            codes = [isbn(v) for v in (edition.get("isbn13"), edition.get("isbn10")) if v]
            if not codes or any(not valid_isbn(code) for code in codes):
                blocked = "missing_or_invalid_edition_isbn"
                break
            if any(code in local_codes for code in codes):
                blocked = "duplicate_isbn_across_work_editions"
                break
            local_codes.update(codes)
            if any(code in isbn_existing for code in codes):
                blocked = "edition_isbn_already_in_book_db"
                break
            if any(len(seen_isbn[code]) > 1 for code in codes):
                blocked = "edition_isbn_conflict_across_input_works"
                break
            if edition.get("format") not in SUPPORTED:
                blocked = "unknown_or_audio_edition_format"
                break
            editions.append(edition)
        if blocked:
            add(review if "conflict" in blocked or "already" in blocked or "reused" in blocked or "duplicate" in blocked else enrich, blocked, book)
            continue
        if not editions:
            add(enrich, "no_identified_editions", book)
            continue
        if len(editions) > 50:
            add(review, "too_many_editions_for_single_draft_batch", book)
            continue
        # A multi-edition work may need batches of its own to satisfy D1
        # statement and size limits. The import runner must re-preview.
        ready.append(book)

    out.mkdir(parents=True, exist_ok=True)
    (out / "review.json").write_text(json.dumps(review, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "needs-enrichment.json").write_text(json.dumps(enrich, indent=2, ensure_ascii=False), encoding="utf-8")
    batches = []
    # Conservative single-work batches avoid cross-work author/subject duplicates
    # in the existing draft writer and keep failures isolated.
    for index, book in enumerate(ready, 1):
        name = f"batch-{index:05d}.json"
        (out / name).write_text(json.dumps({"candidates": [book], "confirmed": False,
            "workFirstDraft": True}, ensure_ascii=False), encoding="utf-8")
        batches.append(name)

    counts = {"preparedCandidates": len(books), "readyForFurtherPreview": len(ready),
              "identityOrIsbnReview": len(review), "needsEnrichment": len(enrich),
              "files": {"review": "review.json", "enrichment": "needs-enrichment.json"},
              "batchCount": len(batches), "importEnabled": False, "productionWrites": 0,
              "note": "Plans are NOT approved imports. Existing API preview, rights, author matching and backup checks must pass before saving.",
              "reviewReasons": dict(Counter(item["reason"] for item in review)),
              "enrichmentReasons": dict(Counter(item["reason"] for item in enrich))}
    (out / "report.json").write_text(json.dumps(counts, indent=2), encoding="utf-8")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--db-sql", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.db_sql.is_file():
        parser.error("BOOK_DB SQL export not found: " + str(args.db_sql))
    with tempfile.TemporaryDirectory(prefix="cas-bulk-reconcile-") as folder:
        db = sqlite3.connect(str(Path(folder) / "snapshot.sqlite"))
        try:
            db.executescript(args.db_sql.read_text(encoding="utf-8"))
            result = analyze(args.prepared, db, args.out)
        finally:
            db.close()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
