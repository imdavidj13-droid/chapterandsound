import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error The companion runtime module is plain JavaScript with no declaration file.
import {assess,run} from '../scripts/assess-ten-book-readiness.mjs';

type FixtureEdition = {sourceKey:string; format:string; isbn13:string; publisher:string; publicationDate:string; fieldProvenance?:{format:{source:string;status:string}}};
type FixtureBook = {title:string;author:string;workSourceKey:string;authorSourceKeys:string[];description:string;firstPublicationDate:string;validationIssues:{code:string}[];editions:FixtureEdition[]};
const fixture=():{candidates:FixtureBook[]}=>({candidates:Array.from({length:10},(_,i)=>({
 title:'Book '+i,author:'Fixture Author',workSourceKey:'/works/OL'+(i+1)+'W',
 authorSourceKeys:['/authors/OL1A'],description:'Test summary',firstPublicationDate:'2001',
 validationIssues:[],editions:[
  {sourceKey:'/books/OL'+(i+100)+'M',format:'unknown',isbn13:'9780306406157',publisher:'',publicationDate:''},
  {sourceKey:'/books/OL'+(i+200)+'M',format:'paperback',isbn13:'9780306406157',
   publisher:'Test Publisher',publicationDate:'2002',
   fieldProvenance:{format:{source:'openlibrary',status:'source_explicit'}}}
 ]
}))});
test('prioritises evidence-backed complete edition without approving import',()=>{
 const report=assess(fixture());
 assert.equal(report.totals.works,10);
 assert.equal(report.totals.bestEditionsWithCoreFields,10);
 assert.equal(report.totals.readyForAutomaticImport,0);
 assert.equal(report.books[0].bestEditionForReview.format,'paperback');
 assert.deepEqual(report.books[0].bestEditionForReview.missing,[]);
 assert.equal(report.books[0].importEligible,false);
 assert.equal(report.books[0].alternateEditionCount,1);
});
test('reports missing description, edition format, and conflicted identity',()=>{
 const data=fixture();
 data.candidates[0]!.description='';
 data.candidates[0]!.editions=[data.candidates[0]!.editions[0]!];
 data.candidates[0]!.validationIssues=[{code:'canonical_work_identity_unreviewed'}];
 const report=assess(data);
 assert.equal(report.totals.bestEditionsWithCoreFields,9);
 assert.ok(report.books[0].blockers.includes('edition:format'));
 assert.ok(report.books[0].blockers.includes('work:description'));
 assert.ok(report.books[0].blockers.includes('identity_or_source:canonical_work_identity_unreviewed'));
});
test('rejects duplicate works and never touches production',()=>{
 const data=fixture();data.candidates[1]!.workSourceKey=data.candidates[0]!.workSourceKey;
 assert.throws(()=>assess(data),/Duplicate canonical work/);
});
test('CLI writes only review report in supplied directory',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ten-book-readiness-'));
 try{
  const path=join(dir,'input.json');writeFileSync(path,JSON.stringify(fixture()));
  const output=join(dir,'output');
  const status=run(['--input',path,'--out',output]);
  assert.equal(status.status,'REVIEW_ONLY_NO_DATABASE_WRITES');
  assert.equal(JSON.parse(readFileSync(join(output,'ten-book-readiness.json'),'utf8')).books.length,10);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
