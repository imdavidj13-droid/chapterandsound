import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JS CLI does not have declarations.
import {consolidatePilot} from '../scripts/consolidate-pilot-format-evidence.mjs';

const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Work '+i,
 author:'Simon Kernick',workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',
  isbn13:i===0?'9781407095301':null,
  publisher:i===0?'Penguin Random House':null,
  format:'unknown',fieldProvenance:{}}]
}))});
const fact={title:'Relentless',editionSourceKey:'/books/OL1M',
 isbn13:'9781407095301',format:'ebook',feature:null,
 source:'official_publisher',sourceUrl:'https://example.org/book/9781407095301'};
const batch=(records:unknown[])=>({records,reviewOnly:true,importEligible:false});
test('consolidates evidence without mutating input; queues ISBN and ISBN-less separately',()=>{
 const input=fixture(),result=consolidatePilot(input,[batch([fact])]);
 assert.equal(result.report.delta.formatsResolved,1);
 assert.equal(result.report.totals.knownFormats,1);
 assert.equal(result.report.totals.unknownFormats,9);
 assert.equal(result.report.remaining.withoutISBN,9);
 assert.equal(result.report.remaining.withISBN,0);
 assert.equal(result.evidence.records[0].evidenceTier,'publisher_observation');
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
});
test('rerun on already consolidated manifest adds no changes and retains provenance',()=>{
 const first=consolidatePilot(fixture(),[batch([fact])]);
 const next=consolidatePilot(first.manifest,[batch([fact])]);
 assert.equal(next.report.delta.formatsResolved,0);
 assert.equal(next.report.totals.unknownFormats,9);
 assert.equal(next.manifest.candidates[0].editions[0].fieldProvenance.format.isbn13,fact.isbn13);
});
test('conflicting edition data fails before any output',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.format='hardback';
 assert.throws(()=>consolidatePilot(input,[batch([fact])]),/conflicts and 0 unmatched/);
});
test('mismatched ISBN and contradictory batches fail closed',()=>{
 assert.throws(()=>consolidatePilot(fixture(),[batch([{...fact,isbn13:'9781407093901'}])]),/unmatched/);
 assert.throws(()=>consolidatePilot(fixture(),[batch([fact]),batch([{...fact,format:'paperback'}])]),/Contradictory evidence/);
});
test('publisher field cannot imply format, even when ISBN is missing',()=>{
 const result=consolidatePilot(fixture(),[batch([])]);
 assert.equal(result.report.totals.unknownFormats,10);
 assert.equal(result.queue.queue[0].researchRoute,'exact_isbn_publisher_or_national_bibliography');
 assert.equal(result.queue.queue[1].researchRoute,'edition_identity_no_isbn');
});

test('keeps valid source-qualified audiobook editions and prevents source-key collisions',()=>{
 const input=fixture();
 input.candidates[0]!.editions.push({
  sourceKey:'storytel:isbn13:9781407426464',isbn13:'9781407426464',
  format:'audiobook',publisher:null,fieldProvenance:{}
 });
 const result=consolidatePilot(input,[batch([fact])]);
 assert.equal(result.report.totals.editions,11);
 assert.equal(result.report.totals.knownFormats,2);
 assert.equal(result.manifest.candidates[0].editions[1].sourceKey,'storytel:isbn13:9781407426464');
 const duplicate=structuredClone(input);
 duplicate.candidates[1]!.editions.push({
  sourceKey:'storytel:isbn13:9781407426464',isbn13:null,
  format:'audiobook',publisher:null,fieldProvenance:{}
 });
 assert.throws(()=>consolidatePilot(duplicate,[batch([])]),/duplicate edition source key/);
});

test('preserves Google Play opaque audio IDs without treating them as Open Library IDs',()=>{
 const input=fixture();
 input.candidates[0]!.editions.push({
  sourceKey:'google_play_audiobooks:AQAAAID-mV8ZsM',
  isbn13:null,format:'audiobook',publisher:null,fieldProvenance:{}
 });
 const result=consolidatePilot(input,[batch([fact])]);
 assert.equal(result.report.totals.editions,11);
 assert.equal(result.report.totals.knownFormats,2);
 assert.equal(result.manifest.candidates[0].editions[1].sourceKey,'google_play_audiobooks:AQAAAID-mV8ZsM');
 const duplicate=structuredClone(input);
 duplicate.candidates[1]!.editions.push({
  sourceKey:'google_play_audiobooks:AQAAAID-mV8ZsM',
  isbn13:null,format:'audiobook',publisher:null,fieldProvenance:{}
 });
 assert.throws(()=>consolidatePilot(duplicate,[batch([])]),/duplicate edition source key/);
});
test('rejects invalid provider identifiers instead of silently normalizing them',()=>{
 for(const bad of ['google_play_audiobooks:','google_play_audiobooks:https://example.org/book',
  'provider:../../secrets','provider:bad id']){
  const input=fixture();
  input.candidates[0]!.editions[0]!.sourceKey=bad;
  assert.throws(()=>consolidatePilot(input,[batch([])]),/Invalid or duplicate edition source key/);
 }
});
