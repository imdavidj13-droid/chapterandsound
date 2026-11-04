#!/usr/bin/env node
/**
 * Read-only, bounded Wikidata canonical-work identity discovery.
 * CC0 factual data only. Never infers editions, binding, narration or covers.
 * No D1 access. Same-author AND exact-title match required, and even an exact
 * match is candidate evidence, not automatic authority to merge works.
 */
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const norm=v=>typeof v==='string'?v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' '):'';
const propertyIds=(entity,property)=> (entity?.claims?.[property]||[])
 .filter(c=>c.rank!=='deprecated')
 .map(c=>c?.mainsnak?.datavalue?.value?.id).filter(v=>typeof v==='string'&&/^Q\d+$/.test(v));
const dates=entity=>(entity?.claims?.P577||[])
 .filter(c=>c.rank!=='deprecated')
 .map(c=>c?.mainsnak?.datavalue?.value)
 .filter(v=>typeof v?.time==='string'&&Number.isInteger(v.precision)&&v.precision>=9)
 .map(v=>({date:v.time,precision:v.precision}));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function assessWikidataCandidate(work,item,people){
 const label=item?.labels?.en?.value||'';
 const aliases=(item?.aliases?.en||[]).map(x=>x.value);
 const titleOK=[label,...aliases].some(x=>norm(x)===norm(work.title));
 const authors=propertyIds(item,'P50');
 const authorOK=authors.some(id=>{
  const person=people[id];
  return [person?.labels?.en?.value,...(person?.aliases?.en||[]).map(x=>x.value)].some(x=>norm(x)===norm(work.author));
 });
 if(!titleOK||!authorOK)return {status:'identity_mismatch'};
 return {status:'identity_candidate',wikidataId:item.id,
  source:'wikidata',licence:'CC0-1.0',dates:dates(item),
  note:'Work-level identity evidence only; no edition or recording details verified'};
}
export async function discoverWikidata(data,{fetcher=fetch,base='https://www.wikidata.org/w/api.php',delayMs=400}={}){
 if(!Array.isArray(data?.candidates)||data.candidates.length!==10)
  throw Error('Expected exactly ten canonical works');
 if(base!=='https://www.wikidata.org/w/api.php'&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/api\.php$/.test(base))
  throw Error('Only the official Wikidata Action API or localhost fixtures are allowed');
 const request=async params=>{
  if(delayMs)await pause(delayMs);
  const u=new URL(base);for(const [k,v] of Object.entries({...params,format:'json'}))u.searchParams.set(k,String(v));
  const response=await fetcher(u.toString(),{headers:{Accept:'application/json','User-Agent':'ChapterAndSoundPilot/0.1 (bounded CC0 work identity research)'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
 };
 const books=[];
 for(const work of data.candidates){
  if(!work.title||!work.author||!work.workSourceKey)throw Error('Invalid canonical work');
  const row={title:work.title,workSourceKey:work.workSourceKey,status:'',candidates:[],identityMismatches:0};
  try{
   const found=await request({action:'wbsearchentities',search:work.title,language:'en',type:'item',limit:5});
   const ids=[...new Set((found.search||[]).map(x=>x.id).filter(x=>/^Q\d+$/.test(x)))].slice(0,5);
   if(!ids.length){row.status='no_search_results';books.push(row);continue}
   const entities=(await request({action:'wbgetentities',ids:ids.join('|'),props:'labels|aliases|claims',languages:'en'})).entities||{};
   const personIds=[...new Set(Object.values(entities).flatMap(e=>propertyIds(e,'P50')))].slice(0,20);
   const people=personIds.length?(await request({action:'wbgetentities',ids:personIds.join('|'),props:'labels|aliases',languages:'en'})).entities||{}:{};
   for(const id of ids){
    const candidate=assessWikidataCandidate(work,entities[id],people);
    if(candidate.status==='identity_candidate')row.candidates.push(candidate);
    else row.identityMismatches++;
   }
   row.status=row.candidates.length?'identity_candidates_found':'no_identity_matches';
  }catch(error){row.status='request_failed';row.error=String(error)}
  books.push(row);
 }
 return {mode:'wikidata_cc0_work_identity_review_only',books,
  totals:{works:books.length,worksWithCandidates:books.filter(b=>b.candidates.length>0).length,
   candidates:books.reduce((n,b)=>n+b.candidates.length,0),
   requestFailures:books.filter(b=>b.status==='request_failed').length},
  notes:['Exact English title and linked author identity are required.',
   'Work dates are provenance evidence, not edition publication dates.',
   'Never infer binding, narrator, duration, ISBN or cover from work identity.',
   'CC0 facts only; no descriptions copied. No D1 writes or automatic merging.']};
}
export async function run(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--input','--out'].includes(args[i])||!args[i+1])throw Error('Usage: --input enriched.json --out directory');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Both --input and --out required');
 const result=await discoverWikidata(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'ten-book-wikidata-evidence.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');renameSync(file+'.partial',file);
 return {report:file,totals:result.totals,status:'CC0_WORK_EVIDENCE_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(e);process.exitCode=1});
