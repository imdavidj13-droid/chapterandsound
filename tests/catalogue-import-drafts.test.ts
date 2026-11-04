import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {importCatalogueDrafts,ImportConflict} from '../src/worker/catalogue-import-drafts';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL(file,dir),'utf8'));
 }
 function statement(sql:string){
  let params:(string|number|null)[]=[];
  const item={
   bind(...values:(string|number|null)[]){params=values;return item},
   async first<T>():Promise<T|null>{return db.prepare(sql).get(...params) as T|null},
   async all<T>():Promise<{results:T[]}>{return {results:db.prepare(sql).all(...params) as T[]}},
   async run(){const outcome=db.prepare(sql).run(...params);return {meta:{changes:Number(outcome.changes)}}}
  };
  return item;
 }
 const driver={
  prepare:statement,
  async batch(items:ReturnType<typeof statement>[]){
   db.exec('BEGIN');
   try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results}
   catch(error){db.exec('ROLLBACK');throw error}
  }
 };
 return {db,driver};
}
const draft=(overrides:Record<string,unknown>={})=>({
 sourceId:'openlibrary',sourceKey:'/works/OL100W',workSourceKey:'/works/OL100W',
 title:'Test Novel',author:'Test Writer',authorSourceKeys:['/authors/OL10A'],
 description:'This is a sample synopsis.',subjects:['Mystery'],
 originalLanguage:'eng',firstPublicationDate:'2010',
 editions:[{sourceKey:'/books/OL100M',isbn13:'9780306406157',format:'paperback',
  publisher:'Example Press',publicationDate:'2010',language:'eng',pageCount:340}],
 ...overrides
});
test('approved draft creates work, author, edition, identifiers, publisher and audit atomically',async()=>{
 const {db,driver}=fixture();
 try{
  const result=await importCatalogueDrafts(driver,[draft()],'owner-fixture');
  assert.equal(result.saved,true);
  assert.equal(result.published,false);
  assert.equal(result.editionCount,1);
  assert.equal(db.prepare('SELECT status FROM works').get()?.status,'draft');
  assert.equal(db.prepare('SELECT verification_status FROM editions').get()?.verification_status,'draft');
  assert.equal(db.prepare('SELECT publication_status FROM editions').get()?.publication_status,'draft');
  assert.equal(db.prepare('SELECT preferred_name FROM people').get()?.preferred_name,'Test Writer');
  assert.equal(db.prepare('SELECT normalized_value FROM entity_identifiers').get()?.normalized_value,'9780306406157');
  assert.equal(db.prepare('SELECT body FROM text_content WHERE content_type=?').get('synopsis')?.body,'This is a sample synopsis.');
  assert.equal(db.prepare('SELECT count(*) AS n FROM publication_events').get()?.n,1);
  const audit=db.prepare("SELECT details_json FROM catalogue_audit_log WHERE action='import_draft'").get() as {details_json:string};
  assert.equal(JSON.parse(audit.details_json).workSourceKey,'/works/OL100W');
 }finally{db.close()}
});
test('repeat source import is blocked and does not create another work',async()=>{
 const {db,driver}=fixture();
 try{
  await importCatalogueDrafts(driver,[draft()],'owner-fixture');
  await assert.rejects(()=>importCatalogueDrafts(driver,[draft()],'owner-fixture'),ImportConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,1);
 }finally{db.close()}
});
test('existing author identity cannot be silently merged by matching name',async()=>{
 const {db,driver}=fixture();
 try{
  db.prepare("INSERT INTO people(id,preferred_name) VALUES('existing-author','Test Writer')").run();
  await assert.rejects(()=>importCatalogueDrafts(driver,[draft()],'owner-fixture'),
   /confirmed canonical authorId/);
  const result=await importCatalogueDrafts(driver,[draft({authorId:'existing-author'})],'owner-fixture');
  assert.equal(result.saved,true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get()?.n,1);
  assert.equal(db.prepare("SELECT person_id FROM contributions WHERE role_code='author'").get()?.person_id,'existing-author');
 }finally{db.close()}
});
test('mixed batch with repeated ISBN is rejected before any writes',async()=>{
 const {db,driver}=fixture();
 try{
  await assert.rejects(()=>importCatalogueDrafts(driver,[
   draft(),draft({sourceKey:'/works/OL101W',workSourceKey:'/works/OL101W',title:'Another Title',
    editions:[{sourceKey:'/books/OL101M',isbn13:'9780306406157',format:'ebook',
     language:'eng',publisher:'Example Press',publicationDate:'2011'}]})
  ],'owner-fixture'),ImportConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,0);
 }finally{db.close()}
});
test('incomplete work, unknown format, and audiobook without recording metadata cannot import',async()=>{
 const {db,driver}=fixture();
 try{
  await assert.rejects(()=>importCatalogueDrafts(driver,[draft({editions:[]})],'owner-fixture'),ImportConflict);
  await assert.rejects(()=>importCatalogueDrafts(driver,[draft({
   editions:[{sourceKey:'/books/OL100M',format:'audiobook',isbn13:'9780306406157'}]
  })],'owner-fixture'),ImportConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()?.n,0);
 }finally{db.close()}
});
