import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {checkCovers,makeCoverTargets} from '../scripts/check-pilot-cover-evidence.mjs';
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:'Title '+i,workSourceKey:'/works/OL'+(i+1)+'W',editions:[
 {sourceKey:'/books/OL'+(i+50)+'M',format:'unknown',coverIds:[]},
 {sourceKey:'/books/OL'+(i+100)+'M',format:'paperback',coverIds:i===0?[12345]:[]}
 ]}))});
test('limits cover selection to ten works and source-linked edition IDs',()=>{
 const targets=makeCoverTargets(fixture());
 assert.equal(targets.length,10);
 assert.equal(targets[0].coverId,12345);
 assert.equal(targets[1].coverId,null);
});
test('checks only one cover, retains source image URL but no image bytes',async()=>{
 const seen:string[]=[];
 const report=await checkCovers(fixture(),{delayMs:0,fetcher:async (url:string,options:any)=>{
  seen.push(url);assert.equal(options.method,'HEAD');
  return {ok:true,status:200,headers:{get:()=> 'image/jpeg'}};
 }});
 assert.equal(seen.length,1);
 assert.ok(seen[0].endsWith('/b/id/12345-L.jpg?default=false'));
 assert.equal(report.totals.available,1);
 assert.equal(report.totals.unresolved,9);
 assert.equal(report.results[0].displayUrl,'https://covers.openlibrary.org/b/id/12345-L.jpg');
});
test('nonimage response cannot count as a confirmed cover',async()=>{
 const report=await checkCovers(fixture(),{delayMs:0,fetcher:async()=>({
  ok:true,status:200,headers:{get:()=> 'text/html'}
 })});
 assert.equal(report.totals.available,0);
 assert.equal(report.results[0].displayUrl,null);
});
