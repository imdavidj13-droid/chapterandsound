import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error CLI JavaScript module has no generated type declarations.
import {extractPilotIsbns,classifyBinding,interpretBook,probeIsbndb} from '../scripts/research-isbndb-isbns.mjs';
const sample=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Work '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?'9781407095301':null,format:'unknown'}]
}))});
test('exact ISBN selection deduplicates within same canonical work',()=>{
 const input=sample();input.candidates[0]!.editions.push({
  sourceKey:'/books/OL33M',isbn13:'9781407095301',format:'unknown'
 });
 const rows=extractPilotIsbns(input);
 assert.equal(rows.length,1);assert.equal(rows[0].editionSourceKeys.length,2);
});
test('large print is not itself a binding',()=>{
 assert.deepEqual(classifyBinding('Large Print'),{format:null,largePrint:true});
 assert.equal(classifyBinding('Large Print Paperback').format,'paperback');
 assert.equal(classifyBinding('Hardback and Paperback').format,null);
});
test('only matching ISBN and work identity may propose an explicit format',()=>{
 const row=extractPilotIsbns(sample())[0];
 const raw={isbn13:row.isbn13,title:'Relentless',authors:['Simon Kernick'],
  binding:'Ebook',publisher:'Bantam',synopsis:'copyrighted text',image:'https://example.com/cover'};
 const result=interpretBook({book:raw},row);
 assert.equal(result.status,'identity_matched');assert.equal(result.fields.format,'ebook');
 assert.equal(JSON.stringify(result).includes('copyrighted text'),false);
 assert.equal(JSON.stringify(result).includes('example.com/cover'),false);
 assert.equal(interpretBook({book:{...raw,isbn13:'9781407093901'}},row).status,'isbn_mismatch');
 assert.equal(interpretBook({book:{...raw,title:'Unrelated'}},row).status,'title_mismatch');
});
test('key is used only in Authorization header and never persisted',async()=>{
 const row=extractPilotIsbns(sample())[0];let auth='';
 const result=await probeIsbndb(sample(),{key:'test-secret',limit:1,
  fetchImpl:async (_url: string,options: {headers: {Authorization:string}})=>{
   auth=options.headers.Authorization;
   return {status:200,ok:true,json:async()=>({book:{isbn13:row.isbn13,
    title:'Relentless',authors:['Simon Kernick'],binding:'Paperback'}})};
  }});
 assert.equal(auth,'test-secret');assert.equal(result.totals.matched,1);
 assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('authentication errors stop additional requests',async()=>{
 let calls=0;
 const result=await probeIsbndb(sample(),{key:'test',limit:5,
  fetchImpl:async()=>{calls++;return {status:403,ok:false}}});
 assert.equal(calls,1);assert.equal(result.status,'authentication_error');
});
