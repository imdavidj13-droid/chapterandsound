import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript CLI does not have generated type definitions.
import {enrich,evaluate,parseFormat} from '../scripts/recheck-openlibrary-edition-formats.mjs';
const isbn='9780593054703';
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Book '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+(i+1)+'W',sourceWorkKeys:['/works/OL'+(i+1)+'W'],
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?isbn:null,
  isbn10:null,format:'unknown',fieldProvenance:{}}]
}))});
const raw={key:'/books/OL1M',title:'Relentless',
 works:[{key:'/works/OL1W'}],isbn_13:[isbn],physical_format:'Hardcover'};
test('classifies only explicit physical format',()=>{
 assert.equal(parseFormat('Hardcover'),'hardback');
 assert.equal(parseFormat('paperback'),'paperback');
 assert.equal(parseFormat('Audio CD'),'audiobook');
 assert.equal(parseFormat('large print'),null);
 assert.equal(parseFormat(''),null);
});
test('exact edition, work and ISBN allow local-only enrichment',async()=>{
 const original=fixture();
 const output=await enrich(original,async path=>path==='/books/OL1M.json'?raw:null);
 assert.equal(output.report.totals.formatsResolved,1);
 assert.equal(output.report.totals.remainingUnknownFormats,9);
 assert.equal(output.candidates.candidates[0].editions[0].format,'hardback');
 assert.equal(original.candidates[0]!.editions[0]!.format,'unknown');
});
test('ISBN and canonical work mismatches fail closed',()=>{
 const input=fixture(),book=input.candidates[0],ed=book!.editions[0];
 assert.equal(evaluate(book,ed,{...raw,isbn_13:['9780593054710']}).status,'isbn_mismatch');
 assert.equal(evaluate(book,ed,{...raw,works:[{key:'/works/OL99W'}]}).status,'work_mismatch');
 assert.equal(evaluate(book,ed,{...raw,key:'/books/OL99M'}).status,'edition_mismatch');
});
test('request failures do not abort queue or invent results',async()=>{
 const output=await enrich(fixture(),async()=>{throw Error('HTTP 429')},2);
 assert.equal(output.report.totals.failures,2);
 assert.equal(output.report.totals.formatsResolved,0);
});
