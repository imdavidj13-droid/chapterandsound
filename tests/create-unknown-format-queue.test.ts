import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript script has no TS declarations.
import {createFormatResearchQueue} from '../scripts/create-unknown-format-queue.mjs';
const input=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:'Book '+i,author:'Simon Kernick',workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',
  isbn13:i===0?'9780552164337':null,
  isbn10:i===1?'0552156906':null,
  isbn13Candidates:i===0?['9780552164337']:[],
  format:i===2?'paperback':'unknown'}]
}))});
test('includes only unknown formats with edition identity and no inferred format',()=>{
 const raw=input(),result=createFormatResearchQueue(raw);
 assert.equal(result.totals.unknownEditions,9);
 assert.equal(result.totals.withISBN,2);
 assert.equal(result.totals.withoutISBN,7);
 assert.equal(result.queue[0].isbn13,'9780552164337');
 assert.equal(result.queue[0].status,'requires_external_evidence');
 assert.equal(raw.candidates[0]!.editions[0]!.format,'unknown');
});
test('duplicate edition keys are rejected',()=>{
 const raw=input();
 raw.candidates[1]!.editions[0]!.sourceKey=raw.candidates[0]!.editions[0]!.sourceKey;
 assert.throws(()=>createFormatResearchQueue(raw),/duplicate or invalid source identity/);
});
test('shared ISBNs are reported instead of silently merging editions',()=>{
 const raw=input();
 raw.candidates[1]!.editions[0]!.isbn13='9780552164337';
 const result=createFormatResearchQueue(raw);
 assert.equal(result.totals.sharedISBNGroups,1);
 assert.equal(result.ambiguousISBNs[0].editionSourceKeys.length,2);
});
