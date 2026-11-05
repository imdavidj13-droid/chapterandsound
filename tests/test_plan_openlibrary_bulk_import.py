"""Run: python -m unittest discover -s tests -p 'test_plan_openlibrary_bulk_import.py'"""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "plan-openlibrary-bulk-import.py"
spec = importlib.util.spec_from_file_location("bulk_planner", MODULE_PATH)
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)

class BulkPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.prepared = self.root / "prepared"
        self.prepared.mkdir()
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
            CREATE TABLE works(id TEXT,canonical_title TEXT,status TEXT);
            CREATE TABLE people(id TEXT,preferred_name TEXT,identity_status TEXT);
            CREATE TABLE contributions(work_id TEXT,person_id TEXT,role_code TEXT);
            CREATE TABLE editions(id TEXT,work_id TEXT);
            CREATE TABLE identifier_schemes(id TEXT,code TEXT);
            CREATE TABLE entity_identifiers(entity_id TEXT,entity_kind TEXT,scheme_id TEXT,normalized_value TEXT);
            CREATE TABLE catalogue_audit_log(action TEXT,target_id TEXT,details_json TEXT);
        """)
        self.db.execute("INSERT INTO identifier_schemes VALUES ('isbn13','ISBN13')")
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def candidate(self,key="/works/OL1W",title="Sample Book",author="Example Writer",isbn="9780552156905"):
        return {"sourceId":"openlibrary","workSourceKey":key,"title":title,
          "author":author,"authorSourceKeys":["/authors/OL1A"],
          "editions":[{"sourceKey":"/books/OL1M","isbn13":isbn,"format":"paperback"}]}
    def plan(self,books):
        (self.prepared / "candidates-01.json").write_text(json.dumps({"candidates":books}),encoding="utf8")
        return planner.analyze(self.prepared,self.db,self.root / "out")
    def test_unmatched_work_is_only_planned_never_imported(self):
        result=self.plan([self.candidate()])
        self.assertEqual(result["readyForFurtherPreview"],1)
        self.assertFalse(result["importEnabled"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM works").fetchone()[0],0)
        batch=json.loads((self.root / "out/batch-00001.json").read_text())
        self.assertFalse(batch["confirmed"])
    def test_existing_isbn_is_held_for_review(self):
        self.db.execute("INSERT INTO works VALUES ('w1','Earlier title','draft')")
        self.db.execute("INSERT INTO editions VALUES ('e1','w1')")
        self.db.execute("INSERT INTO entity_identifiers VALUES ('e1','edition','isbn13','9780552156905')")
        result=self.plan([self.candidate()])
        self.assertEqual(result["readyForFurtherPreview"],0)
        self.assertEqual(result["identityOrIsbnReview"],1)
        self.assertEqual(json.loads((self.root / "out/review.json").read_text())[0]["reason"],"edition_isbn_already_in_book_db")
    def test_title_and_author_match_is_not_silently_merged(self):
        self.db.execute("INSERT INTO works VALUES ('w1','Sample Book','draft')")
        self.db.execute("INSERT INTO people VALUES ('p1','Example Writer','provisional')")
        self.db.execute("INSERT INTO contributions VALUES ('w1','p1','author')")
        result=self.plan([self.candidate()])
        self.assertEqual(result["readyForFurtherPreview"],0)
        self.assertEqual(result["identityOrIsbnReview"],1)
    def test_cross_file_isbn_collision_is_flagged(self):
        left=self.candidate()
        right=self.candidate("/works/OL2W","Another Story","Different Person")
        result=self.plan([left,right])
        self.assertEqual(result["readyForFurtherPreview"],0)
        self.assertEqual(result["identityOrIsbnReview"],2)
    def test_unknown_format_is_deferred_for_enrichment(self):
        book=self.candidate()
        book["editions"][0]["format"]=""
        result=self.plan([book])
        self.assertEqual(result["needsEnrichment"],1)
        self.assertEqual(result["readyForFurtherPreview"],0)

if __name__=="__main__":
    unittest.main()
