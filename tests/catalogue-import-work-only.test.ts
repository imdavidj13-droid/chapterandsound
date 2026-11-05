import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {previewWorkOnlyDraft,importWorkOnlyDraft,WorkOnlyConflict} from '../src/worker/catalogue-import-work-only';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort())
  db.exec(readFileSync(new URL(file,dir),'utf8'));
 function statement(sql:string){
  let params:(string|number|null)[]=[];
  const item={
   bind(...values:(string|number|null)[]){params=values;return item},
   async first<T>():Promise<T|null>{return db.prepare(sql).get(...params) as T|null},
   async all<T>():Promise<{results:T[]}>{return {results:db.prepare(sql).all(...params) as T[]}},
   async run(){const result=db.prepare(sql).run(...params);return {meta:{changes:Number(result.changes)}}}
  };
  return item;
 }
 return {db,driver:{prepare:statement,async batch(items:ReturnType<typeof statement>[]){
  db.exec('BEGIN');
  try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results}
  catch(error){db.exec('ROLLBACK');throw error}
 }}};
}
const work=(overrides:Record<string,unknown>={})=>({
 sourceId:'openlibrary',workSourceKey:'/works/OL123W',
 title:'Book With Unverified Editions',author:'Example Writer',
 authorSourceKeys:['/authors/OL45A'],editions:[],
 firstPublicationDate:'2019',originalLanguage:'eng',description:'Not for bulk copying',
 ...overrides
});
test('work-only preview is read only and the explicit importer creates no editions or text',async()=>{
 const {db,driver}=fixture();
 try{
  const preview=await previewWorkOnlyDraft(driver,work());
  assert.equal(preview.decision,'create_work_draft');
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,0);
  const added=await importWorkOnlyDraft(driver,work(),'owner-test');
  assert.equal(added.status,'draft');
  assert.equal(added.published,false);
  assert.equal(added.editionCount,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get()?.n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM editions').get()?.n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM entity_identifiers').get()?.n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM media_links').get()?.n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM text_content').get()?.n,0);
  assert.equal(db.prepare("SELECT action FROM catalogue_audit_log").get()?.action,'import_work_only_draft');
 }finally{db.close()}
});
test('repeat source key is rejected without duplicate records',async()=>{
 const {db,driver}=fixture();
 try{
  await importWorkOnlyDraft(driver,work(),'owner-test');
  await assert.rejects(()=>importWorkOnlyDraft(driver,work(),'owner-test'),WorkOnlyConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,1);
 }finally{db.close()}
});
test('existing author name is not silently duplicated or merged',async()=>{
 const {db,driver}=fixture();
 try{
  db.prepare("INSERT INTO people(id,preferred_name) VALUES('old-person','Example Writer')").run();
  const preview=await previewWorkOnlyDraft(driver,work());
  assert.equal(preview.decision,'review');
  await assert.rejects(()=>importWorkOnlyDraft(driver,work(),'owner-test'),WorkOnlyConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get()?.n,1);
 }finally{db.close()}
});
test('unknown edition, multi-author, or unverified work source are blocked',async()=>{
 const {db,driver}=fixture();
 try{
  for(const bad of [
   work({editions:[{sourceKey:'/books/OL77M'}]}),
   work({authorSourceKeys:['/authors/OL1A','/authors/OL2A']}),
   work({workSourceKey:'/works/INVALID'}),
   work({sourceId:'isbndb'})
  ])assert.equal((await previewWorkOnlyDraft(driver,bad)).decision,'review');
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,0);
 }finally{db.close()}
});
