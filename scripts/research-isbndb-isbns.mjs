#!/usr/bin/env node
/**
 * Read-only ISBNdb v2 coverage probe for the canonical Chapter & Sound pilot.
 * Reads ISBNDB_API_KEY from environment, not arguments or files.
 * One exact-ISBN GET at a time, no more often than every 1100 milliseconds.
 * No raw responses, cover bytes, descriptions, pricing, imports or D1 writes.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const isbn13=x=>typeof x==='string'&&/^97[89]\d{10}$/.test(x)&&
 (10-[...x.slice(0,12)].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10===Number(x[12]);
const isbn10to13=x=>{
 if(typeof x!=='string'||!/^\d{9}[\dX]$/.test(x))return null;
 const s='978'+x.slice(0,9),sum=[...s].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0);
 return s+((10-sum%10)%10);
};
export function extractPilotIsbns(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten canonical pilot works');
 const rows=new Map(),keys=new Set();
 for(const book of input.candidates){
  if(!book.title||!book.author||!book.workSourceKey||!Array.isArray(book.editions))
   throw Error('Incomplete work identity');
  for(const ed of book.editions){
   if(!ed.sourceKey||keys.has(ed.sourceKey))throw Error('Duplicate/missing edition ID');
   keys.add(ed.sourceKey);
   for(const raw of [ed.isbn13,...(ed.isbn13Candidates||[]),isbn10to13(ed.isbn10)]){
    const isbn=typeof raw==='string'?raw.replace(/[\s-]/g,''):'';
    if(!isbn13(isbn))continue;
    const row=rows.get(isbn);
    if(row){
     if(row.workSourceKey!==book.workSourceKey)throw Error('ISBN associated with multiple works');
     if(!row.editionSourceKeys.includes(ed.sourceKey))row.editionSourceKeys.push(ed.sourceKey);
    }else rows.set(isbn,{isbn13:isbn,title:book.title,author:book.author,
     workSourceKey:book.workSourceKey,editionSourceKeys:[ed.sourceKey]});
   }
  }
 }
 return [...rows.values()];
}
export function classifyBinding(raw){
 const s=norm(raw);
 if(!s)return {format:null,largePrint:false};
 const largePrint=/\blarge print\b|\blarge type\b/.test(s);
 const formatOptions=[
  /\b(audio ?book|audio cd|audio cassette|mp3 cd|spoken word|audio download)\b/.test(s)&&'audiobook',
  /\b(e ?book|electronic book|kindle|epub|digital ebook)\b/.test(s)&&'ebook',
  /\b(paperback|softcover|softback|mass market|trade paper)\b/.test(s)&&'paperback',
  /\b(hardback|hardcover|hard cover|clothbound)\b/.test(s)&&'hardback'
 ].filter(Boolean);
 return {format:formatOptions.length===1?formatOptions[0]:null,largePrint,
  ...(formatOptions.length>1?{ambiguity:'conflicting_format_tokens'}:{})};
}
export function interpretBook(payload,expected){
 const book=payload?.book;
 if(!book||typeof book!=='object'||Array.isArray(book))return {status:'no_result',fields:{}};
 const actualIsbns=[book.isbn13,book.isbn].filter(Boolean).map(x=>String(x).replace(/[\s-]/g,''));
 if(!actualIsbns.some(x=>x===expected.isbn13||isbn10to13(x)===expected.isbn13))
  return {status:'isbn_mismatch',fields:{},observedIsbns:actualIsbns};
 const title=typeof book.title==='string'?book.title.trim():'';
 const authors=Array.isArray(book.authors)?book.authors.filter(x=>typeof x==='string'):[];
 const actual=norm(title),wanted=norm(expected.title);
 if(!actual||!(actual===wanted||actual.startsWith(wanted+' ')||
  (wanted.startsWith('the ')&&actual===wanted.slice(4))))
  return {status:'title_mismatch',fields:{},observedTitle:title};
 const targetAuthor=norm(expected.author);
 if(authors.length&&!authors.some(x=>{
  const v=norm(x),parts=targetAuthor.split(' ');
  return v===targetAuthor||v===parts.slice(1).join(' ')+' '+parts[0];
 }))return {status:'author_mismatch',fields:{},observedAuthors:authors.slice(0,5)};
 const binding=typeof book.binding==='string'?book.binding.trim():'';
 const info=classifyBinding(binding),fields={isbn13:expected.isbn13,title,
  ...(authors.length?{authors:authors.slice(0,8)}:{}),
  ...(typeof book.publisher==='string'&&book.publisher.trim()?{publisher:book.publisher.trim()}:{}),
  ...(typeof book.date_published==='string'&&book.date_published.trim()?{publicationDate:book.date_published.trim()}:{}),
  ...(typeof book.language==='string'&&book.language.trim()?{language:book.language.trim()}:{}),
  ...(Number.isSafeInteger(book.pages)&&book.pages>0?{pageCount:book.pages}:{}),
  ...(binding?{bindingLabel:binding}:{}),
  ...(typeof book.edition==='string'&&book.edition.trim()?{editionLabel:book.edition.trim()}:{}),
  ...(info.format?{format:info.format}:{}),
  ...(info.largePrint?{largePrint:true}:{})};
 return {status:'identity_matched',fields,formatProposed:Boolean(info.format),
  ...(info.ambiguity?{formatAmbiguity:info.ambiguity}:{})};
}
export async function probeIsbndb(input,{key,limit=5,delayMs=1150,fetchImpl=fetch,
 onProgress=()=>{},endpoint='https://api2.isbndb.com'}={}){
 if(typeof key!=='string'||!key.trim())throw Error('ISBNDB_API_KEY is required');
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('--max must be 1–1000');
 if(!Number.isInteger(delayMs)||delayMs<1100)throw Error('Delay must be at least 1100ms');
 if(endpoint!=='https://api2.isbndb.com'&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint))
  throw Error('Unapproved ISBNdb API endpoint');
 const all=extractPilotIsbns(input),records=[];
 for(const row of all.slice(0,limit)){
  if(records.length)await wait(delayMs);
  let response;
  try{response=await fetchImpl(endpoint+'/book/'+row.isbn13,{
   headers:{Authorization:key,Accept:'application/json'},signal:AbortSignal.timeout(20000)})}
  catch(e){records.push({...row,status:'request_error',error:e?.name==='TimeoutError'?'timeout':'network_failure'});continue}
  if([401,403,429].includes(response.status)){
   return {status:response.status===429?'rate_limited':'authentication_error',
    httpStatus:response.status,records,attempted:records.length+1,
    totals:{eligible:all.length,checked:records.length,
     matched:records.filter(x=>x.status==='identity_matched').length},
    reason:'Stopped immediately on authentication or rate-limit error.'};
  }
  if(response.status===404){records.push({...row,status:'no_result'});continue}
  if(!response.ok){records.push({...row,status:'http_error',httpStatus:response.status});continue}
  let payload;try{payload=await response.json()}catch{
   records.push({...row,status:'invalid_json'});continue
  }
  const r=interpretBook(payload,row);
  records.push({...row,...r,source:'isbndb',sourceRecordUrl:'https://isbndb.com/book/'+row.isbn13,rightsStatus:'verify_subscription_terms_before_persistence'});
  onProgress({checked:records.length,total:Math.min(limit,all.length),status:r.status});
 }
 const fieldCounts={};
 for(const r of records.filter(x=>x.status==='identity_matched'))
  for(const field of Object.keys(r.fields||{}))fieldCounts[field]=(fieldCounts[field]||0)+1;
 return {status:'REVIEW_ONLY_NO_DATABASE_WRITES',
  totals:{eligible:all.length,checked:records.length,
   matched:records.filter(x=>x.status==='identity_matched').length,
   noResult:records.filter(x=>x.status==='no_result').length,
   mismatches:records.filter(x=>x.status.endsWith('_mismatch')).length,
   errors:records.filter(x=>['request_error','http_error','invalid_json'].includes(x.status)).length,
   formatProposals:records.filter(x=>x.formatProposed).length,fieldCounts},
  records,notes:['ISBN, title and supplied authors must agree with the canonical work.',
   'Publisher names and edition labels alone never establish formats.',
   'No synopsis, cover URLs, images, prices or raw API responses are saved.',
   'Returned facts are research observations; conflicts and licence terms require review.',
   'No publication, source-record merging or database writes.']};
}
export async function run(argv){
 const options={};for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out','--max'].includes(argv[i])||!argv[i+1])
   throw Error('Unknown or missing argument: '+argv[i]);
  options[argv[i]]=argv[i+1];
 }
 if(!options['--input']||!options['--out'])throw Error('Required --input and --out');
 const manifest=JSON.parse(readFileSync(resolve(options['--input']),'utf8'));
 const result=await probeIsbndb(manifest,{key:process.env.ISBNDB_API_KEY,
  limit:options['--max']?Number(options['--max']):5,
  onProgress:x=>console.error('[isbndb] '+x.checked+'/'+x.total+' '+x.status)});
 const dir=resolve(options['--out']);mkdirSync(dir,{recursive:true});
 const filename=join(dir,'isbndb-isbn-coverage-report.json');
 writeFileSync(filename+'.partial',JSON.stringify(result,null,2)+'\n');
 renameSync(filename+'.partial',filename);
 return {report:filename,status:result.status,totals:result.totals,
  httpStatus:result.httpStatus||null,reason:result.reason||null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2)))
 .catch(e=>{console.error('[isbndb] '+e.message);process.exitCode=1});
