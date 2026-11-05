import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript CLI has no generated declaration.
import {prepareFiveBookDrafts} from '../scripts/prepare-five-book-draft-import.mjs';
const names=['Relentless','Siege','The Crime Trade','A Good Day to Die','The Payback',
 'The Murder Exchange','Severed','Ultimatum','Stay Alive','The Final Minute'];
const valid=['9780306406157','9781407095301','9781407093901','9781407409658','9781510017825'];
const fixture=()=>({candidates:names.map((title,i)=>({
 title,author:'Simon Kernick',workSourceKey:'/works/OL'+(i+1)+'W',
 authorSourceKeys:['/authors/OL1A'],description:'',editions:[
 {sourceKey:'/books/OL'+(i+1)+'M',isbn13:valid[i%5],format:'paperback'},
 {sourceKey:'/books/OL'+(i+101)+'M',isbn13:null,format:'unknown'},
 {sourceKey:'storytel:isbn13:9781407426464',isbn13:'9781407426464',format:'audiobook'}
 ]}))});
test('selects exactly five canonical works with ISBN identified print editions',()=>{
 const report=prepareFiveBookDrafts(fixture());
 assert.equal(report.candidates.length,5);
 assert.deepEqual(report.candidates.map((x:{title:string})=>x.title),names.slice(0,5));
 assert.equal(report.candidates.every((x:{editions: {format:string;isbn13:string}[]})=>x.editions.length===1&&x.editions[0]?.format==='paperback'),true);
 assert.equal(report.review.editionCount,5);
 assert.equal(report.review.quarantined,10);
 assert.equal(report.confirmed,false);
});
test('fails closed when one selected work lacks identified valid edition',()=>{
 const f=fixture();f.candidates[0]!.editions[0]!.format='unknown';
 assert.throws(()=>prepareFiveBookDrafts(f),/No ISBN-identified/);
});
