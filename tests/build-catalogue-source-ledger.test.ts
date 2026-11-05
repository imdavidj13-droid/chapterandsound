import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Plain JavaScript CLI with no declarations.
import {buildSourceLedger} from '../scripts/build-catalogue-source-ledger.mjs';
const registry={sources:{openlibrary:{label:'Open Library',access:'available',reuse:'check_rights'}},
 fields:[{entityKind:'work',fieldPath:'canonical_title',requirement:'required',rightsClass:'facts',sources:['openlibrary']},
 {entityKind:'edition',fieldPath:'format',requirement:'priority',rightsClass:'facts',sources:['openlibrary']},
 {entityKind:'edition',fieldPath:'cover_asset',requirement:'priority',rightsClass:'licensed_media',sources:['openlibrary']},
 {entityKind:'recording',fieldPath:'duration_seconds',requirement:'conditional',rightsClass:'facts',sources:['openlibrary']}]};
const fixture=()=>({candidates:[{title:'Relentless',workSourceKey:'/works/OL1W',editions:[
 {sourceKey:'/books/OL1M',isbn13:null,format:'unknown',publisher:'W F Howes',coverUrl:'https://example.org/cover.jpg'},
 {sourceKey:'storytel:isbn13:9781407426464',isbn13:'9781407426464',format:'audiobook',
  durationSeconds:8000,narratorNames:['Narrator'],fieldProvenance:{format:{source:'storytel',url:'https://example.org/release',status:'explicit'}}}
]}]});
test('publisher and cover URL do not invent format or publication approval',()=>{
 const report=buildSourceLedger(fixture(),registry);
 assert.equal(report.totals.unknownFormats,1);
 assert.equal(report.editions[0].publicationStatus,'not_approved');
 assert.ok(report.editions[0].blockers.includes('unknown_format'));
 assert.ok(report.editions[0].blockers.includes('no_verified_product_identifier'));
 assert.equal(report.editions[0].fields.find((x:{field:string})=>x.field==='edition.cover_asset').rightsStatus,'review_required');
});
test('qualified audiobook ID preserved; source is recorded without permission assumptions',()=>{
 const report=buildSourceLedger(fixture(),registry);
 assert.equal(report.totals.knownFormats,1);
 assert.equal(report.editions[1].identityKind,'provider_specific_id');
 assert.equal(report.sourceStats[0].source,'storytel');
 assert.equal(report.editions[1].fields.find((x:{field:string})=>x.field==='edition.format').source,'storytel');
 assert.equal(report.editions[1].publicationStatus,'not_approved');
});
