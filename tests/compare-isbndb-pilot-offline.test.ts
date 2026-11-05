import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Plain JS CLI has no declaration output.
import {compareIsbndb} from '../scripts/compare-isbndb-pilot-offline.mjs';
const sample=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Other '+i,workSourceKey:'/works/OL'+i+'W',
 editions:[{sourceKey:'/books/OL'+i+'M',isbn13:i===0?'9781407095301':null,
  isbn13Candidates:i===1?['9781407093901']:[],format:'unknown',
  publisher:i===0?'Existing publisher':null}]
}))});
const matched=(isbn:string,edition:string,work:string,fields:object)=>({
 status:'identity_matched',title:'Relentless',isbn13:isbn,workSourceKey:work,
 editionSourceKeys:[edition],fields,sourceRecordUrl:'https://isbndb.com/book/'+isbn});
test('exact edition ISBN creates review candidates, never mutates catalogue',()=>{
 const manifest=sample();
 const r=compareIsbndb(manifest,{records:[
  matched('9781407095301','/books/OL0M','/works/OL0W',
   {format:'ebook',publisher:'Different publisher',pageCount:400})]});
 assert.equal(r.counts.formatCandidates,1);
 assert.equal(r.counts.formatConflicts,0);
 assert.equal(r.counts.fieldConflicts,1);
 assert.equal(r.counts.unresolvedWithProposals,1);
 assert.equal(manifest.candidates[0]!.editions[0]!.format,'unknown');
});
test('candidate-only ISBN does not overwrite unrelated edition',()=>{
 const manifest=sample();const record=matched('9781407093901','/books/OL1M','/works/OL1W',{format:'ebook'});
 record.title='Other 1';
 const r=compareIsbndb(manifest,{records:[record]});
 assert.equal(r.counts.candidateOnlyIsbns,1);
 assert.equal(r.counts.unresolvedWithProposals,0);
});
test('conflicting existing format is reported, not overwritten',()=>{
 const manifest=sample();
 manifest.candidates[0]!.editions[0]!.format='paperback';
 const r=compareIsbndb(manifest,{records:[
  matched('9781407095301','/books/OL0M','/works/OL0W',{format:'ebook'})]});
 assert.equal(r.counts.formatConflicts,1);
 assert.equal(manifest.candidates[0]!.editions[0]!.format,'paperback');
});
test('404 entries remain missing, not successful matches',()=>{
 const r=compareIsbndb(sample(),{records:[{status:'no_result',isbn13:'9781407095301'}]});
 assert.equal(r.counts.noResult,1);
 assert.equal(r.counts.formatCandidates,0);
});
