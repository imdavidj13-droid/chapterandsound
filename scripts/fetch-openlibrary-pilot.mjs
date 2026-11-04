#!/usr/bin/env node
/**
 * Small, resumable Open Library pilot fetcher. No dump scans, Cloudflare calls,
 * or database writes. Source records are cached as JSON before reconciliation.
 * Usage: node scripts/fetch-openlibrary-pilot.mjs
 *   --resolution-file pilot/simon-kernick-resolution.json
 *   --out .private-catalogue-pilot
 */
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';

const args={};
for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
if(!args['--resolution-file']||!args['--out'])
 throw Error('Required: --resolution-file <json> --out <directory>');
const root=resolve(args['--out']);
const cache=join(root,'openlibrary-cache');
mkdirSync(cache,{recursive:true});
const resolution=JSON.parse(readFileSync(args['--resolution-file'],'utf8'));
const workRe=/^\/works\/OL\d+W$/;
const authorRe=/^\/authors\/OL\d+A$/;
const editionRe=/^\/books\/OL\d+M$/;
if(!authorRe.test(resolution.authorKey)||!Array.isArray(resolution.books)||!resolution.books.length)
 throw Error('Invalid resolution file or author key');
const allKeys=new Set();
for(const book of resolution.books){
 const keys=[book.canonicalWorkKey,...(book.aliasWorkKeys||[])];
 if(!book.title||keys.some(k=>!workRe.test(k)||allKeys.has(k)))
  throw Error('Duplicate/invalid source work keys in resolution');
 for(const key of keys)allKeys.add(key);
}
const base=(args['--api-base']||'https://openlibrary.org').replace(/\/$/,'');
if(args['--api-base']&&!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(base))
 throw Error('--api-base is reserved for localhost fixtures');
