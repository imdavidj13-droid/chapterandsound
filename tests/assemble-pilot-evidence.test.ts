import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error Companion CLI is plain JavaScript without a declaration file.
import {assemble,run} from '../scripts/assemble-pilot-evidence.mjs';
const fixture=()=>{
 const candidates=Array.from({length:10},(_,i)=>({
  title:'Book '+i,author:'Sample Author',workSourceKey:'/works/OL'+(i+1)+'W',
  authorSourceKeys:['/authors/OL1A'],identityStatus:'provisional_review_required',
  description:'Some description',firstPublicationDate:'2001',
  editions:[{sourceKey:'/books/OL'+(i+1)+'M',format:'unknown'}]
 }));
 return {enriched:{candidates},covers:{results:candidates.map(b=>({title:b.title,workSourceKey:b.workSourceKey,
 status:'available',editionSourceKey:b.editions[0]?.sourceKey,displayUrl:'https://covers.openlibrary.org/b/id/1-L.jpg'}))},
 audio:{books:candidates.map(b=>({title:b.title,workSourceKey:b.workSourceKey,status:'no_verified_identity_candidates',candidates:[]}))},
 wikidata:{books:candidates.map(b=>({title:b.title,workSourceKey:b.workSourceKey,status:'no_search_results',candidates:[]}))}};
};
test('one evidence bundle preserves ten canonical identities and blocks import',()=>{
 const result=assemble(fixture());
 assert.equal(result.totals.works,10);
 assert.equal(result.totals.unknownEditions,10);
 assert.equal(result.totals.coverUrlsAvailable,10);
 assert.equal(result.books[0].importEligible,false);
 assert.equal(result.books[0].publicationEligible,false);
 assert.equal(result.books[0].authorSourceKeys[0],'/authors/OL1A');
});
test('rejects unrelated source report instead of merging by title alone',()=>{
 const data=fixture();
 data.covers.results[0]!.workSourceKey='/works/OL999W';
 assert.throws(()=>assemble(data),/identity mismatch/);
});

test('CLI reads all five named options and emits a unified report',()=>{
 const directory=mkdtempSync(join(tmpdir(),'cs-unified-evidence-'));
 try{
  const data=fixture();
  const args:string[]=[];
  for(const [flag,key] of [['--enriched','enriched'],['--covers','covers'],['--audio','audio'],['--wikidata','wikidata']] as const){
   const file=join(directory,key+'.json');
   writeFileSync(file,JSON.stringify(data[key]));
   args.push(flag,file);
  }
  args.push('--out',join(directory,'out'));
  const result=run(args);
  assert.equal(result.totals.works,10);
  const actual=JSON.parse(readFileSync(join(directory,'out','ten-book-unified-evidence.json'),'utf8'));
  assert.equal(actual.books.length,10);
  assert.equal(actual.books[0].importEligible,false);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
