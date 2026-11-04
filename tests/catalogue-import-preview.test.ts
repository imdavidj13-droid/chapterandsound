import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {previewCatalogueImport} from '../src/worker/catalogue-import-preview';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const filename of readdirSync(dir).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort()){
  db.exec(readFileSync(new URL(filename,dir),'utf8'));
 }
 db.prepare("INSERT INTO works(id,canonical_title,status) VALUES('w1','The Business Of Dying','published')").run();
 db.prepare("INSERT INTO people(id,preferred_name) VALUES('p1','Simon Kernick')").run();
 db.prepare("INSERT INTO contributions(id,work_id,person_id,role_code) VALUES('c1','w1','p1','author')").run();
 db.prepare("INSERT INTO editions(id,work_id,format) VALUES('e1','w1','ebook')").run();
 db.prepare("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES('s1','ISBN13','edition','global')").run();
 db.prepare("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES('i1','s1','edition','e1','9781407084350','9781407084350')").run();
 const driver={
  prepare(query:string){
   let params:(string|number|null)[]=[];
   const statement={
    bind(...values:(string|number|null)[]){params=values;return statement},
    async all<T>():Promise<{results:T[]}>{return {results:db.prepare(query).all(...params) as T[]}}
   };
   return statement;
  }
 };
 return {db,driver};
}
test('a published ISBN is matched to its existing edition without a write',async()=>{
 const {db,driver}=fixture();
 try{
  const before=db.prepare('SELECT count(*) AS n FROM works').get()!.n;
  const result=await previewCatalogueImport(driver,[{title:'The Business Of Dying',author:'Simon Kernick',isbn13:'9781407084350',format:'ebook'}]);
  assert.equal(result.dryRun,true);
  assert.equal(result.rows[0]?.decision,'existing_edition');
  assert.equal(result.rows[0]?.existingWorkId,'w1');
  assert.equal(result.rows[0]?.existingEditionId,'e1');
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()!.n,before);
 }finally{db.close()}
});
test('exact title/author match is held for identity review even without ISBN',async()=>{
 const {db,driver}=fixture();
 try{
  const result=await previewCatalogueImport(driver,[{title:'The Business Of Dying',author:'Simon Kernick'}]);
  assert.equal(result.rows[0]?.decision,'review_match');
  assert.equal(result.rows[0]?.matches?.[0]?.id,'w1');
 }finally{db.close()}
});
test('a prospective new work can be previewed but never written',async()=>{
 const {db,driver}=fixture();
 try{
  const preview=await previewCatalogueImport(driver,[{title:'A New Novel',author:'Another Writer',isbn13:'9780306406157'}]);
  assert.equal(preview.rows[0]?.decision,'needs_enrichment');
  assert.ok(preview.rows[0]?.quality.missing.includes('work.editions (edition-level records required)'));
  assert.equal(preview.rows[0]?.quality.ready,false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM works').get()!.n,1);
 }finally{db.close()}
});
test('invalid ISBN, duplicate batch entries and malformed manifest are rejected safely',async()=>{
 const {db,driver}=fixture();
 try{
  const result=await previewCatalogueImport(driver,[
   {title:'Novel',author:'Someone',isbn13:'9781407084351'},
   {title:'Other Novel',author:'Someone',isbn13:'9780306406157'},
   {title:'Other Novel',author:'Someone',isbn13:'9780306406157'}
  ]);
  assert.deepEqual(result.rows.map(x=>x.decision),['invalid','needs_enrichment','duplicate_in_batch']);
  await assert.rejects(()=>previewCatalogueImport(driver,Array.from({length:101},()=>({title:'x',author:'y'}))),/1–100/);
  await assert.rejects(()=>previewCatalogueImport(driver,null),/1–100/);
 }finally{db.close()}
});
