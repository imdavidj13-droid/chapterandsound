import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {catalogueBookMetadataAPI} from '../src/worker/catalogue-book-metadata-api';

type Param=string|number|null;

/**
 * Full local catalogue schema: exercises actual SQLite constraints and statements
 * rather than mocks. No connected D1, no network, no production writes.
 */
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const migration of readdirSync(dir).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())
  db.exec(readFileSync(new URL(migration,dir),'utf8'));
 let writes=0;
 const connection={
  prepare(sql:string){
   let args:Param[]=[];
   const statement={
    bind(...values:Param[]){args=values;return statement;},
    async first<T>():Promise<T|null>{return (db.prepare(sql).get(...args) as T|undefined)||null;},
    async all<T>():Promise<{results:T[]}>{return {results:db.prepare(sql).all(...args) as T[]};},
    async run():Promise<{meta:{changes:number}}>{const x=db.prepare(sql).run(...args);writes+=Number(x.changes);return {meta:{changes:Number(x.changes)}};}
   };
   return statement;
  },
  async batch(steps:{run():Promise<{meta?:{changes?:number}}>}[]){
   db.exec('BEGIN');
   try{
    const result=[];
    for(const step of steps)result.push(await step.run());
    db.exec('COMMIT');return result;
   }catch(e){db.exec('ROLLBACK');throw e}
  }
 };
 const insert=(sql:string,...values:Param[])=>db.prepare(sql).run(...values);
 insert("INSERT INTO works(id,canonical_title,status) VALUES('work-a','Fixture A','draft')");
 insert("INSERT INTO works(id,canonical_title,status) VALUES('work-b','Fixture B','published')");
 insert("INSERT INTO editions(id,work_id,format) VALUES('ed-a','work-a','paperback')");
 insert("INSERT INTO editions(id,work_id,format) VALUES('ed-b','work-b','hardback')");
 insert("INSERT INTO audio_recordings(id,work_id,performance_type) VALUES('recording-a','work-a','single_narrator')");
 insert("INSERT INTO people(id,preferred_name) VALUES('person-a','Fixture Narrator')");
 insert("INSERT INTO organisations(id,name,organisation_type) VALUES('publisher-a','Fixture Publisher','publisher')");
 insert("INSERT INTO publishers(organisation_id) VALUES('publisher-a')");
 async function send(payload:Record<string,unknown>,workId='work-a'){
  const response=await catalogueBookMetadataAPI(new Request('https://example.org/api/catalogue-admin/works/'+workId+'/metadata',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
  }),connection,'admin-1',workId);
  return response;
 }
 return {db,send,writes:()=>writes,close:()=>db.close()};
}
test('real catalogue schema: new identifier is persisted and visible to the metadata reader',async()=>{
 const f=fixture();
 try{
  const result=await f.send({action:'identifier',editionId:'ed-a',code:'ISBN13',value:'9780306406157'});
  assert.equal(result.status,200,await result.text());
  assert.equal(f.db.prepare("SELECT normalized_value AS value FROM entity_identifiers WHERE entity_kind='edition' AND entity_id='ed-a'").get()?.value,'9780306406157');
  assert.equal(f.db.prepare("SELECT count(*) AS count FROM catalogue_audit_log").get()?.count,1);
 }finally{f.close()}
});
test('real schema: cannot attach same ISBN to another book or change a foreign edition',async()=>{
 const f=fixture();
 try{
  assert.equal((await f.send({action:'identifier',editionId:'ed-a',code:'ISBN13',value:'9780306406157'})).status,200);
  const before=f.writes();
  const collision=await f.send({action:'identifier',editionId:'ed-b',code:'ISBN13',value:'9780306406157'},'work-b');
  assert.equal(collision.status,409);
  assert.equal((await f.send({action:'identifier',editionId:'ed-b',code:'ISBN13',value:'9780306406157'})).status,404);
  assert.equal(f.writes(),before);
 }finally{f.close()}
});
test('real schema: publication event links existing publisher and its own edition',async()=>{
 const f=fixture();
 try{
  const response=await f.send({action:'publication',editionId:'ed-a',type:'released',date:'2026-11-04',publisherId:'publisher-a'});
  assert.equal(response.status,200,await response.text());
  const row=f.db.prepare("SELECT publisher_id AS publisher,edition_id AS edition FROM publication_events").get();
  assert.equal(row?.publisher,'publisher-a');assert.equal(row?.edition,'ed-a');
 }finally{f.close()}
});
test('real schema: narrator credit is linked to the recording and can be removed with audit',async()=>{
 const f=fixture();
 try{
  const created=await f.send({action:'credit',recordingId:'recording-a',personId:'person-a',role:'narrator'});
  assert.equal(created.status,200,await created.text());
  const credit=f.db.prepare("SELECT id FROM contributions WHERE recording_id='recording-a'").get() as {id:string}|undefined;
  assert.ok(credit);
  const removed=await f.send({action:'removeCredit',creditId:credit.id});
  assert.equal(removed.status,200,await removed.text());
  assert.equal(f.db.prepare("SELECT count(*) AS count FROM contributions WHERE recording_id='recording-a'").get()?.count,0);
 }finally{f.close()}
});
test('real schema: book genre is created and can be removed without deleting subject',async()=>{
 const f=fixture();
 try{
  const created=await f.send({action:'genre',genre:'Historical fiction'});
  assert.equal(created.status,200,await created.text());
  const link=f.db.prepare("SELECT id FROM work_subjects WHERE work_id='work-a'").get() as {id:string}|undefined;
  assert.ok(link);
  const removed=await f.send({action:'removeGenre',linkId:link.id});
  assert.equal(removed.status,200,await removed.text());
  assert.equal(f.db.prepare('SELECT count(*) AS count FROM subjects').get()?.count,1);
 }finally{f.close()}
});

