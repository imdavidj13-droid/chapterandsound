import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error reviewed JavaScript probe has no emitted declarations.
import {pilotIsbns,extractTitle,probePenguinRandomHouse} from '../scripts/research-prh-isbns.mjs';
const input={candidates:[{title:'Relentless',author:'Simon Kernick',editions:[
 {sourceKey:'/books/OL1M',isbn13:'9781407095301',isbn13Candidates:['9781407095301']},
 {sourceKey:'/books/OL2M',isbn13:'9781407414256'}
]}]};
test('deduplicates ISBN candidate variants and preserves edition identity',()=>{
 const list=pilotIsbns(input);
 assert.equal(list.length,2);
 assert.deepEqual(list[0]!.editionSourceKeys,['/books/OL1M']);
});
test('accepts exact ISBN+title but does not invent missing PRH fields',()=>{
 const x=extractTitle({data:{title:{isbn:'9781407095301',title:'Relentless',
   formatName:'Ebook',imprint:'Corgi',onSaleDate:'2011-05-01',projectedMinutes:null}}},
  '9781407095301','Relentless');
 assert.equal(x.status,'matched');
 assert.equal(x.fields.formatLabel,'Ebook');
 assert.equal(x.fields.runtimeMinutes,undefined);
});
test('rejects cross-ISBN record and mismatched book identity',()=>{
 assert.equal(extractTitle({data:{title:{isbn:'9781407414256',title:'Relentless'}}},
  '9781407095301','Relentless').status,'isbn_mismatch');
 assert.equal(extractTitle({data:{title:{isbn:'9781407095301',title:'Different Book'}}},
  '9781407095301','Relentless').status,'title_mismatch');
});
test('searches UK domain first, skips misses, and never leaks the API key in output',async()=>{
 const calls:string[]=[];
 const response=await probePenguinRandomHouse(input,{key:'dummy-secret-token',limit:1,delay:0,
  domainsToQuery:['PRH.UK','PRH.US'],fetchImpl:async (u:URL)=>{
   calls.push(u.pathname);
   if(u.pathname.includes('PRH.UK'))return {status:404,ok:false};
   return {status:200,ok:true,json:async()=>({data:{title:{
    isbn:'9781407095301',title:'Relentless',formatName:'Ebook',pages:320}}})};
  }});
 assert.deepEqual(calls.map(x=>x.includes('PRH.UK')?'UK':'US'),['UK','US']);
 assert.equal(response.totals.matched,1);
 assert.equal(JSON.stringify(response).includes('dummy-secret-token'),false);
});
test('stops safely on inactive or forbidden API key',async()=>{
 let requests=0;
 const response=await probePenguinRandomHouse(input,{key:'dummy',limit:2,delay:0,
  fetchImpl:async()=>{requests++;return {status:403,ok:false}}});
 assert.equal(response.status,'authentication_error');
 assert.equal(requests,1);
});
