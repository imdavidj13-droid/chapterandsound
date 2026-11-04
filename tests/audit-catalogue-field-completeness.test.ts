import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error plain JavaScript audit module.
import {auditCatalogueManifest} from '../scripts/audit-catalogue-field-completeness.mjs';
const fields=[
 {entityKind:'work',fieldPath:'canonical_title',requirement:'required',appliesTo:'all',sources:['openlibrary'],rightsClass:'facts'},
 {entityKind:'work',fieldPath:'synopsis',requirement:'priority',appliesTo:'all',sources:['publisher'],rightsClass:'licensed_text'},
 {entityKind:'edition',fieldPath:'format',requirement:'priority',appliesTo:'all',sources:['publisher'],rightsClass:'facts'},
 {entityKind:'edition',fieldPath:'page_count',requirement:'conditional',appliesTo:'print',sources:['publisher'],rightsClass:'facts'},
 {entityKind:'edition',fieldPath:'binding',requirement:'priority',appliesTo:'print',sources:['publisher'],rightsClass:'facts'},
 {entityKind:'edition',fieldPath:'cover_asset',requirement:'priority',appliesTo:'all',sources:['publisher'],rightsClass:'licensed_media'},
 {entityKind:'recording',fieldPath:'narrators_and_cast',requirement:'conditional',appliesTo:'audio',sources:['audio_publisher'],rightsClass:'facts'},
 {entityKind:'recording',fieldPath:'duration_seconds',requirement:'conditional',appliesTo:'audio',sources:['audio_publisher'],rightsClass:'facts'},
 {entityKind:'edition',fieldPath:'isbn13_isbn10',requirement:'conditional',appliesTo:'isbn_assigned',sources:['publisher'],rightsClass:'facts'}
];
const registry={version:1,fields,sources:{
 publisher:{label:'Publisher',access:'investigate',reuse:'verify'},
 audio_publisher:{label:'Audio',access:'investigate',reuse:'verify'},
 openlibrary:{label:'Open Library',access:'available',reuse:'verify'}
}};
const data=()=>({mode:'test',candidates:[{title:'Relentless',author:'Simon Kernick',
 workSourceKey:'/works/OL123W',description:'Licensed status not established',
 editions:[
  {sourceKey:'/books/OL1M',format:'paperback',pageCount:330,isbn13:'9780593054703',coverIds:[12]},
  {sourceKey:'/books/OL2M',format:'audiobook',durationSeconds:22000,narratorNames:['Reader A']},
  {sourceKey:'/books/OL3M',format:'unknown',isbn13:null,potentialDuplicateSourceKeys:[] as string[]}
 ]}]});
const find=(r: ReturnType<typeof auditCatalogueManifest>,path:string)=>
 r.fields.find((f:{fieldPath:string})=>f.fieldPath===path)!;
test('print and audio conditional fields are never assigned to wrong media',()=>{
 const r=auditCatalogueManifest(data(),registry);
 assert.equal(r.totals.editions,3);
 assert.equal(find(r,'page_count').present,1);
 assert.equal(find(r,'page_count').notApplicable,1);
 assert.equal(find(r,'page_count').applicabilityUnknown,1);
 assert.equal(find(r,'narrators_and_cast').present,1);
 assert.equal(find(r,'narrators_and_cast').notApplicable,1);
 assert.equal(find(r,'narrators_and_cast').applicabilityUnknown,1);
});
test('unknown format stays unknown, while covers and synopsis require rights verification',()=>{
 const r=auditCatalogueManifest(data(),registry);
 assert.equal(find(r,'format').unknown,1);
 assert.equal(find(r,'cover_asset').rightsUnverified,1);
 assert.equal(find(r,'synopsis').rightsUnverified,1);
 assert.equal(r.totals.unknownFormats,1);
});
test('the report ranks source opportunities without inventing missing values',()=>{
 const r=auditCatalogueManifest(data(),registry);
 assert.equal(r.gaps.some((g:{fieldPath:string;status:string})=>g.fieldPath==='format'&&g.status==='unknown'),true);
 assert.ok(r.rankedSources.some((s:{code:string})=>s.code==='publisher'));
 assert.equal(r.status,'READ_ONLY_NO_DATABASE_WRITES');
});
test('potential duplicate links are explicitly reported, not merged',()=>{
 const input=data();
 input.candidates[0]!.editions[2]!.potentialDuplicateSourceKeys=['/books/OL1M'];
 const r=auditCatalogueManifest(input,registry);
 assert.equal(r.totals.possibleDuplicateLinks,1);
 assert.equal(r.totals.editions,3);
});
test('duplicate ISBNs are reported and duplicate edition keys are rejected',()=>{
 const input=data();
 input.candidates[0]!.editions[1]!.isbn13='9780593054703';
 assert.equal(auditCatalogueManifest(input,registry).duplicateISBNs.length,1);
 input.candidates[0]!.editions[1]!.sourceKey='/books/OL1M';
 assert.throws(()=>auditCatalogueManifest(input,registry),/duplicated edition/);
});
