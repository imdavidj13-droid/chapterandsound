#!/usr/bin/env node
/** Review-only live Open Library edition format recheck with cache. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const norm=v=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function parseFormat(v){
 const s=String(v||'').toLowerCase().replace(/[-_]/g,' ');
 if(/\b(audio ?book|audio cd|audio cassette|mp3 cd)\b/.test(s))return 'audiobook';
 if(/\b(e ?book|electronic book|kindle edition)\b/.test(s))return 'ebook';
 if(/\b(paperback|softback|softcover|mass market)\b/.test(s))return 'paperback';
 if(/\b(hardback|hardcover|hard cover)\b/.test(s))return 'hardback';
 return null;
}
export function evaluate(book,edition,raw){
 if(!raw||raw.key!==edition.sourceKey)return {status:'edition_mismatch'};
 const keys=(raw.works||[]).map(w=>w.key);
 if(keys.length&&!keys.some(k=>(book.sourceWorkKeys||[book.workSourceKey]).includes(k)))
  return {status:'work_mismatch'};
 if(norm(raw.title)!==norm(book.title)&&!norm(raw.title).startsWith(norm(book.title)+' '))
  return {status:'title_mismatch'};
 const known=[edition.isbn13,edition.isbn10].filter(Boolean);
 const actual=[...(raw.isbn_13||[]),...(raw.isbn_10||[])];
 if(known.length&&!known.some(v=>actual.includes(v)))return {status:'isbn_mismatch'};
 const found=parseFormat(raw.physical_format);
 return found?{status:'explicit_format',format:found}:{status:'no_explicit_format'};
}
export async function enrich(input,fetchJson,max=46){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten work candidates');
 const books=structuredClone(input.candidates),items=[],failures=[];
 const unknown=books.flatMap(book=>book.editions.filter(ed=>ed.format==='unknown').map(ed=>({book,ed}))).slice(0,max);
 for(const {book,ed} of unknown){
  if(!/^\/books\/OL\d+M$/.test(ed.sourceKey))throw Error('Invalid edition source key');
  try{
   const decision=evaluate(book,ed,await fetchJson(ed.sourceKey+'.json'));
   if(decision.status==='explicit_format'){
    ed.format=decision.format;ed.fieldProvenance||={};
    ed.fieldProvenance.format={source:'openlibrary_live_exact_edition',
     editionSourceKey:ed.sourceKey,url:'https://openlibrary.org'+ed.sourceKey+'.json',
     status:'source_explicit'};
   }
   items.push({title:book.title,editionSourceKey:ed.sourceKey,...decision});
  }catch(e){failures.push({editionSourceKey:ed.sourceKey,error:String(e)})}
 }
 return {candidates:{candidates:books,mode:'ol_format_recheck_review_only',importEligible:false},
  report:{totals:{attempted:unknown.length,checked:items.length,failures:failures.length,
   formatsResolved:items.filter(x=>x.status==='explicit_format').length,
   remainingUnknownFormats:books.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0)},
   items,failures,notes:['Exact edition, work, title, ISBN and explicit format required.',
   'Unknown remains unknown when no explicit format is available. No D1 writes.']}};
}
export async function run(args){
 const o={};for(let i=0;i<args.length;i+=2)o[args[i]]=args[i+1];
 if(!o['--input']||!o['--out'])throw Error('Required --input --out');
 const max=Number(o['--max']||46),delay=Number(o['--delay-ms']??450);
 if(!Number.isInteger(max)||max<1||max>100||!Number.isInteger(delay)||delay<0||delay>10000)throw Error('Invalid limit/delay');
 const api=o['--api-base']||'https://openlibrary.org';
 if(o['--api-base']&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(api))throw Error('API base must be localhost');
 const dir=resolve(o['--out']),cache=join(dir,'openlibrary-recheck-cache');
 mkdirSync(cache,{recursive:true});
 let cacheHits=0,fetched=0;
 const fetchJson=async path=>{
  const file=join(cache,path.split('/').at(-1));
  if(existsSync(file)){cacheHits++;return JSON.parse(readFileSync(file,'utf8'))}
  for(let attempt=0;attempt<3;attempt++){
   try{
    const r=await fetch(api+path,{headers:{Accept:'application/json',
     'User-Agent':'ChapterAndSoundPilot/0.1 (edition format check)'},
     signal:AbortSignal.timeout(15000)});
    if(r.status===404)return null;
    if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();
    writeFileSync(file+'.partial',JSON.stringify(data));
    renameSync(file+'.partial',file);fetched++;
    if(delay)await pause(delay);
    return data;
   }catch(e){if(attempt===2)throw e;await pause(1500*(attempt+1))}
  }
 };
 const result=await enrich(JSON.parse(readFileSync(resolve(o['--input']),'utf8')),fetchJson,max);
 result.report.totals.cacheHits=cacheHits;result.report.totals.fetched=fetched;
 for(const [name,data] of [['openlibrary-recheck-report.json',result.report],
  ['openlibrary-rechecked-candidates.json',result.candidates]]){
  const file=join(dir,name);writeFileSync(file+'.partial',JSON.stringify(data,null,2)+'\n');
  renameSync(file+'.partial',file);
 }
 return {report:join(dir,'openlibrary-recheck-report.json'),totals:result.report.totals,
  status:'LOCAL_REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2)))
 .catch(e=>{console.error(e);process.exitCode=1});