const delay=Number(args['--delay-ms']??350);
if(!Number.isSafeInteger(delay)||delay<0||delay>10000)throw Error('Invalid --delay-ms');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let fetched=0,reused=0,failed=0;
function save(file,value){
 const tmp=file+'.partial';
 writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');
 renameSync(tmp,file);
}
async function cached(path,file){
 if(existsSync(file)){
  const result=JSON.parse(readFileSync(file,'utf8'));
  reused++;
  return result;
 }
 for(let attempt=0;attempt<4;attempt++){
  try{
   if(delay)await pause(delay);
   const response=await fetch(base+path,{headers:{'User-Agent':'ChapterAndSoundPilot/0.1 (metadata research; low-volume)','Accept':'application/json'},
    signal:AbortSignal.timeout(25000)});
   if(response.status===429||response.status>=500){
    if(attempt<3){await pause(1000*2**attempt);continue}
   }
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.json();
   save(file,body);
   fetched++;
   return body;
  }catch(error){
   if(attempt===3){failed++;throw new Error('Could not retrieve '+path+': '+String(error))}
   await pause(1000*2**attempt);
  }
 }
}
const n=v=>typeof v==='string'?v.normalize('NFKC').trim():'';
const normalizeTitle=v=>n(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
function isbn13(value){
 const v=n(value).replace(/[\s-]/g,'');
 if(!/^97[89]\d{10}$/.test(v))return '';
 const sum=[...v.slice(0,12)].reduce((a,ch,i)=>a+Number(ch)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(v[12])?v:'';
}
function isbn10(value){
 const v=n(value).replace(/[\s-]/g,'').toUpperCase();
 if(!/^\d{9}[\dX]$/.test(v))return '';
 const sum=[...v].reduce((a,ch,i)=>a+(10-i)*(ch==='X'?10:Number(ch)),0);
 return sum%11===0?v:'';
}
function formatOf(e){
 const raw=n(e.physical_format).toLowerCase();
 if(raw.includes('paperback')||raw.includes('mass market'))return 'paperback';
 if(raw.includes('hardcover')||raw.includes('hardback'))return 'hardback';
 if(raw.includes('ebook')||raw.includes('electronic')||raw.includes('kindle'))return 'ebook';
 if(raw.includes('audio')||raw.includes('cd')||raw.includes('cassette'))return 'audiobook';
 return 'unknown';
}
function editionOf(e,sourceWorkKey){
 const isbn13s=[...new Set((e.isbn_13||[]).map(isbn13).filter(Boolean))];
 const isbn10s=[...new Set((e.isbn_10||[]).map(isbn10).filter(Boolean))];
 return {
  sourceKey:e.key,sourceWorkKeys:[sourceWorkKey],
  title:n(e.title),format:formatOf(e),physicalFormat:n(e.physical_format),
  isbn13:isbn13s.length===1?isbn13s[0]:null,isbn13Candidates:isbn13s,
  isbn10:isbn10s.length===1?isbn10s[0]:null,isbn10Candidates:isbn10s,
  publisher:n(e.publishers?.[0]),publishers:(e.publishers||[]).filter(x=>typeof x==='string'),
  publicationDate:n(e.publish_date),language:n(e.languages?.[0]?.key?.split('/').pop()),
  pageCount:Number.isSafeInteger(e.number_of_pages)?e.number_of_pages:null,
  coverIds:Array.isArray(e.covers)?e.covers.filter(Number.isInteger):[],
  identifiers:e.identifiers||{},revision:e.revision??null
 };
}
const report={source:'Open Library live API',sourceSnapshot:resolution.sourceSnapshot,
 generatedAt:new Date().toISOString(),mode:'read_only_cached',books:[],issues:[],totals:{}};
const candidates=[];
const author=await cached(resolution.authorKey+'.json',join(cache,'author-'+resolution.authorKey.split('/').pop()+'.json'));
if(n(author.key)!==resolution.authorKey)throw Error('Author endpoint returned unexpected key');
for(const plan of resolution.books){
 console.error('[catalogue] '+plan.title);
 const keys=[plan.canonicalWorkKey,...(plan.aliasWorkKeys||[])];
 const works=[],rawEd=[];
 for(const key of keys){
  const id=key.split('/').pop();
  const work=await cached(key+'.json',join(cache,'work-'+id+'.json'));
  if(n(work.key)!==key)throw Error('Unexpected work key for '+key);
  const authors=(work.authors||[]).map(a=>a?.author?.key||a?.key);
  if(!authors.includes(resolution.authorKey))
   report.issues.push({title:plan.title,key,reason:'author_not_confirmed'});
  if(!(normalizeTitle(work.title)===normalizeTitle(plan.title)||
       normalizeTitle(work.title).startsWith(normalizeTitle(plan.title)+' ')))
   report.issues.push({title:plan.title,key,reason:'title_mismatch',observed:work.title});
  works.push({sourceKey:key,title:work.title,description:typeof work.description==='string'?work.description:work.description?.value||'',
   subjects:work.subjects||[],firstPublicationDate:work.first_publish_date||null,authorKeys:authors});
  const seenPages=new Set();
  let offset=0;
  while(true){
   if(seenPages.has(offset))throw Error('Repeated editions page offset');
   seenPages.add(offset);
   const page=await cached(key+'/editions.json?limit=100&offset='+offset,
    join(cache,'editions-'+id+'-'+offset+'.json'));
   if(!Array.isArray(page.entries)||!Number.isInteger(page.size)||page.size<0)
    throw Error('Invalid editions page for '+key+' at '+offset);
   for(const entry of page.entries){
    if(!editionRe.test(entry.key))report.issues.push({title:plan.title,key:entry.key||null,reason:'invalid_edition_key'});
    else rawEd.push(editionOf(entry,key));
   }
   offset+=page.entries.length;
   if(offset>=page.size)break;
   if(page.entries.length===0)throw Error('Incomplete editions pagination for '+key);
   if(offset>5000)throw Error('Unexpected edition count for '+key);
  }
 }
 // A shared source edition key proves identity; an identical valid ISBN is
 // evidence, but metadata disagreements still require review.
 const unique=new Map(),collisions=[];
 for(const e of rawEd){
  const duplicate=[...unique.values()].find(v=>
   v.sourceKey===e.sourceKey ||
   (e.isbn13&&v.isbn13===e.isbn13) ||
   (!e.isbn13&&e.isbn10&&v.isbn10===e.isbn10));
  if(!duplicate){unique.set(e.sourceKey,{...e,aliasEditionSourceKeys:[]});continue}
  duplicate.sourceWorkKeys=[...new Set([...duplicate.sourceWorkKeys,...e.sourceWorkKeys])];
  if(e.sourceKey!==duplicate.sourceKey)duplicate.aliasEditionSourceKeys.push(e.sourceKey);
  const conflicts=['format','publisher','publicationDate','language','pageCount'].filter(k=>
   e[k]!=null&&e[k]!==''&&duplicate[k]!=null&&duplicate[k]!==''&&e[k]!==duplicate[k]);
  if(conflicts.length)collisions.push({retained:duplicate.sourceKey,other:e.sourceKey,conflicts});
 }
 const canonical=works.find(w=>w.sourceKey===plan.canonicalWorkKey);
 const editions=[...unique.values()].sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey));
 const unresolved=editions.filter(e=>e.format==='unknown'||(!e.isbn13&&!e.isbn10));
 const candidate={
  sourceId:'openlibrary',sourceKey:plan.canonicalWorkKey,workSourceKey:plan.canonicalWorkKey,
  sourceWorkKeys:keys,identityStatus:'provisional_review_required',
  title:plan.title,author:n(author.name),authorSourceKeys:[resolution.authorKey],
  description:canonical?.description||works.find(w=>w.description)?.description||'',
  subjects:canonical?.subjects||[],firstPublicationDate:canonical?.firstPublicationDate||null,
  editions,duplicateEditionGroups:collisions,sourceWorkMetadata:works
 };
 candidates.push(candidate);
 report.books.push({title:plan.title,sourceWorkIds:keys.length,editionRelationships:rawEd.length,
  uniqueEditionRecords:editions.length,unknownFormat:editions.filter(e=>e.format==='unknown').length,
  missingIsbn:editions.filter(e=>!e.isbn13&&!e.isbn10).length,
  conflicts:collisions.length,identityStatus:'provisional_review_required'});
 if(collisions.length)report.issues.push({title:plan.title,reason:'edition_metadata_conflicts',details:collisions});
 if(unresolved.length)report.issues.push({title:plan.title,reason:'edition_enrichment_needed',count:unresolved.length});
 console.error('[catalogue] '+plan.title+': '+editions.length+' unique edition records; '+collisions.length+' conflicting duplicates');
}
report.generatedAt=new Date().toISOString();
report.totals={books:candidates.length,sourceWorkIds:allKeys.size,
 editionRelationships:report.books.reduce((n,b)=>n+b.editionRelationships,0),
 uniqueEditionRecords:report.books.reduce((n,b)=>n+b.uniqueEditionRecords,0),
 conflicts:report.books.reduce((n,b)=>n+b.conflicts,0),fetched,reused,failed};
save(join(root,'api-candidates-01.json'),{candidates});
save(join(root,'api-report.json'),report);
console.log(JSON.stringify({output:root,report:'api-report.json',candidates:'api-candidates-01.json',
 totals:report.totals,status:'REVIEW_REQUIRED_NO_DATABASE_WRITES'},null,2));