test('approved edition enrichment updates a blank page count by exact ISBN without replacing it later',async()=>{
 const f=fixture();
 try{
  const first=await f.send({action:'identifier',editionId:'ed-a',code:'ISBN13',value:'9780306406157'});
  assert.equal(first.status,200);
  const result=await f.send({action:'enrichPageCount',editionId:'ed-a',isbn13:'9780306406157',
    pageCount:314,expectedRevision:1,confirmed:true,rightsReviewed:true});
  assert.equal(result.status,200,await result.text());
  assert.equal(f.db.prepare("SELECT page_count AS pages FROM editions WHERE id='ed-a'").get()?.pages,314);
  const rejected=await f.send({action:'enrichPageCount',editionId:'ed-a',isbn13:'9780306406157',
    pageCount:399,expectedRevision:2,confirmed:true,rightsReviewed:true});
  assert.equal(rejected.status,409);
  assert.equal(f.db.prepare("SELECT page_count AS pages FROM editions WHERE id='ed-a'").get()?.pages,314);
  const audit=f.db.prepare("SELECT COUNT(*) AS count FROM catalogue_audit_log WHERE action='approved_page_count_enrichment'").get();
  assert.equal(audit?.count,1);
 }finally{f.close()}
});
test('ISBN mismatch or missing explicit source rights review cannot enrich the catalogue',async()=>{
 const f=fixture();
 try{
  await f.send({action:'identifier',editionId:'ed-a',code:'ISBN13',value:'9780306406157'});
  const incorrect=await f.send({action:'enrichPageCount',editionId:'ed-a',isbn13:'9781861972712',
    pageCount:100,expectedRevision:1,confirmed:true,rightsReviewed:true});
  assert.equal(incorrect.status,409);
  const unapproved=await f.send({action:'enrichPageCount',editionId:'ed-a',isbn13:'9780306406157',
    pageCount:100,expectedRevision:1,confirmed:true,rightsReviewed:false});
  assert.equal(unapproved.status,409);
  assert.equal(f.db.prepare("SELECT page_count AS pages FROM editions WHERE id='ed-a'").get()?.pages,null);
 }finally{f.close()}
});
