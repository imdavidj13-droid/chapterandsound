import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error The companion runtime module is plain JavaScript with no declaration file.
import {assessAudioMatch,discoverAudio} from '../scripts/discover-audiosilo-pilot.mjs';

const input={candidates:Array.from({length:10},(_,i)=>({
 title:'Book '+i,author:'Fixture Author',workSourceKey:'/works/OL'+(i+1)+'W'
}))};
test('matches exact work identity and maps factual audiobook release data only',()=>{
 const found=assessAudioMatch(input.candidates[0],{
  title:'Book 0',author:'Fixture Author',narrator:'Narrator',
  ISBN:'9780306406157',ASIN:'B001234567',duration:250.5,publisher:'Audio House',
  publishedYear:2011,description:'Do not retain',cover:'https://example.org/cover.jpg'
 });
 assert.equal(found.status,'candidate_review');
 if(found.status!=='candidate_review')throw Error('Wrong result');
 assert.equal(found.durationSeconds,15030);
 assert.equal(found.narrator,'Narrator');
 assert.equal(JSON.stringify(found).includes('Do not retain'),false);
 assert.equal(JSON.stringify(found).includes('example.org'),false);
});
test('rejects a similarly named release by another author',()=>{
 assert.equal(assessAudioMatch(input.candidates[0],{
  title:'Book 0',author:'Different Author',duration:300
 }).status,'identity_mismatch');
});
test('bounded discovery keeps failures separate from no matches',async()=>{
 let calls=0;
 const report=await discoverAudio(input,{delayMs:0,fetcher:async()=>{
  calls++;
  if(calls===1)return {ok:false,status:429};
  return {ok:true,json:async()=>({matches:[]})};
 }});
 assert.equal(calls,10);
 assert.equal(report.totals.requestFailures,1);
 assert.equal(report.totals.worksWithCandidates,0);
 assert.equal(report.books[0].status,'request_failed_http_429');
});
