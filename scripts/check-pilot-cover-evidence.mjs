#!/usr/bin/env node
/**
 * Targeted, review-only Open Library cover check for the existing ten-work pilot.
 * Uses recorded cover IDs and the official Covers API. Does not download/copy
 * imagery or write to D1. One cover check per work, capped at ten.
 * Cover availability != proof of rights or perfect edition identity.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function makeCoverTargets(data){
 if(!Array.isArray(data?.candidates)||data.candidates.length!==10)throw Error('Expected ten canonical works');
 return data.candidates.map(work=>{
  const editions=(work.editions||[]).filter(e=>Array.isArray(e.coverIds)&&e.coverIds.some(id=>Number.isSafeInteger(id)&&id>0));
  editions.sort((a,b)=>{
   const preferred=x=>x.format==='paperback'?0:x.format==='hardback'?1:x.format==='ebook'?2:3;
   return preferred(a)-preferred(b)||String(a.sourceKey).localeCompare(String(b.sourceKey));
  });
  const ed=editions[0];
  const coverId=ed?.coverIds.find(id=>Number.isSafeInteger(id)&&id>0)||null;
  return {title:work.title,workSourceKey:work.workSourceKey,editionSourceKey:ed?.sourceKey||null,coverId};
 });
}
export async function checkCovers(data,{fetcher=fetch,base='https://covers.openlibrary.org',delayMs=450}={}){
 if(!/^https:\/\/covers\.openlibrary\.org$/.test(base)&&!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(base))
  throw Error('Only official Covers API or localhost fixtures are allowed');
 const targets=makeCoverTargets(data),results=[];
 for(const target of targets){
  const result={...target,source:'openlibrary_cover_id',status:'no_source_cover_id',displayUrl:null};
  if(target.coverId){
   const url=base+'/b/id/'+target.coverId+'-L.jpg?default=false';
   if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
   try{
    const res=await fetcher(url,{method:'HEAD',signal:AbortSignal.timeout(10000)});
    if(res.ok&&res.headers.get('content-type')?.toLowerCase().startsWith('image/')){
     result.status='available';
     result.displayUrl='https://covers.openlibrary.org/b/id/'+target.coverId+'-L.jpg';
    }else if(res.status===404)result.status='not_found';
    else result.status='unverified_http_'+res.status;
   }catch{result.status='request_failed'}
  }
  results.push(result);
 }
 return {mode:'ten_work_targeted_cover_checks',results,
  totals:{works:10,available:results.filter(x=>x.status==='available').length,
   unresolved:results.filter(x=>x.status!=='available').length},
  notes:['One source-linked edition cover checked per canonical work.',
   'Available means image endpoint responded successfully; cover correctness still requires examination.',
   'Use Open Library-hosted image URL; no cover bytes are downloaded or copied.',
   'This does not establish that a title, edition, or audiobook is complete.',
   'No D1 writes or book publication.']};
}
export async function run(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--input','--out'].includes(args[i])||!args[i+1])throw Error('Usage: --input enriched.json --out directory');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Both --input and --out are required');
 const output=await checkCovers(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const path=join(dir,'ten-book-cover-evidence.json');
 writeFileSync(path+'.partial',JSON.stringify(output,null,2)+'\n');renameSync(path+'.partial',path);
 return {report:path,totals:output.totals,status:'READ_ONLY_NO_IMAGES_COPIED_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 run(process.argv.slice(2)).then(value=>console.log(JSON.stringify(value,null,2))).catch(err=>{console.error(err);process.exitCode=1});
}
