import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript action-plan source has no TS declaration.
import {buildGapActionPlan} from '../scripts/build-catalogue-field-action-plan.mjs';
const rows=[
 {title:'Relentless',entityKind:'edition',editionSourceKey:'/books/OL1M',isbn13:'9781407095301',
  fieldPath:'format',requirement:'priority',status:'unknown',sourceCandidates:['publisher','hardcover','loc']},
 {title:'Relentless',entityKind:'edition',editionSourceKey:'/books/OL1M',isbn13:'9781407095301',
  fieldPath:'page_count',requirement:'conditional',status:'applicability_unknown',sourceCandidates:['publisher','hardcover']},
 {title:'Relentless',entityKind:'edition',editionSourceKey:'/books/OL2M',isbn13:'9780593051351',
  fieldPath:'publisher',requirement:'priority',status:'missing',sourceCandidates:['publisher','hardcover','loc']},
 {title:'Relentless',entityKind:'edition',editionSourceKey:'/books/OL2M',isbn13:'9780593051351',
  fieldPath:'cover_asset',requirement:'priority',status:'present',evidence:'rights_unverified',sourceCandidates:['publisher','manual']}
];
const audit={gaps:rows,fields:[],totals:{works:10,editions:88}};
const reports={hardcoverReport:{findings:[
 {isbn13:'9781407095301',status:'no_result'},
 {isbn13:'9780593051351',status:'no_explicit_format'}
]},locReport:{findings:[
 {isbn13:'9781407095301',status:'no_result'}
]}};
test('does not route unknown-format-dependent fields prematurely',()=>{
 const p=buildGapActionPlan(audit,reports);
 assert.equal(p.totals.deferredApplicabilityChecks,1);
 assert.equal(p.totals.unknownFormatBlockedEditions,1);
 assert.equal(p.queue.some((x:{field:string})=>x.field==='edition.page_count'),false);
});
test('suppresses repeated exact-ISBN misses while keeping independent publisher paths',()=>{
 const p=buildGapActionPlan(audit,reports);
 const format=p.queue.find((x:{field:string})=>x.field==='edition.format')!;
 assert.deepEqual(format.sourceCandidatesToTry,['publisher']);
 assert.equal(p.totals.previouslyUnproductiveSourceSuggestions,2);
});
test('separates rights review from absent metadata and preserves unknown counts',()=>{
 const p=buildGapActionPlan(audit,reports);
 assert.equal(p.totals.rightsChecks,1);
 assert.equal(p.totals.actionablePriorityGaps,2);
 assert.equal(p.fieldPriorities.find((x:{field:string})=>x.field==='edition.cover_asset')!.rightsReview,1);
 assert.equal(p.status,'READ_ONLY_NO_DATABASE_WRITES');
});
test('does not overrestrict Hardcover when its prior result was only missing a format',()=>{
 const p=buildGapActionPlan(audit,reports);
 const publisher=p.queue.find((x:{field:string})=>x.field==='edition.publisher')!;
 assert.ok(publisher.sourceCandidatesToTry.includes('hardcover'));
});
