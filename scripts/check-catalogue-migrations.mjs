import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('../catalogue-migrations/',import.meta.url);
const files=readdirSync(dir).filter(n=>/^[0-9]{4}_[a-z0-9_]+[.]sql$/.test(n)).sort();
assert.ok(files.length>=2,'Dedicated catalogue migrations missing');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
try{
 for(const f of files){
  try{db.exec(readFileSync(new URL(f,dir),'utf8'));}
  catch(e){throw Error(f+' failed: '+String(e))}
 }
 const actual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 const needed=['works','work_titles','work_versions','editions','audio_recordings','edition_recordings','people','person_names',
  'contributions','organisations','publishers','imprints','series','series_memberships','publication_events','identifier_schemes',
  'entity_identifiers','metadata_licences','metadata_sources','source_records','field_claims','media_assets','media_links',
  'media_rights','text_content','record_revisions','verification_reviews','catalogue_audit_log'];
 for(const name of needed)assert.ok(actual.includes(name),'Missing catalogue table '+name);
 assert.ok(!actual.includes('members')&&!actual.includes('reviews')&&!actual.includes('session')&&!actual.includes('reading_experiences'),'Member data found in catalogue DB');
 const p=(sql,...args)=>db.prepare(sql).run(...args);
 const work='work-1',work2='work-2',edition='ed-1',audio='rec-1',person='p-1';
 p("INSERT INTO works(id,canonical_title) VALUES(?,?)",work,'Sample Fixture Work');
 p("INSERT INTO works(id,canonical_title) VALUES(?,?)",work2,'Another Fixture');
 assert.throws(()=>p("INSERT INTO works(id,canonical_title,work_type) VALUES('bad','x','invented')"));
 p("INSERT INTO people(id,preferred_name) VALUES(?,?)",person,'Fixture Author and Narrator');
 p("INSERT INTO work_versions(id,work_id,version_type) VALUES('version-1',?,'original')",work);
 p("INSERT INTO editions(id,work_id,version_id,format,page_count) VALUES(?,?,?,'audiobook',?)",edition,work,'version-1',350);
 assert.throws(()=>p("INSERT INTO editions(id,work_id,version_id,format) VALUES('bad-ed',?,'version-1','ebook')",work2));
 assert.throws(()=>p("INSERT INTO editions(id,work_id,format,page_count) VALUES('bad-pages',?,'paperback',0)",work));
 p("INSERT INTO audio_recordings(id,work_id,version_id,duration_seconds,abridgement) VALUES(?,?,?,?,'unabridged')",audio,work,'version-1',38900);
 p("INSERT INTO edition_recordings(edition_id,recording_id,primary_recording) VALUES(?,?,1)",edition,audio);
 assert.throws(()=>p("INSERT INTO edition_recordings(edition_id,recording_id) VALUES(?,?)",'bad-ed',audio));
 p("INSERT INTO audio_recordings(id,work_id) VALUES('other-rec',?)",work2);
 assert.throws(()=>p("INSERT INTO edition_recordings(edition_id,recording_id) VALUES(?,?)",edition,'other-rec'));
 p("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES('author',?,?,'author')",person,work);
 p("INSERT INTO contributions(id,person_id,recording_id,role_code) VALUES('narrator',?,?,'narrator')",person,audio);
 assert.equal(db.prepare("SELECT count(*) AS n FROM contributions WHERE person_id=?").get(person).n,2);
 assert.throws(()=>p("INSERT INTO contributions(id,person_id,work_id,recording_id,role_code) VALUES('wrong',?,?,?,'author')",person,work,audio));
 assert.throws(()=>p("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES('wrong-narration',?,?,'narrator')",person,work));
 p("INSERT INTO metadata_licences(id,name,storage_allowed) VALUES('lic','Editorial licensed',1)");
 p("INSERT INTO metadata_sources(id,name,source_type,licence_id) VALUES('src','Human Editorial','editorial','lic')");
 p("INSERT INTO source_records(id,source_id,external_key,licence_id) VALUES('source-record','src','sample-1','lic')");
 p("INSERT INTO field_claims(id,entity_kind,entity_id,field_path,value_json,source_record_id,chosen) VALUES('claim-1','work',?,'canonical_title',?,? ,1)",work,JSON.stringify('Sample Fixture Work'),'source-record');
 assert.throws(()=>p("INSERT INTO field_claims(id,entity_kind,entity_id,field_path,value_json,source_record_id,chosen) VALUES('claim-2','work',?,'canonical_title',?,? ,1)",work,JSON.stringify('Different'),'source-record'));
 p("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES('isbn','ISBN13','edition','global')");
 p("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES('ident','isbn','edition',?,?,?)",edition,'9780123456789','9780123456789');
 assert.throws(()=>p("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES('ident2','isbn','edition',?,?,?)",edition,'9780123456789','9780123456789'));
 p("INSERT INTO media_rights(id,credit,public_display) VALUES('rights','Rights owner',0)");
 const sha='a'.repeat(64);
 p("INSERT INTO media_assets(id,r2_key,sha256,mime_type,size_bytes,rights_id) VALUES('img','staging/a.webp',?,'image/webp',1000,'rights')",sha);
 assert.throws(()=>p("INSERT INTO media_links(id,asset_id,entity_kind,entity_id,role) VALUES('cover','img','edition',?,'front_cover')",edition));
 p("UPDATE media_rights SET public_display=1 WHERE id='rights'");
 p("UPDATE media_assets SET state='approved',approved_at=CURRENT_TIMESTAMP WHERE id='img'");
 p("INSERT INTO media_links(id,asset_id,entity_kind,entity_id,role,is_primary) VALUES('cover','img','edition',?,'front_cover',1)",edition);
 assert.throws(()=>p("UPDATE media_rights SET public_display=0 WHERE id='rights'"));
 assert.throws(()=>p("UPDATE media_assets SET state='rejected' WHERE id='img'"));
 assert.throws(()=>p("INSERT INTO media_links(id,asset_id,entity_kind,entity_id,role) VALUES('mislinked','img','work',?,'front_cover')",work));
 p("INSERT INTO record_revisions(id,entity_kind,entity_id,revision,after_json) VALUES('revision','work',?,1,?)",work,JSON.stringify({title:'Sample Fixture Work'}));
 p("INSERT INTO catalogue_audit_log(id,action,target_kind,target_id) VALUES('audit','create','work',?)",work);
 const problems=db.prepare('PRAGMA foreign_key_check').all();
 assert.deepEqual(problems,[]);
 console.log('PASS catalogue: '+files.length+' isolated migrations; '+actual.length+' tables; work/edition/version/audio contributor, ID, provenance, media rights and audit validation');
}finally{db.close()}
