import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Companion script is plain JavaScript, without TypeScript declarations.
import {assessWikidataCandidate,discoverWikidata} from '../scripts/discover-wikidata-pilot.mjs';

const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:'Book '+i,author:'Fixture Author',workSourceKey:'/works/OL'+(i+1)+'W'
}))});
const entity={id:'Q123',labels:{en:{value:'Book 0'}},claims:{
 P50:[{mainsnak:{datavalue:{value:{id:'Q999'}}}}],
 P577:[{mainsnak:{datavalue:{value:{time:'+2001-01-01T00:00:00Z',precision:9}}}}]
}};
const person={id:'Q999',labels:{en:{value:'Fixture Author'}}};
test('work-level Wikidata identity requires title and linked author',()=>{
 const result=assessWikidataCandidate(fixture().candidates[0],entity,{Q999:person});
 assert.equal(result.status,'identity_candidate');
 assert.equal(result.wikidataId,'Q123');
 assert.equal(result.dates.length,1);
 assert.equal(assessWikidataCandidate(fixture().candidates[0],entity,{Q999:{labels:{en:{value:'Other Author'}}}}).status,'identity_mismatch');
});
test('bounded lookup limits requests and distinguishes no results',async()=>{
 let calls=0;
 const result=await discoverWikidata(fixture(),{delayMs:0,fetcher:async (url:string)=>{
  calls++;
  const search=new URL(url).searchParams;
  assert.equal(search.get('action'),'wbsearchentities');
  return {ok:true,json:async()=>({search:[]})};
 }});
 assert.equal(calls,10);
 assert.equal(result.totals.works,10);
 assert.equal(result.totals.worksWithCandidates,0);
 assert.equal(result.books[0].status,'no_search_results');
});
test('request errors are not treated as missing books',async()=>{
 const result=await discoverWikidata(fixture(),{delayMs:0,fetcher:async()=>({ok:false,status:429})});
 assert.equal(result.totals.requestFailures,10);
 assert.equal(result.books[0].status,'request_failed');
});
