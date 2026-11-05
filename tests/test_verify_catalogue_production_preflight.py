"""Regression tests for read-only production preflight."""
import hashlib
import importlib.util
import json
import os
import tempfile
import time
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "verify-catalogue-production-preflight.py"
spec = importlib.util.spec_from_file_location("preflight", SOURCE)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)

class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.plan = self.root / "import-plan"
        self.plan.mkdir()
        self.prepared = self.root / "prepared"
        self.prepared.mkdir()
        self.rehearsal = self.root / "checkpoint.json"
        self.fresh = self.root / "fresh.sql"
        self.out = self.root / "output"
        self.books = [
            {"sourceId":"openlibrary","workSourceKey":"/works/OL1W",
             "title":"Sample One","author":"Writer One",
             "authorSourceKeys":["/authors/OL1A"],
             "editions":[{"sourceKey":"/books/OL1M","isbn13":"9780306406157","format":"paperback"}]},
            {"sourceId":"openlibrary","workSourceKey":"/works/OL2W",
             "title":"Sample Two","author":"Writer Two",
             "authorSourceKeys":["/authors/OL2A"],"editions":[]}
        ]
        (self.prepared / "candidates-01.json").write_text(
            json.dumps({"candidates":self.books}),encoding="utf8")
        (self.plan / "batch-00001.json").write_text(
            json.dumps({"confirmed":False,"candidates":[self.books[0]]}),encoding="utf8")
        (self.plan / "work-only-001.json").write_text(
            json.dumps({"confirmed":False,"importEnabled":False,
                        "candidates":[{**self.books[1],"editions":[]}]}),encoding="utf8")
        plan_hash, entries = preflight.load_inputs(self.plan)
        self.assertEqual(len(entries),2)
        self.rehearsal.write_text(json.dumps({
            "version":1,"planHash":plan_hash,"snapshotHash":"some-prior-hash",
            "results":[
                {"key":"/works/OL1W","kind":"edition","status":"rehearsed"},
                {"key":"/works/OL2W","kind":"work-only","status":"held"}],
            "dryRun":True,"productionWrites":0
        }),encoding="utf8")
        self.fresh.write_text("""
            CREATE TABLE works(id TEXT,canonical_title TEXT,status TEXT);
            CREATE TABLE people(id TEXT,preferred_name TEXT,identity_status TEXT);
            CREATE TABLE contributions(work_id TEXT,person_id TEXT,role_code TEXT);
            CREATE TABLE editions(id TEXT,work_id TEXT);
            CREATE TABLE identifier_schemes(id TEXT,code TEXT);
            CREATE TABLE entity_identifiers(entity_id TEXT,entity_kind TEXT,scheme_id TEXT,normalized_value TEXT);
            CREATE TABLE catalogue_audit_log(action TEXT,target_id TEXT,details_json TEXT);
        """,encoding="utf8")
        # Filesystem mtime cannot be trusted to order subsecond writes.
        now = time.time()
        os.utime(self.rehearsal,(now-60,now-60))
        os.utime(self.fresh,(now,now))
    def tearDown(self):
        self.folder.cleanup()
    def test_only_rehearsed_and_freshly_eligible_items_are_in_allowlist(self):
        result=preflight.verify(self.plan,self.rehearsal,self.fresh,self.out)
        self.assertEqual(result["eligibleAgainstFreshSnapshot"],1)
        self.assertEqual(result["withheld"],1)
        self.assertEqual(result["productionWrites"],0)
        allow=json.loads((self.out / "eligible.json").read_text())
        self.assertEqual(allow["candidates"][0]["workSourceKey"],"/works/OL1W")
        self.assertFalse(allow["importEnabled"])
    def test_rejects_modified_plan(self):
        file=self.plan / "batch-00001.json"
        file.write_text(file.read_text()+" ",encoding="utf8")
        with self.assertRaisesRegex(ValueError,"checkpoint"):
            preflight.verify(self.plan,self.rehearsal,self.fresh,self.out)
    def test_rejects_snapshot_predating_rehearsal(self):
        old=time.time()-120
        os.utime(self.fresh,(old,old))
        with self.assertRaisesRegex(ValueError,"exported after"):
            preflight.verify(self.plan,self.rehearsal,self.fresh,self.out)
    def test_rejects_unreviewed_manifest(self):
        file=self.plan / "batch-00001.json"
        file.write_text(json.dumps({"confirmed":True,"candidates":[self.books[0]]}),encoding="utf8")
        with self.assertRaisesRegex(ValueError,"Unsafe"):
            preflight.load_inputs(self.plan)

if __name__ == "__main__":
    unittest.main()
