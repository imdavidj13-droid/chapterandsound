import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('../catalogue-migrations/',import.meta.url);
const files=readdirSync(dir).filter(n=>/^[0-9]{4}_[a-z0-9_]+[.]sql$/.test(n)).sort();
assert.equal(files.length,5,'Expected exactly five dedicated catalogue migrations (0001 through 0005)');
assert.deepEqual(files.map(f=>f.slice(0,4)),['0001','0002','0003','0004','0005']);
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
try{
 for(const [index,f] of files.entries()){
  try{db.exec(readFileSync(new URL(f,dir),'utf8'));}
  catch(e){throw Error(f+' failed: '+String(e))}
  const n=db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n;
  assert.equal(n,[15,28,38,50,59][index],f+' did not produce the expected additive table count');
 }
 const actual=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 const needed=['works','work_titles','work_versions','editions','audio_recordings','edition_recordings','people','person_names',
  'contributions','organisations','publishers','imprints','series','series_memberships','publication_events','identifier_schemes',
  'entity_identifiers','metadata_licences','metadata_sources','source_records','field_claims','media_assets','media_links',
  'media_rights','text_content','record_revisions','verification_reviews','catalogue_audit_log'];
 const extended=['work_relationships','work_languages','edition_details','edition_relationships','edition_languages',
 'audio_tracks','audio_recording_details','organisation_names','publisher_imprints','series_relationships',
 'classification_schemes','subjects','work_subjects','content_advisories','audience_descriptors','descriptor_definitions',
 'record_descriptors','media_variants','territories','distribution_rights','product_offers','availability_events',
 'import_batches','import_errors','merge_events','record_aliases','editorial_overrides','api_clients','api_keys',
 'api_usage_daily','api_access_policies'];
 assert.equal(needed.length,28);
 assert.equal(extended.length,31);
 assert.equal(actual.length,59,'Expected exactly 59 canonical catalogue tables');
 for(const name of [...needed,...extended])assert.ok(actual.includes(name),'Missing catalogue table '+name);
 assert.equal(new Set([...needed,...extended]).size,59,'Catalogue table registry must have no duplicate names');
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
 // Additive 31-table migration integration: relationship integrity and extended modules.
 p("INSERT INTO work_relationships(id,from_work_id,to_work_id,relation_type) VALUES('related-1',?,?,'sequel')",work,work2);
 assert.throws(()=>p("INSERT INTO work_relationships(id,from_work_id,to_work_id,relation_type) VALUES('self-work',?,?,'related')",work,work));
 p("INSERT INTO work_languages(id,work_id,language,relationship) VALUES('lang-work',?,'en','original')",work);
 p("INSERT INTO edition_details(edition_id,binding,trim_height_mm) VALUES(?,'softcover',200)",edition);
 assert.throws(()=>p("INSERT INTO edition_details(edition_id,trim_height_mm) VALUES('invalid-ed',200)"));
 p("INSERT INTO audio_tracks(id,recording_id,sequence,title,duration_seconds) VALUES('track-1',?,1,'Opening',120)",audio);
 assert.throws(()=>p("INSERT INTO audio_tracks(id,recording_id,sequence) VALUES('track-duplicate',?,1)",audio));
 p("INSERT INTO classification_schemes(id,scheme_code,version) VALUES('thema','THEMA','1')");
 p("INSERT INTO subjects(id,scheme_id,code,label) VALUES('subject-1','thema','F','Fiction')");
 p("INSERT INTO work_subjects(id,work_id,subject_id) VALUES('ws-1',?,'subject-1')",work);
 assert.throws(()=>p("INSERT INTO work_subjects(id,work_id,subject_id) VALUES('ws-2',?,'not-a-subject')",work));
 p("INSERT INTO content_advisories(id,work_id,advisory_code) VALUES('warn-1',?,'violence')",work);
 assert.throws(()=>p("INSERT INTO content_advisories(id,work_id,version_id,advisory_code) VALUES('bad-warn',?,'version-1','other')",work));
 p("INSERT INTO descriptor_definitions(id,code,label,category,data_type) VALUES('descriptor-1','tone','Tone','tone','text')");
 p("INSERT INTO record_descriptors(id,entity_kind,entity_id,definition_id,text_value) VALUES('value-1','work',?,'descriptor-1','hopeful')",work);
 assert.throws(()=>p("INSERT INTO record_descriptors(id,entity_kind,entity_id,definition_id,text_value,number_value) VALUES('bad-value','work',?,'descriptor-1','text',3)",work));
 p("INSERT INTO media_variants(id,asset_id,variant_name,r2_key,width,height,mime_type,size_bytes) VALUES('thumb','img','thumbnail','approved/derived/thumb.webp',200,300,'image/webp',512)");
 p("INSERT INTO territories(code,name) VALUES('GB','United Kingdom')");
 p("INSERT INTO distribution_rights(id,edition_id,territory_code,rights_type) VALUES('dist-1',?,'GB','sell')",edition);
 p("INSERT INTO product_offers(id,edition_id,territory_code,currency,price_minor) VALUES('offer-1',?,'GB','GBP',1999)",edition);
 assert.throws(()=>p("INSERT INTO product_offers(id,edition_id,currency,price_minor) VALUES('bad-offer',?,'GBP',-1)",edition));
 p("INSERT INTO availability_events(id,edition_id,territory_code,availability_status) VALUES('availability-1',?,'GB','available')",edition);
 p("INSERT INTO import_batches(id,source_id,state) VALUES('batch-1','src','running')");
 p("INSERT INTO import_errors(id,batch_id,error_code,details) VALUES('err-1','batch-1','unmatched','Ambiguous external title')");
 assert.throws(()=>p("INSERT INTO import_errors(id,batch_id,error_code,details) VALUES('bad-error','not-a-batch','unmatched','bad')"));
 p("INSERT INTO merge_events(id,entity_kind,winner_id,loser_id,decision_json) VALUES('merge-1','work',?,?,?)",work,work2,JSON.stringify({reviewed:true}));
 p("INSERT INTO record_aliases(id,entity_kind,obsolete_id,canonical_id,merge_event_id) VALUES('alias-1','work',?,?,'merge-1')",work2,work);
 assert.throws(()=>p("INSERT INTO record_aliases(id,entity_kind,obsolete_id,canonical_id) VALUES('alias-dup','work',?,?)",work2,work));
 p("INSERT INTO editorial_overrides(id,entity_kind,entity_id,field_path,value_json,reason,actor_external_id) VALUES('override-1','work',?,'canonical_title',?,'Verified publisher catalogue','admin-1')",work,JSON.stringify('Sample Fixture Work'));
 p("INSERT INTO api_clients(id,name,status) VALUES('client-1','Internal Catalogue Client','disabled')");
 p("INSERT INTO api_keys(id,client_id,key_prefix,key_hash) VALUES('key-1','client-1','cas_',?)",'f'.repeat(64));
 assert.throws(()=>p("INSERT INTO api_keys(id,client_id,key_prefix,key_hash) VALUES('key-dup','client-1','cas_',?)",'f'.repeat(64)));
 p("INSERT INTO api_usage_daily(client_id,date,endpoint_group,requests,errors) VALUES('client-1','2026-11-03','catalogue',2,1)");
 assert.throws(()=>p("INSERT INTO api_usage_daily(client_id,date,endpoint_group,requests,errors) VALUES('client-1','2026-11-04','catalogue',1,2)"));
 p("INSERT INTO api_access_policies(id,client_id,scope_code,field_policy_json) VALUES('policy-1','client-1','catalogue:read','{}')");
 assert.throws(()=>p("INSERT INTO api_access_policies(id,client_id,scope_code,field_policy_json) VALUES('policy-bad','client-1','catalogue:write','not-json')"));

 const problems=db.prepare('PRAGMA foreign_key_check').all();
 assert.deepEqual(problems,[]);
 console.log('PASS catalogue: '+files.length+' isolated additive migrations; '+actual.length+' tables (28 original + 31 new), FK/uniqueness/checks and complete catalogue fixture coverage');
}finally{db.close()}
