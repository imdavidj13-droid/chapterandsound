import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript CLI module lacks TypeScript declarations.
import {queueUnknown,evaluateGoogle,resolvePilot} from '../scripts/resolve-multi-source-isbns.mjs';
const isbn='9780593054703';
const sample=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Other '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+(i+1)+'W',sourceWorkKeys:['/works/OL'+(i+1)+'W'],
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?isbn:null,format:'unknown'}]
}))});
const ol={key:'/books/OL1M',title:'Relentless',works:[{key:'/works/OL1W'}],
 isbn_13:[isbn],physical_format:'Hardcover'};
const google={items:[{volumeInfo:{title:'Relentless',authors:['Simon Kernick'],
 industryIdentifiers:[{type:'ISBN_13',identifier:isbn}]},saleInfo:{isEbook:true}}]};
test('selects valid exact ISBNs without work or edition duplication',()=>{
 const result=queueUnknown(sample());
 assert.equal(result.unknownWithIsbn,1);
 assert.equal(result.queue[0].ed.isbn13,isbn);
});
test('Google book identity match does not make an ebook classification',()=>{
 const [book]=sample().candidates;
 assert.equal(evaluateGoogle(book,book!.editions[0],google),'identity_matched');
 assert.equal(evaluateGoogle(book,book!.editions[0],{items:[]}), 'no_result');
 assert.equal(evaluateGoogle(book,book!.editions[0],{items:[{volumeInfo:{
  title:'Relentless',authors:['Simon Kernick'],industryIdentifiers:[{type:'ISBN_13',identifier:'9780593054710'}]}}]}),'isbn_mismatch');
});
test('exact Open Library physical format gives provisional format without changing source',async()=>{
 const input=sample();
 const result=await resolvePilot(input,{
  openLibrary:async()=>ol,googleBooks:async()=>google
 });
 assert.equal(result.totals.provisionalOpenLibraryFormats,1);
 assert.equal(result.findings[0].openLibrary.format,'hardback');
 assert.equal(result.findings[0].googleBooks.status,'identity_matched');
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
 assert.equal(result.importEligible,false);
});
test('errors and missing results are counted separately',async()=>{
 const result=await resolvePilot(sample(),{
  openLibrary:async()=>{throw Error('429')},googleBooks:async()=>({items:[]})
 });
 assert.equal(result.sources.openLibrary.error,1);
 assert.equal(result.sources.googleBooks.no_result,1);
 assert.equal(result.totals.provisionalOpenLibraryFormats,0);
});
test('Open Library mismatched work never proposes a format',async()=>{
 const result=await resolvePilot(sample(),{
  openLibrary:async()=>({...ol,works:[{key:'/works/OL999W'}]}),
  googleBooks:async()=>({items:[]})
 });
 assert.equal(result.sources.openLibrary.mismatch,1);
 assert.equal(result.totals.provisionalOpenLibraryFormats,0);
});
