#!/usr/bin/env node
/**
 * Google Books diagnostic ONLY. Compares a bounded ISBN sample against
 * previously saved Open Library candidates, without importing or retaining
 * Google volume metadata. Outputs aggregate statistics, not Google records.
 *
 * Google APIs Terms restrict creating a permanent copy of response content:
 * https://developers.google.com/terms
 *
 * Usage:
 * node scripts/compare-google-books-pilot.mjs
 *   --input .private-catalogue-pilot/enriched-candidates-01.json
 *   --out .private-catalogue-pilot
 *   --max 30
 *
 * --api-base is reserved for localhost test fixtures.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';

const opts={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];
 if(!['--input','--out','--max','--api-base','--delay-ms'].includes(arg)||!process.argv[i+1])
  throw Error('Unknown option or missing value: '+arg);
 opts[arg]=process.argv[++i];
}
if(!opts['--input']||!opts['--out'])throw Error('Required: --input candidates.json --out directory');
const limit=Number(opts['--max']??30);
const delay=Number(opts['--delay-ms']??500);
if(!Number.isSafeInteger(limit)||limit<1||limit>75)throw Error('--max must be 1–75');
if(!Number.isSafeInteger(delay)||delay<0||delay>10000)throw Error('--delay-ms must be 0–10000');
const base=(opts['--api-base']||'https://www.googleapis.com/books/v1').replace(/\/$/,'');
if(opts['--api-base']&&!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base))
 throw Error('--api-base is only allowed for localhost tests');
const body=JSON.parse(readFileSync(opts['--input'],'utf8'));
if(!Array.isArray(body.candidates)||!body.candidates.length)throw Error('Invalid candidates file');
const norm=x=>typeof x==='string'?x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim():'';
const isbn13=x=>{
 const v=String(x||'').replace(/[\s-]/g,'');
 if(!/^97[89]\d{10}$/.test(v))return false;
 const sum=[...v.slice(0,12)].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(v[12]);
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const candidates=[],seen=new Set();
for(const book of body.candidates){
 for(const edition of book.editions||[]){
  if(edition.format!=='unknown'||!isbn13(edition.isbn13)||seen.has(edition.isbn13))continue;
  seen.add(edition.isbn13);
  candidates.push({isbn:edition.isbn13,title:book.title,author:book.author,
   hasPublisher:Boolean(edition.publisher),hasDate:Boolean(edition.publicationDate),
   hasPageCount:Number.isInteger(edition.pageCount)&&edition.pageCount>0});
 }
}
const selected=candidates.slice(0,limit);
const report={mode:'google_books_diagnostic_only',sampleLimit:limit,
 candidateUnknownIsbns:candidates.length,attempted:0,exactIdentifierMatches:0,
 identityMatches:0,noResults:0,identifierMismatch:0,identityMismatch:0,
 requestFailures:0,additionalPublisherEvidence:0,additionalDateEvidence:0,
 additionalPageEvidence:0,googleEbookAvailableSignals:0,books:[],
 importantNotes:[
  'Google Books VolumeInfo printType BOOK does not identify paperback or hardback.',
  'Google Books saleInfo.isEbook indicates Google ebookstore availability, not proof that this ISBN is an ebook edition.',
  'These counts are diagnostic; no Google metadata was copied to the catalogue or retained in this report.',
  'Review Google Books API terms before using any Google content in a permanent public catalogue or API.',
  'No existing edition format has been changed.'
 ]};
const perBook=new Map();
for(const item of selected){
 let entry=perBook.get(item.title);
 if(!entry){entry={title:item.title,attempted:0,exactMatches:0,identityMatches:0,
  publisherEvidence:0,dateEvidence:0,pageEvidence:0,errors:0};perBook.set(item.title,entry)}
 entry.attempted++;report.attempted++;
 try{
  if(delay)await pause(delay);
  const uri=base+'/volumes?q='+encodeURIComponent('isbn:'+item.isbn)+'&maxResults=5';
  const response=await fetch(uri,{headers:{Accept:'application/json',
   'User-Agent':'ChapterAndSoundMetadataDiagnostic/0.1'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Google Books HTTP '+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.items)||!payload.items.length){report.noResults++;continue}
  const exact=payload.items.filter(volume=>volume?.volumeInfo?.industryIdentifiers?.some(
   id=>id?.type==='ISBN_13'&&id.identifier===item.isbn));
  if(!exact.length){report.identifierMismatch++;continue}
  report.exactIdentifierMatches++;entry.exactMatches++;
  const matching=exact.find(v=>{
   const vi=v.volumeInfo||{};
   const title=norm(vi.title),wanted=norm(item.title);
   const author=norm(item.author);
   return (title===wanted||title.startsWith(wanted+' '))&&
     Array.isArray(vi.authors)&&vi.authors.some(a=>norm(a)===author);
  });
  if(!matching){report.identityMismatch++;continue}
  report.identityMatches++;entry.identityMatches++;
  const info=matching.volumeInfo||{};
  if(!item.hasPublisher&&typeof info.publisher==='string'&&info.publisher.trim()){
   report.additionalPublisherEvidence++;entry.publisherEvidence++}
  if(!item.hasDate&&typeof info.publishedDate==='string'&&info.publishedDate.trim()){
   report.additionalDateEvidence++;entry.dateEvidence++}
  if(!item.hasPageCount&&Number.isInteger(info.pageCount)&&info.pageCount>0){
   report.additionalPageEvidence++;entry.pageEvidence++}
  if(matching.saleInfo?.isEbook===true)report.googleEbookAvailableSignals++;
 }catch(error){
  report.requestFailures++;entry.errors++;
  console.error('[google-books] Request failed for '+item.isbn+': '+String(error));
 }
 console.error('[google-books] Checked '+report.attempted+'/'+selected.length+' ISBNs');
}
report.books=[...perBook.values()];
const out=resolve(opts['--out']);mkdirSync(out,{recursive:true});
const path=join(out,'google-books-comparison.json'),tmp=path+'.partial';
writeFileSync(tmp,JSON.stringify(report,null,2)+'\n');renameSync(tmp,path);
console.log(JSON.stringify({report:path,attempted:report.attempted,
 exactMatches:report.exactIdentifierMatches,identityMatches:report.identityMatches,
 additionalPublisherEvidence:report.additionalPublisherEvidence,
 additionalDateEvidence:report.additionalDateEvidence,
 additionalPageEvidence:report.additionalPageEvidence,requestFailures:report.requestFailures,
 status:'DIAGNOSTIC_ONLY_NO_GOOGLE_METADATA_RETAINED_NO_DATABASE_WRITES'},null,2));
