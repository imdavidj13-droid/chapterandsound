import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error CLI implemented as plain JavaScript.
import {assembleRetailerAudio,run} from '../scripts/assemble-retailer-audio.mjs';
const source=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Severed':'Book '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:null as string|null,format:'unknown'}]
}))});
const fact=()=>({title:'Severed',author:'Simon Kernick',isbn13:null,
 provider:'apple_books',providerRecordingId:'1643814122',
 narratorNames:['Paul Panting'],durationMinutes:540,publisher:'W. F. Howes Ltd',
 releaseDate:'2008-08-01',sources:[
 {url:'https://books.apple.com/gb/audiobook/severed/id1643814122',durationMinutes:540},
 {url:'https://www.audiobooks.com/audiobook/severed/295841',durationMinutes:541}]});
test('provider ID creates only one unpublished recording under canonical work',()=>{
 const input=source();
 const result=assembleRetailerAudio(input,{records:[fact()]});
 assert.equal(result.report.totals.addedAudiobookCandidates,1);
 assert.equal(result.report.totals.resultingEditionRecords,11);
 assert.equal(result.report.totals.recordsWithoutISBN,1);
 assert.equal(result.report.totals.recordsWithDurationDisagreement,1);
 const edition=result.candidates.candidates[0].editions[1];
 assert.equal(edition.sourceKey,'apple_books:1643814122');
 assert.equal(edition.isbn13,null);
 assert.equal(edition.durationSeconds,32400);
 assert.deepEqual(edition.durationDisagreementMinutes,[540,541]);
 assert.equal(edition.importEligible,false);
 assert.equal(input.candidates[0]!.editions.length,1);
});
test('missing narrator and duplicate provider ID are rejected',()=>{
 const input=source();
 assert.throws(()=>assembleRetailerAudio(input,{records:[{...fact(),narratorNames:[]}]}),
  /Invalid audiobook evidence/);
 assert.throws(()=>assembleRetailerAudio(input,{records:[fact(),fact()]}),
  /Duplicate provider recording ID/);
});
test('ISBN assigned to a different canonical work blocks audio candidate',()=>{
 const input=source();
 input.candidates[1]!.editions[0]!.isbn13='9781407426464';
 const evidence={...fact(),isbn13:'9781407426464'};
 const result=assembleRetailerAudio(input,{records:[evidence]});
 assert.equal(result.report.totals.blocked,1);
 assert.equal(result.report.totals.addedAudiobookCandidates,0);
});
test('CLI is local-only and preserves its input manifest',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cs-retail-audio-'));
 try{
  const input=join(dir,'input.json'),evidence=join(dir,'evidence.json');
  const raw=JSON.stringify(source());
  writeFileSync(input,raw);writeFileSync(evidence,JSON.stringify({records:[fact()]}));
  const result=run(['--input',input,'--evidence',evidence,'--out',join(dir,'out')]);
  assert.equal(result.totals.addedAudiobookCandidates,1);
  assert.equal(readFileSync(input,'utf8'),raw);
  assert.equal(JSON.parse(readFileSync(join(dir,'out','retailer-audio-report.json'),'utf8')).additions.length,1);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
