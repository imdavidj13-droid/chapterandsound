#!/usr/bin/env node
/** Read-only Hardcover ISBN diagnostic. Never persists API token or raw responses. */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const API='https://api.hardcover.app/v1/graphql';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const valid13=s=>/^97[89]\d{10}$/.test(s||'')&&(10-[...s.slice(0,12)].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10===Number(s[12]);
export const QUERY=`query EditionByISBN($isbn: String!) {
 editions(where: {isbn_13: {_eq: $isbn}}, limit: 10) {
  id isbn_13 isbn_10 title edition_format physical_format
  reading_format { format }
  audio_seconds pages release_date publisher { name }
  book { id title contributions { author { name } } }
 }
}`;
export function pending(input,max=40){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten pilot works');
 const all=[],used=new Set();
 for(const book of input.candidates)for(const ed of book.editions||[]){
  if(ed.format!=='unknown'||!valid13(ed.isbn13))continue;
  if(!/^\/books\/OL\d+M$/.test(ed.sourceKey))throw Error('Invalid edition ID');
  if(used.has(ed.isbn13))throw Error('Duplicate ISBN in queue');
  used.add(ed.isbn13);all.push({book,ed});
 }
 return {total:all.length,items:all.slice(0,max)};
}
export function formatOf(ed){
 const found=new Set();
 for(const raw of [ed.edition_format,ed.physical_format]){
  const s=norm(raw);
  if(/\b(?:paperback|softcover|softback|mass market|pbk)\b/.test(s))found.add('paperback');
  if(/\b(?:hardback|hardcover|hardbound|hbk|cloth)\b/.test(s))found.add('hardback');
  if(/\b(?:ebook|e book|electronic book)\b/.test(s))found.add('ebook');
  if(/\b(?:audiobook|audio book|audio cd)\b/.test(s))found.add('audiobook');
 }
 if(found.size>1)return {status:'format_conflict'};
 if(found.size===1)return {status:'explicit_format',format:[...found][0],basis:'edition_or_physical_format'};
 const media=norm(ed.reading_format?.format);
 if(media==='audio')return {status:'explicit_format',format:'audiobook',basis:'reading_format_audio'};
 if(media==='ebook')return {status:'explicit_format',format:'ebook',basis:'reading_format_ebook'};
 return {status:'no_explicit_format'};
}
export function evaluate(book,ed,payload){
 if(payload?.errors?.length)return {status:'graphql_error',reason:String(payload.errors[0]?.message||'GraphQL error').slice(0,140)};
 const editions=payload?.data?.editions;
 if(!Array.isArray(editions))return {status:'invalid_response'};
 if(!editions.length)return {status:'no_result'};
 const exact=editions.filter(e=>e?.isbn_13===ed.isbn13);
 if(!exact.length)return {status:'isbn_mismatch'};
 const wanted=norm(book.title),names=norm(book.author).split(' ');
 const verified=exact.filter(e=>{
  const title=norm(e.book?.title||e.title);
  const authors=e.book?.contributions?.map(c=>norm(c.author?.name))||[];
  return (title===wanted||title.startsWith(wanted+' '))&&
   authors.some(a=>names.every(n=>a.split(' ').includes(n)));
 });
 if(!verified.length)return {status:'identity_mismatch'};
 const variants=verified.map(formatOf);
 const unique=[...new Set(variants.filter(v=>v.format).map(v=>v.format))];
 if(unique.length>1||variants.some(v=>v.status==='format_conflict'))return {status:'format_conflict'};
 if(!unique.length)return {status:'no_explicit_format'};
 return {status:'provisional_format',format:unique[0],
  basis:variants.find(v=>v.format===unique[0]).basis,
  hardcoverEditionIds:verified.filter((_,i)=>variants[i].format===unique[0]).map(v=>v.id)};
}
export async function inspect(input,lookup,{max=40,onProgress=()=>{}}={}){
 const selected=pending(input,max),results=[],counts={};
 let stop=false;
 for(const {book,ed} of selected.items){
  let result;
  if(stop)result={status:'skipped'};
  else try{
   result=evaluate(book,ed,await lookup(ed.isbn13));
   if(result.status==='graphql_error'&&/scope|unauthoriz|forbidden/i.test(result.reason||''))stop=true;
  }catch(err){
   const message=String(err).slice(0,140);
   result={status:'error',error:message};
   if(/HTTP (401|403|429)|TimeoutError|AbortError/i.test(message))stop=true;
  }
  counts[result.status]=(counts[result.status]||0)+1;
  results.push({title:book.title,isbn13:ed.isbn13,editionSourceKey:ed.sourceKey,...result});
  onProgress(results.length,selected.items.length,results.at(-1));
 }
 return {mode:'hardcover_exact_isbn_research_only',importEligible:false,
  totals:{works:input.candidates.length,unknownWithIsbn:selected.total,attempted:results.length,
   provisionalFormats:counts.provisional_format||0,
   remainingUnknownFormats:input.candidates.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0)},
  statusCounts:counts,findings:results,
  notes:['Exact ISBN, title and contributor match required.','No production writes or candidate mutations.',
   'No private user data, ratings, reviews, covers or API responses retained.','Review source rights before permanent reuse.']};
}
export async function run(args){
 const opts={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--out','--max','--delay-ms'].includes(args[i])||!args[i+1])throw Error('Invalid option: '+args[i]);
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Required --input and --out');
 const token=process.env.HARDCOVER_API_TOKEN;
 if(!token)throw Error('Set HARDCOVER_API_TOKEN in the PowerShell session first; do not paste it in chat');
 const max=Number(opts['--max']??40),delay=Number(opts['--delay-ms']??1100);
 if(!Number.isInteger(max)||max<1||max>100||!Number.isInteger(delay)||delay<1000||delay>10000)throw Error('Invalid max/delay');
 const lookup=async isbn=>{
  await pause(delay);
  const r=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json','User-Agent':'ChapterAndSoundCatalogResearch/0.1'},
   body:JSON.stringify({query:QUERY,variables:{isbn}}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  return r.json();
 };
 const report=await inspect(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')),lookup,
  {max,onProgress:(n,total,x)=>console.error('[hardcover] '+n+'/'+total+' '+x.isbn13+' '+x.status)});
 const out=resolve(opts['--out']);mkdirSync(out,{recursive:true});
 const path=join(out,'hardcover-isbn-report.json');
 writeFileSync(path+'.partial',JSON.stringify(report,null,2)+'\n');renameSync(path+'.partial',path);
 return {report:path,totals:report.totals,statusCounts:report.statusCounts,
  status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2)))
 .catch(e=>{console.error(e);process.exitCode=1});
