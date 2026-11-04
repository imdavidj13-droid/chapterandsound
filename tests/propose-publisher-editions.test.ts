import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error The CLI is authored as plain JavaScript without declarations.
import {proposePublisherEditions,run} from '../scripts/propose-publisher-editions.mjs';

const isbn='9780552164313';
const fact={title:'Book 0',author:'Simon Kernick',isbn13:isbn,
 format:'paperback',publicationDate:'2011-05-12',pageCount:448,
 imprint:'Corgi',sourceUrl:'https://www.penguin.co.uk/books/329758/a-good-day-to-die-by-kernick-simon/'+isbn,
 checkedOn:'2026-11-04'};
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:'Book '+i,author:'Simon Kernick',workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:null as string|null,isbn13Candidates:[] as string[],
 format:'unknown',publicationDate:'',publisher:''}]
}))});
test('proposes an edition with source key under existing work, not a new work',()=>{
 const input=fixture();
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(input.candidates[0]!.editions.length,1);
 assert.equal(result.report.totals.proposedAdditions,1);
 assert.equal(result.report.totals.resultingEditions,11);
 assert.equal(result.candidates.candidates[0].workSourceKey,'/works/OL1W');
 const ed=result.candidates.candidates[0].editions[1];
 assert.equal(ed.sourceKey,'penguin-uk:isbn13:'+isbn);
 assert.equal(ed.publisher,null);
 assert.equal(ed.imprint,'Corgi');
 assert.equal(ed.importEligible,false);
 assert.equal(ed.fieldProvenance.format.source,'penguin_uk_product_page');
 assert.equal(ed.format,'paperback');
});
test('idempotently recognises an existing ISBN edition',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13=isbn;
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.proposedAdditions,0);
 assert.equal(result.report.totals.alreadyPresent,1);
 assert.equal(result.report.totals.resultingEditions,10);
});
test('blocks an ISBN already present under a different canonical work',()=>{
 const input=fixture();
 input.candidates[1]!.editions[0]!.isbn13=isbn;
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.blocked,1);
 assert.equal(result.report.blocked[0].reason,'isbn_ambiguous_or_shared_across_works');
});
test('rejects duplicate evidence for same ISBN',()=>{
 assert.throws(()=>proposePublisherEditions(fixture(),{records:[fact,fact]}),/Duplicate evidence ISBN/);
});
test('CLI writes distinct proposed-edition report and never rewrites source',()=>{
 const directory=mkdtempSync(join(tmpdir(),'cs-propose-ed-'));
 try{
  const original=JSON.stringify(fixture()),input=join(directory,'in.json');
  const evidence=join(directory,'facts.json');
  writeFileSync(input,original);
  writeFileSync(evidence,JSON.stringify({records:[fact]}));
  const status=run(['--input',input,'--evidence',evidence,'--out',join(directory,'out')]);
  assert.equal(status.totals.proposedAdditions,1);
  assert.equal(readFileSync(input,'utf8'),original);
  assert.equal(JSON.parse(readFileSync(join(directory,'out','publisher-with-proposed-editions.json'),'utf8')).candidates.length,10);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('ISBN repeated in primary and candidates on one edition is not a collision',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13=isbn;
 input.candidates[0]!.editions[0]!.isbn13Candidates=[isbn,isbn];
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.alreadyPresent,1);
 assert.equal(result.report.totals.blocked,0);
 assert.equal(result.report.totals.proposedAdditions,0);
});
test('different edition source records with same ISBN remain ambiguous',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13=isbn;
 input.candidates[0]!.editions.push({
  sourceKey:'/books/OLotherM',isbn13:isbn,isbn13Candidates:[],
  format:'unknown',publicationDate:'',publisher:''
 });
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.blocked,1);
 assert.equal(result.report.totals.proposedAdditions,0);
});

test('candidate-only ISBN is unresolved, not counted as an existing verified edition',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13Candidates=[isbn];
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.alreadyPresent,0);
 assert.equal(result.report.totals.candidateOnlyLinks,1);
 assert.equal(result.report.totals.proposedAdditions,0);
 assert.equal(result.report.candidateOnly[0].reason,'isbn_appears_only_as_candidate');
 assert.equal(result.report.totals.resultingEditions,10);
});
test('multiple source candidate ISBNs never become automatic edition assignments',()=>{
 const input=fixture();
 input.candidates[0]!.editions[0]!.isbn13Candidates=[isbn,'9781407084459'];
 const result=proposePublisherEditions(input,{records:[fact]});
 assert.equal(result.report.totals.candidateOnlyLinks,1);
 assert.equal(result.report.candidateOnly[0].sourceEditionHasMultipleISBNs,true);
 assert.equal(result.report.totals.proposedAdditions,0);
});
