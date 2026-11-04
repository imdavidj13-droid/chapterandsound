import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {catalogueBookMetadataAPI} from '../src/worker/catalogue-book-metadata-api';
import {validIsbn13,validIsbn10} from '../src/worker/catalogue-manual-api';

function fixture(options:{belongs?:boolean;collision?:boolean}={}){
 let batches=0;
 const database={
  prepare(sql:string){
   const query={
    bind(...params:(string|number|null)[]){void params;return query;},
    async first<T>():Promise<T|null>{
     if(sql.includes('FROM works WHERE id=?'))return {id:'w1',status:'draft'} as T;
     if(sql.includes('FROM editions WHERE id=? AND work_id=?'))return options.belongs===false?null:{id:'e1'} as T;
     if(sql.includes('i.normalized_value=?'))return options.collision?{id:'different-book-id'} as T:null;
     if(sql.includes('FROM identifier_schemes WHERE code=?'))return {id:'scheme1'} as T;
     return null;
    },
    async all<T>():Promise<{results:T[]}>{return {results:[]};},
    async run(){return {meta:{changes:1}};}
   };
   return query;
  },
  async batch(){batches++;return [{meta:{changes:1}}];}
 };
 return {database,batches:()=>batches};
}
function call(db:ReturnType<typeof fixture>['database'],payload:Record<string,unknown>){
 return catalogueBookMetadataAPI(new Request('https://example.test/api/catalogue-admin/works/w1/metadata',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
 }),db,'administrator','w1');
}
test('identifier updates reject invalid ISBN-13 before database writes',async()=>{
 const f=fixture();
 const response=await call(f.database,{action:'identifier',editionId:'e1',code:'ISBN13',value:'9780306406158'});
 assert.equal(response.status,400);
 assert.equal(f.batches(),0);
});
test('metadata changes cannot be applied to an edition from another book',async()=>{
 const f=fixture({belongs:false});
 const response=await call(f.database,{action:'identifier',editionId:'e_other',code:'ISBN13',value:'9780306406157'});
 assert.equal(response.status,404);
 assert.equal(f.batches(),0);
});
test('ISBN already used on another record cannot be assigned to this edition',async()=>{
 const f=fixture({collision:true});
 const response=await call(f.database,{action:'identifier',editionId:'e1',code:'ISBN13',value:'9780306406157'});
 assert.equal(response.status,409);
 assert.equal(f.batches(),0);
});
test('valid ISBN can be saved through the audited batch',async()=>{
 const f=fixture();
 const response=await call(f.database,{action:'identifier',editionId:'e1',code:'ISBN13',value:'9780306406157'});
 assert.equal(response.status,200);
 assert.equal((await response.json() as {saved:boolean}).saved,true);
 assert.equal(f.batches(),1);
});

test('publisher ISBN 9781407084350 is valid and uses the canonical ISBN-13 checksum',async()=>{
 assert.equal(validIsbn13('9781407084350'),true);
 assert.equal(validIsbn13('978-1-4070-8435-0'),true);
 assert.equal(validIsbn13('9781407084351'),false);
 const f=fixture();
 const response=await call(f.database,{action:'identifier',editionId:'e1',code:'ISBN13',value:'9781407084350'});
 assert.equal(response.status,200);
 assert.equal(f.batches(),1);
});
test('ISBN-10 and ISBN-13 validators remain distinct',()=>{
 assert.equal(validIsbn10('0593049780'),true);
 assert.equal(validIsbn13('0593049780'),false);
});
