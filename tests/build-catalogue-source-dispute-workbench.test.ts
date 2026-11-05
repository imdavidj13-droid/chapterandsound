import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript source has no generated types.
import {buildDisputeWorkbench,classifyDispute} from '../scripts/build-catalogue-source-dispute-workbench.mjs';
const manifest=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Other '+i,workSourceKey:'/works/OL'+i+'W',
 editions:[{sourceKey:'/books/OL'+i+'M',isbn13:i===0?'9781407095301':null,
  isbn13Candidates:i===1?['9781407093901']:[],format:'unknown',
  publisher:i===0?'Bantam':null,publicationDate:i===0?'2007':null,pageCount:i===0?400:null,
  fieldProvenance:{publisher:{source:'openlibrary',url:'https://openlibrary.org/books/OL0M'}}}]
}))});
const comparison=()=>({status:'OFFLINE_REVIEW_ONLY_NO_DATABASE_WRITES',
 findings:[{title:'Relentless',editionSourceKey:'/books/OL0M',isbn13:'9781407095301',
  sourceRecordUrl:'https://isbndb.com/book/9781407095301',
  conflicts:{publisher:{existing:'Bantam',observed:'Transworld'},
   publicationDate:{existing:'2007',observed:'2007-06-13'},
   pageCount:{existing:400,observed:416}},
  candidates:{language:'en'}}],
 unresolved:[{title:'Relentless',editionSourceKey:'/books/OL0M',isbn13:'9781407095301',
  proposedFormat:null},{title:'Other 1',editionSourceKey:'/books/OL1M',isbn13:null,
  proposedFormat:null}]
});
test('dispute workbench groups 112-style disagreements without overwriting them',()=>{
 const m=manifest(),result=buildDisputeWorkbench(m,comparison());
 assert.equal(result.totals.disputes,3);
 assert.equal(result.totals.metadataCandidates,1);
 assert.equal(result.totals.unresolvedPrimaryIsbn,1);
 assert.equal(result.totals.unresolvedWithoutPrimaryIsbn,1);
 assert.equal(result.fieldGroups.pageCount,1);
 assert.equal(result.disputes.find((d:{field:string})=>d.field==='publisher')!.existingSource,'openlibrary');
 assert.equal(result.disputes.find((d:{field:string})=>d.field==='publicationDate')!.kind,'different_date_precision');
 assert.equal(m.candidates[0]!.editions[0]!.publisher,'Bantam');
});
test('date precision is not mistaken for a verified field match',()=>{
 assert.equal(classifyDispute('publicationDate','2007','2007-06-13').kind,'different_date_precision');
 assert.equal(classifyDispute('publicationDate','2007-04-12','2008').kind,'different_publication_dates');
});
test('ISBN-less records retain candidate ISBNs but are not automatically linked',()=>{
 const r=buildDisputeWorkbench(manifest(),comparison());
 assert.deepEqual(r.unresolved[1].candidateIsbn13s,['9781407093901']);
 assert.equal(r.unresolved[1].status,'QUARANTINE_IF_NO_INDEPENDENT_PRODUCT_ID');
});
test('unresolved records with unknown edition IDs are rejected',()=>{
 const c=comparison();c.unresolved[0]!.editionSourceKey='/books/OL999M';
 assert.throws(()=>buildDisputeWorkbench(manifest(),c),/not in manifest/);
});
