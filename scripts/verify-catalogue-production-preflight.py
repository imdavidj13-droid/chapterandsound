#!/usr/bin/env python3
"""Production import preflight, READ ONLY.

Compares a completed, successful offline rehearsal against a newly exported
BOOK_DB SQL snapshot. Builds a signed-by-hash *candidate manifest*, never a
permission to write. Identity holds are intentionally excluded.

Example:
 python scripts/verify-catalogue-production-preflight.py \
   --plan .private-catalogue-5000/import-plan \
   --rehearsal .private-catalogue-5000/import-plan/rehearsal-v3/checkpoint.json \
   --fresh-db-sql .private-catalogue-5000/snapshots/fresh-before-import.sql \
   --out .private-catalogue-5000/production-preflight
"""
import argparse
import hashlib
import importlib.util
import json
import re
import sqlite3
import tempfile
from collections import Counter
from pathlib import Path

PATTERN = re.compile(r"^/works/OL\d+W$")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_inputs(plan):
    files = sorted(
        p for p in plan.iterdir()
        if re.fullmatch(r"(?:batch|work-only)-\d+\.json", p.name)
    )
    if not files:
        raise ValueError("No planned import files found")
    signatures, entries = [], []
    for file in files:
        raw = file.read_bytes()
        signatures.append(file.name + ":" + sha(raw))
        data = json.loads(raw)
        if data.get("confirmed") is not False or data.get("importEnabled") is True:
            raise ValueError("Unsafe import plan flag in " + file.name)
        kind = "work-only" if file.name.startswith("work-only-") else "edition"
        for candidate in data.get("candidates", []):
            key = candidate.get("workSourceKey") or candidate.get("sourceKey")
            if not isinstance(key, str) or not PATTERN.fullmatch(key):
                raise ValueError("Invalid work source key in " + file.name)
            entries.append((kind, key, file.name))
    return sha("\n".join(signatures).encode()), entries


def verify(plan, rehearsal, snapshot, out):
    plan_hash, entries = load_inputs(plan)
    ledger = json.loads(rehearsal.read_text(encoding="utf-8"))
    if (ledger.get("version") != 1 or ledger.get("dryRun") is not True
            or ledger.get("productionWrites") != 0
            or ledger.get("planHash") != plan_hash):
        raise ValueError("Rehearsal checkpoint is not a completed read-only run of this plan")
    expected = {(kind, key) for kind, key, _ in entries}
    if len(expected) != len(entries):
        raise ValueError("Duplicate work keys exist in the current plan")
    results = ledger.get("results", [])
    if len(results) != len(entries):
        raise ValueError("Incomplete rehearsal; cannot prepare production candidates")
    done = {}
    for row in results:
        marker = (row.get("kind"), row.get("key"))
        if marker not in expected or marker in done or row.get("status") not in ("rehearsed", "held"):
            raise ValueError("Unexpected, repeated, or invalid rehearsal result")
        done[marker] = row
    if set(done) != expected:
        raise ValueError("Rehearsal results do not match planned candidates")
    snapshot_bytes = snapshot.read_bytes()
    fresh_hash = sha(snapshot_bytes)
    # The database may not have changed since rehearsal, so identical SQL
    # content is acceptable. Require the fresh export file itself to be newer
    # than the rehearsal checkpoint, rather than comparing content hashes.
    if snapshot.stat().st_mtime <= rehearsal.stat().st_mtime:
        raise ValueError("The production snapshot must be exported after the completed rehearsal checkpoint")
    module_path = Path(__file__).with_name("plan-openlibrary-bulk-import.py")
    spec = importlib.util.spec_from_file_location("bulk_planner", module_path)
    planner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(planner)
    prepared = plan.parent / "prepared"
    if not prepared.is_dir():
        raise ValueError("Prepared catalogue files not found at " + str(prepared))
    with tempfile.TemporaryDirectory(prefix="cas-prod-preflight-") as folder:
        scratch = Path(folder)
        db = sqlite3.connect(str(scratch / "snapshot.sqlite"))
        try:
            db.executescript(snapshot_bytes.decode("utf-8"))
            updated = planner.analyze(prepared, db, scratch / "plan")
        finally:
            db.close()
        fresh_keys = {}
        for file in (scratch / "plan").glob("batch-*.json"):
            batch = json.loads(file.read_text(encoding="utf-8"))
            for book in batch["candidates"]:
                fresh_keys[book["workSourceKey"]] = "edition"
        for file in (scratch / "plan").glob("work-only-*.json"):
            batch = json.loads(file.read_text(encoding="utf-8"))
            for book in batch["candidates"]:
                fresh_keys[book["workSourceKey"]] = "work-only"

    approved, withheld = [], []
    for kind, key, source in entries:
        row = {"kind": kind, "workSourceKey": key, "file": source}
        if done[(kind, key)]["status"] != "rehearsed":
            withheld.append({**row, "reason": "held_in_rehearsal"})
        elif fresh_keys.get(key) != kind:
            withheld.append({**row, "reason": "not_safe_against_fresh_book_db"})
        else:
            approved.append(row)
    out.mkdir(parents=True, exist_ok=True)
    # No user confirmation or credentials can be inferred from this file.
    # Explicitly omit candidate payloads and any automatic write toggle.
    eligible_bytes = json.dumps({
        "dryRun": True, "importEnabled": False, "candidates": approved
    }, indent=2).encode("utf-8")
    (out / "eligible.json").write_bytes(eligible_bytes)
    (out / "withheld.json").write_text(json.dumps(withheld, indent=2), encoding="utf-8")
    summary = {
        "dryRun": True, "productionWrites": 0, "importEnabled": False,
        "originalRehearsed": len([r for r in results if r["status"] == "rehearsed"]),
        "eligibleAgainstFreshSnapshot": len(approved),
        "withheld": len(withheld),
        "withheldReasons": dict(Counter(item["reason"] for item in withheld)),
        "freshPlan": {k: updated[k] for k in
                      ("preparedCandidates", "readyForFurtherPreview",
                       "workOnlyDraftCandidates", "identityOrIsbnReview")},
        "freshSnapshotSha256": fresh_hash,
        "eligibleManifestSha256": sha(eligible_bytes),
        "planSha256": plan_hash,
        "rehearsalCheckpointSha256": sha(rehearsal.read_bytes()),
        "notes": "Preparation only. No production import, no secret handling, and no database writes."
    }
    (out / "report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--rehearsal", type=Path, required=True)
    parser.add_argument("--fresh-db-sql", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    for f in (args.rehearsal, args.fresh_db_sql):
        if not f.is_file():
            parser.error("Missing required file: " + str(f))
    print(json.dumps(verify(args.plan, args.rehearsal, args.fresh_db_sql, args.out), indent=2))


if __name__ == "__main__":
    main()
