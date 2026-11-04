import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Plain JavaScript runtime script without TypeScript declarations.
import {reconcilePublisher} from '../scripts/reconcile-publisher-isbns.mjs';
const isbn='9780552164337';
const fact={isbn13:isbn,title:'Relentless',author:'Simon Kernick',format:'paperback',
 imprint:'Corgi',publicationDate:'2011-05-12',pageCount:464,
 sourceUrl:'https://www.penguin.co.uk/books/349671/relentless-by-kernick-simon/9780552164337',checkedOn:'2026-11-04'};
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({title:i===0?'Relentless':'Book '+i,
 author:'Simon Kernick',workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?isbn:null,format:'unknown',publisher:'',publicationDate:'',pageCount:null}]}))});
test('publisher exact ISBN populates missing fields and preserves original manifest',()=>{
 const input=fixture();
 const result=reconcilePublisher(input,{records:[fact]});
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
 assert.equal(result.candidates.candidates[0].editions[0].format,'paperback');
 assert.equal(result.candidates.candidates[0].editions[0].publicationDate,'2011-05-12');
 assert.equal(result.report.totals.newlyFilledFields,3);
 assert.equal(result.report.totals.matchedEdtions,1);
 assert.equal(result.report.totals.remainingUnknownFormats,9);
 assert.equal(result.candidates.candidates[0].editions[0].publisher,'');
});
test('publisher disagreements are reported, never overwritten',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.format='hardback';
 const result=reconcilePublisher(input,{records:[fact]});
 assert.equal(result.candidates.candidates[0].editions[0].format,'hardback');
 assert.equal(result.report.conflicts.length,1);
});
test('missing ISBN cannot create new edition or silently join by title',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13=null;
 const result=reconcilePublisher(input,{records:[fact]});
 assert.equal(result.report.totals.unmatchedEvidence,1);
 assert.equal(result.report.totals.matchedEdtions,0);
});
test('disallows duplicate evidence for same ISBN',()=>{
 assert.throws(()=>reconcilePublisher(fixture(),{records:[fact,fact]}),/Duplicate publisher ISBN/);
});
