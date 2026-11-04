#!/usr/bin/env node
/**
 * Multi-source ISBN diagnostic for the ten-work catalogue pilot.
 * Open Library results can propose formats only when an exact edition
 * explicitly states physical_format. Google Books provides aggregate
 * identity/coverage checks ONLY, never a durable metadata copy.
 *
 * No production DB writes. No imported Google metadata.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluate as evaluateOpenLibrary} from './recheck-openlibrary-edition-formats.mjs';

const pause=ms=>new Promise(done=>setTimeout(done,ms));
const normalize=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const valid13=x=>{
 if(!/^97[89]\d{10}$/.test(x||''))return false;
 const sum=[...x.slice(0,12)].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(x[12]);
};
export function queueUnknown(input,max=40){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)
  throw Error('Expected ten canonical pilot works');
 const seen=new Set(),queue=[];
 for(const book of input.candidates){
  for(const ed of book.editions||[]){
   if(ed.format!=='unknown'||!valid13(ed.isbn13))continue;
   if(seen.has(ed.isbn13))throw Error('Duplicate unknown ISBN: '+ed.isbn13);
   if(!/^\/books\/OL\d+M$/.test(ed.sourceKey))throw Error('Invalid edition identity');
   seen.add(ed.isbn13);queue.push({book,ed});
  }
 }
 return {queue:queue.slice(0,max),unknownWithIsbn:queue.length};
}
export function evaluateGoogle(book,ed,payload){
 const items=Array.isArray(payload?.items)?payload.items:[];
 if(!items.length)return 'no_result';
 const exact=items.filter(item=>(item?.volumeInfo?.industryIdentifiers||[])
  .some(id=>id?.type==='ISBN_13'&&id?.identifier===ed.isbn13));
 if(!exact.length)return 'isbn_mismatch';
 const wantedTitle=normalize(book.title),wantedAuthor=normalize(book.author);
 return exact.some(item=>{
  const info=item.volumeInfo||{},title=normalize(info.title);
  return (title===wantedTitle||title.startsWith(wantedTitle+' '))&&
   (info.authors||[]).some(a=>normalize(a)===wantedAuthor);
 })?'identity_matched':'identity_mismatch';
}
export async function resolvePilot(input,{openLibrary,googleBooks,limit=40}){
 const {queue,unknownWithIsbn}=queueUnknown(input,limit);
 const findings=[],stats={openLibrary:{explicit:0,no_explicit_format:0,mismatch:0,not_found:0,error:0},
  googleBooks:{identity_matched:0,identity_mismatch:0,isbn_mismatch:0,no_result:0,error:0}};
 for(const {book,ed} of queue){
  const entry={title:book.title,isbn13:ed.isbn13,editionSourceKey:ed.sourceKey,
   openLibrary:{status:'not_checked'},googleBooks:{status:'not_checked'}};
  try{
   const raw=await openLibrary(ed.sourceKey+'.json');
   const decision=raw?evaluateOpenLibrary(book,ed,raw):{status:'not_found'};
   const status=decision.status==='explicit_format'?'explicit':
    decision.status==='no_explicit_format'?'no_explicit_format':
    decision.status==='not_found'?'not_found':'mismatch';
   entry.openLibrary={status,...(status==='explicit'?{format:decision.format,
    sourceUrl:'https://openlibrary.org'+ed.sourceKey+'.json'}:{})};
   stats.openLibrary[status]++;
  }catch(e){entry.openLibrary={status:'error'};stats.openLibrary.error++}
  try{
   const raw=await googleBooks(ed.isbn13);
   const status=evaluateGoogle(book,ed,raw);
   entry.googleBooks={status};
   stats.googleBooks[status]++;
  }catch(e){entry.googleBooks={status:'error'};stats.googleBooks.error++}
  findings.push(entry);
 }
 return {mode:'multi_source_isbn_diagnostic',importEligible:false,
  totals:{works:input.candidates.length,unknownWithIsbn,attempted:queue.length,
   provisionalOpenLibraryFormats:stats.openLibrary.explicit,
   remainingUnknownFormats:input.candidates.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0)},
  sources:stats,findings,notes:[
   'Open Library explicit formats are proposed only with exact work, edition, title and ISBN checks.',
   'Google Books is diagnostic only. No Google result, title, publisher, cover or description is persisted.',
   'Google Books saleInfo.isEbook is not evidence that the queried ISBN is an ebook edition.',
   'Results are review-only. No candidate format or production database is modified.'
  ]};
}
export async function run(argv){
 const options={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i];if(!['--input','--out','--max','--delay-ms','--api-base-openlibrary','--api-base-google'].includes(key)||!argv[i+1])
   throw Error('Unknown option or missing value: '+key);
  options[key]=argv[i+1];
 }
 if(!options['--input']||!options['--out'])throw Error('Required --input and --out');
 const max=Number(options['--max']??40),delay=Number(options['--delay-ms']??600);
 if(!Number.isSafeInteger(max)||max<1||max>100||!Number.isSafeInteger(delay)||delay<100||delay>10000)
  throw Error('Invalid --max or --delay-ms');
 const ol=(options['--api-base-openlibrary']||'https://openlibrary.org').replace(/\/$/,'');
 const gb=(options['--api-base-google']||'https://www.googleapis.com/books/v1').replace(/\/$/,'');
 for(const key of ['--api-base-openlibrary','--api-base-google']){
  if(options[key]&&!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(options[key]))
   throw Error(key+' only supports localhost fixtures');
 }
 const output=resolve(options['--out']),cache=join(output,'multi-source-isbn-cache');
 mkdirSync(cache,{recursive:true});
 let requests=0,cacheHits=0;
 const jsonFetch=async(uri)=>{
  await pause(delay);
  const response=await fetch(uri,{headers:{Accept:'application/json',
   'User-Agent':'ChapterAndSoundPilot/0.1 (multi-source ISBN diagnostic)'},
   signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
 };
 const openLibrary=async path=>{
  const file=join(cache,path.split('/').at(-1));
  if(existsSync(file)){cacheHits++;return JSON.parse(readFileSync(file,'utf8'))}
  requests++;const result=await jsonFetch(ol+path);
  if(result!==null){
   writeFileSync(file+'.partial',JSON.stringify(result));
   renameSync(file+'.partial',file);
  }
  return result;
 };
 const googleBooks=async isbn=>{
  requests++;
  return jsonFetch(gb+'/volumes?q='+encodeURIComponent('isbn:'+isbn)+'&maxResults=5');
 };
 const input=JSON.parse(readFileSync(resolve(options['--input']),'utf8'));
 const report=await resolvePilot(input,{openLibrary,googleBooks,limit:max});
 report.totals.requests=requests;report.totals.openLibraryCacheHits=cacheHits;
 const filename=join(output,'multi-source-isbn-report.json');
 writeFileSync(filename+'.partial',JSON.stringify(report,null,2)+'\n');renameSync(filename+'.partial',filename);
 return {report:filename,totals:report.totals,sources:report.sources,status:'DIAGNOSTIC_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2)))
 .catch(error=>{console.error(error);process.exitCode=1});
