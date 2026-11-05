#!/usr/bin/env node
/**
 * Read-only PRH Enhanced API v2 ISBN coverage probe.
 * Reads API key from PRH_API_KEY only. NEVER logs URLs, keys or response bodies.
 * No production data access, import, cover downloads or database writes.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const domains=['PRH.UK','RH.UK','PDK.UK','PRH.US'];
const normalize=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=x=>typeof x==='string'&&x.trim()?x.trim():null;
const number=x=>typeof x==='number'?x:typeof x==='string'&&x.trim()?Number(x):null;
const isbn13=v=>/^(978|979)\d{10}$/.test(v)&&
 [...v.slice(0,12)].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10===(10-Number(v[12]))%10;
const pick=(x,keys)=>keys.map(k=>x?.[k]).find(v=>v!==undefined&&v!==null&&v!=='')??null;
const flatten=(v)=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
export function pilotIsbns(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length===0)throw Error('Expected candidate manifest');
 const seen=new Map();
 for(const book of input.candidates){
  for(const edition of book.editions||[]){
   for(const raw of [edition.isbn13,...(edition.isbn13Candidates||[])]){
    const isbn=String(raw||'').replace(/[- ]/g,'');
    if(!isbn13(isbn))continue;
    if(!seen.has(isbn))seen.set(isbn,{isbn13:isbn,title:book.title,author:book.author,
     editionSourceKeys:[edition.sourceKey]});
    else {
     const row=seen.get(isbn);
     if(normalize(row.title)!==normalize(book.title)||normalize(row.author)!==normalize(book.author))
      throw Error('ISBN linked to different canonical works: '+isbn);
     if(!row.editionSourceKeys.includes(edition.sourceKey))row.editionSourceKeys.push(edition.sourceKey);
    }
   }
 }
 return [...seen.values()];
}
function matchTitle(result,expected){
 const title=compact(pick(result,['title','titleName','title_name','displayTitle']));
 if(!title)return 'title_not_exposed';
 const actual=normalize(title),target=normalize(expected);
 return actual===target||actual.startsWith(target+' ')||target.startsWith(actual+' ')?'matched':'title_mismatch';
}
export function extractTitle(payload,isbn,expectedTitle){
 const root=flatten(payload?.data);
 let title=root.title??root.titles??payload?.title??payload?.titles??root;
 if(Array.isArray(title))title=title.find(x=>String(pick(x,['isbn','isbn13','ean'])||'')===isbn)||title[0];
 title=flatten(title);
 const responseIsbn=String(pick(title,['isbn','isbn13','ean'])||'');
 if(responseIsbn&&responseIsbn!==isbn)return {status:'isbn_mismatch',fields:{},observedIsbn:responseIsbn};
 if(!Object.keys(title).length)return {status:'no_result',fields:{}};
 const titleStatus=matchTitle(title,expectedTitle);
 if(titleStatus==='title_mismatch')return {status:'title_mismatch',fields:{},observedTitle:compact(pick(title,['title','titleName','displayTitle']))};
 const candidates={
  title:pick(title,['title','titleName','displayTitle']),
  formatLabel:pick(title,['formatName','formatname','formatDescription','format','binding']),
  formatCode:pick(title,['formatCode','formatcode']),
  publisher:pick(title,['publisher','publisherName']),
  imprint:pick(title,['imprint','imprintName']),
  publicationDate:pick(title,['onSaleDate','onsaleDate','onsaledate','onSale','publicationDate','pubDate']),
  language:pick(title,['language','languageCode']),
  pageCount:pick(title,['pages','pageCount']),
  runtimeMinutes:pick(title,['projectedMinutes','projected_minutes','durationMinutes','audioDurationMinutes']),
  audioPackage:pick(title,['audioPackage','audiopackage']),
  series:pick(title,['series','seriesName']),
  workId:pick(title,['workId','workid']),
  isbn13:responseIsbn||isbn
 };
 const fields=Object.fromEntries(Object.entries(candidates).filter(([_,v])=>v!==null&&v!==''));
 const normalizedPages=number(fields.pageCount);
 if(fields.pageCount!==undefined&&!(Number.isFinite(normalizedPages)&&normalizedPages>0))delete fields.pageCount;
 const runtime=number(fields.runtimeMinutes);
 if(fields.runtimeMinutes!==undefined&&!(Number.isFinite(runtime)&&runtime>0))delete fields.runtimeMinutes;
 return {status:'matched',titleVerification:titleStatus,fields};
}
async function request(isbn,domain,apiKey,fetchImpl){
 const url=new URL('https://api.penguinrandomhouse.com/resources/v2/title/domains/'+domain+'/titles/'+isbn);
 url.searchParams.set('api_key',apiKey);
 url.searchParams.set('suppressLinks','true');
 let response;
 try{response=await fetchImpl(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)})}
 catch(e){return {status:'network_error',detail:e?.name==='TimeoutError'?'timeout':'request_failed'}}
 if(response.status===401||response.status===403)return {status:'authentication_error',httpStatus:response.status};
 if(response.status===429)return {status:'rate_limited',httpStatus:429};
 if(response.status===404)return {status:'no_result'};
 if(!response.ok)return {status:'http_error',httpStatus:response.status};
 let result;try{result=await response.json()}catch{return {status:'invalid_json'}}
 if(result?.code===404||result?.error?.code===404||result?.recordCount===0)return {status:'no_result'};
 if(result?.error&&result.error!==null)return {status:'api_error',httpStatus:result.error.code||null};
 return {status:'ok',payload:result};
}
export async function probePenguinRandomHouse(input,{
 key,limit=5,domainsToQuery=domains,fetchImpl=fetch,delay=250
}={}){
 if(!key||typeof key!=='string')throw Error('PRH_API_KEY environment variable is required');
 if(!Array.isArray(domainsToQuery)||!domainsToQuery.length||domainsToQuery.some(d=>!domains.includes(d)))
  throw Error('Unsupported domain');
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('Limit must be 1–1000');
 const records=[],all=pilotIsbns(input);
 for(const item of all.slice(0,limit)){
  const attempts=[];let selected=null;
  for(const domain of domainsToQuery){
   const response=await request(item.isbn13,domain,key,fetchImpl);
   if(response.status==='authentication_error'||response.status==='rate_limited'){
    attempts.push({domain,status:response.status,httpStatus:response.httpStatus});
    const stop={status:response.status,records,attempted:records.length+1,
     totals:{eligibleIsbns:all.length,matched:records.filter(x=>x.status==='matched').length},
     reason:'Stop: check activation/permissions or rate limit; no other requests attempted'};
    return stop;
   }
   if(response.status!=='ok'){attempts.push({domain,status:response.status,httpStatus:response.httpStatus||null});continue;}
   const parsed=extractTitle(response.payload,item.isbn13,item.title);
   attempts.push({domain,status:parsed.status,titleVerification:parsed.titleVerification||null,
    fieldNames:Object.keys(parsed.fields||{})});
   if(parsed.status==='matched'){selected={domain,...parsed};break}
  }
  const result={isbn13:item.isbn13,title:item.title,editionSourceKeys:item.editionSourceKeys,
   status:selected?.status|| (attempts.some(a=>a.status==='title_mismatch')?'identity_mismatch':
    attempts.some(a=>['http_error','network_error','api_error','invalid_json'].includes(a.status))?'error':'no_result'),
   matchedDomain:selected?.domain||null,fields:selected?.fields||{},attempts};
  records.push(result);
  if(delay>0&&records.length<Math.min(limit,all.length))
   await new Promise(r=>setTimeout(r,delay));
 }
 const fields={};for(const r of records.filter(x=>x.status==='matched'))
  for(const k of Object.keys(r.fields))fields[k]=(fields[k]||0)+1;
 return {status:'REVIEW_ONLY_NO_DATABASE_WRITES',records,totals:{
  eligibleIsbns:all.length,attempted:records.length,matched:records.filter(x=>x.status==='matched').length,
  noResult:records.filter(x=>x.status==='no_result').length,
  identityMismatch:records.filter(x=>x.status==='identity_mismatch').length,
  errors:records.filter(x=>x.status==='error').length,
  fieldCounts:fields},domains:domainsToQuery,
  notes:['A matched ISBN/title is only a provisional field observation; contributor identities and reuse rights require separate review.',
   'Only known structured fields are retained; API key and request URLs are never printed.',
   'PRH.UK/RH.UK/PDK.UK checked before PRH.US; a US-only search would undercount UK editions.',
   'Publisher field names vary across API responses; absent fields remain absent, never defaulted.',
   'Cover URLs and copyrighted descriptions are not downloaded or imported.']};
}
export async function run(argv){
 const opts={};for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out','--max','--domains'].includes(argv[i])||!argv[i+1])
   throw Error('Unknown or incomplete option: '+argv[i]);opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Required --input and --out');
 const key=process.env.PRH_API_KEY;
 const input=JSON.parse(readFileSync(resolve(opts['--input']),'utf8'));
 const result=await probePenguinRandomHouse(input,{key,limit:opts['--max']?Number(opts['--max']):5,
  domainsToQuery:opts['--domains']?opts['--domains'].split(','):domains});
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'prh-isbn-coverage-report.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');renameSync(file+'.partial',file);
 return {report:file,totals:result.totals,status:result.status,reason:result.reason||null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error('[prh] '+e.message);process.exitCode=1});
