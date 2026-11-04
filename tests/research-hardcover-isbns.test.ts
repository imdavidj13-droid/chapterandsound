import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Plain JS connector has no declarations.
import {QUERY,pending,formatOf,evaluate,inspect} from '../scripts/research-hardcover-isbns.mjs';
const isbn='9781407095301';
const manifest=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Book '+i,author:'Simon Kernick',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?isbn:null,format:'unknown'}]
}))});
const response=(format='ebook')=>({data:{editions:[{
 id:17,isbn_13:isbn,edition_format:format,physical_format:null,
 reading_format:{format:'Ebook'},
 book:{id:5,title:'Relentless',contributions:[{author:{name:'Kernick, Simon'}}]}
}]}});
test('uses exact ISBN variable not interpolated GraphQL',()=>{
 assert.match(QUERY,/\$isbn: String!/);
 assert.match(QUERY,/isbn_13: \{_eq: \$isbn\}/);
 assert.equal(pending(manifest()).total,1);
});
test('classifies exact edition format and leaves physical ambiguous',()=>{
 assert.equal(formatOf({edition_format:'Hardcover'}).format,'hardback');
 assert.equal(formatOf({edition_format:'Paperback'}).format,'paperback');
 assert.equal(formatOf({reading_format:{format:'Physical'}}).status,'no_explicit_format');
 assert.equal(formatOf({edition_format:'Paperback',physical_format:'Hardcover'}).status,'format_conflict');
});
test('matching ISBN, title and surname-first author yields provisional format',()=>{
 const book=manifest().candidates[0]!;
 assert.equal(evaluate(book,book.editions[0],response()).format,'ebook');
 assert.equal(evaluate(book,book.editions[0],response()).status,'provisional_format');
});
test('wrong ISBN and wrong author cannot fill format',()=>{
 const book=manifest().candidates[0]!;
 assert.equal(evaluate(book,book.editions[0],{data:{editions:[{...response().data.editions[0],isbn_13:'9780593054703'}]}}).status,'isbn_mismatch');
 assert.equal(evaluate(book,book.editions[0],{data:{editions:[{...response().data.editions[0],book:{
 title:'Relentless',contributions:[{author:{name:'Different Person'}}]}}]}}).status,'identity_mismatch');
});
test('test fixture never mutates canonical candidates',async()=>{
 const input=manifest();
 const result=await inspect(input,async()=>response(),{max:1});
 assert.equal(result.totals.provisionalFormats,1);
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
 assert.equal(result.importEligible,false);
});
test('HTTP 429 stops further requests',async()=>{
 const input=manifest();
 input.candidates[1]!.editions[0]!.isbn13='9780593054703';
 let calls=0;
 const result=await inspect(input,async()=>{calls++;throw Error('HTTP 429')});
 assert.equal(calls,1);
 assert.equal(result.statusCounts.error,1);
 assert.equal(result.statusCounts.skipped,1);
});
