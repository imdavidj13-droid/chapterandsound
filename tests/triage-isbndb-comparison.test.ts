import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Plain JavaScript CLI without TypeScript declarations.
import {triageComparison} from '../scripts/triage-isbndb-comparison.mjs';
test('triage separates the approved-for-review format proposals and quarantines ISBN-less entries',()=>{
 const r=triageComparison({status:'OFFLINE_REVIEW_ONLY_NO_DATABASE_WRITES',
  findings:[{title:'Relentless',isbn13:'9781407095301',editionSourceKey:'/books/OL1M',
   candidates:{format:'ebook',publisher:'Publisher'},conflicts:{pageCount:{existing:300,observed:301}}},
   {kind:'unmatched_primary_isbn',title:'Relentless',isbn13:'9781407095302',editionSourceKeys:['/books/OL1M']}],
  unresolved:[{status:'review_candidate',title:'Relentless',isbn13:'9781407095301',
   editionSourceKey:'/books/OL1M',proposedFormat:'ebook'},
   {status:'no_isbn_or_verified_product_identity',title:'Siege',isbn13:null,
    editionSourceKey:'/books/OL2M'}]});
 assert.equal(r.totals.proposedFormats,1);
 assert.equal(r.totals.unknownWithoutISBN,1);
 assert.equal(r.totals.metadataConflicts,1);
 assert.equal(r.totals.metadataCandidates,1);
 assert.equal(r.totals.candidateOnlyISBNs,1);
 assert.equal(r.conflictsByField.pageCount,1);
 assert.equal(r.stillUnknown[0].decision,'NOT_APPROVED');
});
test('triage refuses incomplete or non-offline input',()=>{
 assert.throws(()=>triageComparison({status:'REVIEW_ONLY_NO_DATABASE_WRITES',findings:[],unresolved:[]}));
});
