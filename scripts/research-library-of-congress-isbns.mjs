#!/usr/bin/env node
/**
 * Read-only Library of Congress SRU ISBN research, ten-work pilot.
 * Uses official Folio SRU HTTPS gateway and exact MARC 020 ISBN matching.
 * Never infers paperback/hardback from page count, publication date or
 * electronic availability; source observations remain review-only.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const BASE='https://lx2.loc.gov/sru/lcdb';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const html=v=>String(v||'').replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([\da-f]+));/gi,(m,d,h)=>
 ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[m.toLowerCase()]??
 (d||h?String.fromCodePoint(parseInt(d||h,d?10:16)):m)));
const strip=v=>html(String(v||'').replace(/<[^>]+>/g,'')).trim();
const matches=(str,re)=>[...String(str||'').matchAll(re)];
const field=(rec,tag)=>matches(rec,/<(?:\w+:)?datafield\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?datafield>/gi)
 .filter(m=>new RegExp('(?:^|\\s)tag=["\\\']'+tag+'["\\\']','i').test(m[1]))
 .map(m=>m[2]);
const sub=(body,code)=>matches(body,/<(?:\w+:)?subfield\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?subfield>/gi)
 .filter(m=>new RegExp('(?:^|\\s)code=["\\\']'+code+'["\\\']','i').test(m[1]))
 .map(m=>strip(m[2]));
const control=(rec,tag)=>matches(rec,/<(?:\w+:)?controlfield\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?controlfield>/gi)
 .filter(m=>new RegExp('(?:^|\\s)tag=["\\\']'+tag+'["\\\']','i').test(m[1]))
 .map(m=>strip(m[2]));
const isbnDigits=s=>String(s||'').replace(/[^0-9Xx]/g,'').toUpperCase();
const valid13=x=>{
 if(!/^97[89]\d{10}$/.test(x||''))return false;
 return (10-[...x.slice(0,12)].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10===Number(x[12]);
};
const valid10=x=>/^\d{9}[\dX]$/.test(x)&&[...x].reduce((n,d,i)=>n+(10-i)*(d==='X'?10:Number(d)),0)%11===0;
const to13=x=>{
 if(valid13(x))return x;
 if(!valid10(x))return null;
 const prefix='978'+x.slice(0,9);
 return prefix+String((10-[...prefix].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10);
};
export const buildSruUrl=(isbn,base=BASE)=>{
 if(!valid13(isbn))throw Error('Invalid ISBN-13');
 const url=new URL(base);
 url.searchParams.set('version','1.1');
 url.searchParams.set('operation','searchRetrieve');
 url.searchParams.set('query','bath.isbn='+isbn);
 url.searchParams.set('maximumRecords','5');
 url.searchParams.set('recordSchema','marcxml');
 return url.toString();
};
export function classifyMarcFormat(rec,matchingQualifiers){
 // Prefer ISBN-specific binding qualifier in 020 $q.
 const qualifiers=matchingQualifiers.map(norm);
 const formatOfQualifier=q=>{
  if(/\b(?:paperback|softcover|softback|pbk)\b/.test(q))return 'paperback';
  if(/\b(?:hardcover|hardback|hardbound|hard cover|hbk|cloth)\b/.test(q))return 'hardback';
  if(/\b(?:ebook|e book|electronic book|electronic resource)\b/.test(q))return 'ebook';
  if(/\b(?:audiobook|audio book|audio cd|sound recording)\b/.test(q))return 'audiobook';
  return null;
 };
 const exact=[...new Set(qualifiers.map(formatOfQualifier).filter(Boolean))];
 if(exact.length===1)return {format:exact[0],basis:'marc_020_matching_isbn_qualifier'};
 if(exact.length>1)return {format:null,basis:'conflicting_isbn_qualifiers'};
 // Only classify ebook / audiobook at record level if the record has a
 // single ISBN; otherwise format can refer to a different manifestation.
 const isbnCount=field(rec,'020').flatMap(p=>sub(p,'a')).map(v=>to13(isbnDigits(v.split(/\s|\(/)[0])))
  .filter(Boolean);
 if(new Set(isbnCount).size!==1)return {format:null,basis:'multiple_isbns_no_specific_binding'};
 const media=field(rec,'338').flatMap(f=>sub(f,'b')).map(norm);
 const carriers=field(rec,'338').flatMap(f=>sub(f,'a')).map(norm);
 if(media.includes('cr')||carriers.includes('online resource'))return {format:'ebook',basis:'marc_338_online_resource'};
 if(media.includes('sd')||carriers.includes('audio disc'))return {format:'audiobook',basis:'marc_338_audio_disc'};
 return {format:null,basis:'no_explicit_binding'};
}
export function evaluateLocMarc(xml,book,edition){
 if(/<(?:\w+:)?diagnostics\b/i.test(xml))return {status:'sru_diagnostic'};
 const records=matches(xml,/<(?:\w+:)?record\b[^>]*>([\s\S]*?)<\/(?:\w+:)?record>/gi)
  .map(m=>m[1]).filter(r=>/<(?:\w+:)?datafield\b/i.test(r));
 if(!records.length)return {status:'no_result'};
 const accepted=[],reasons=[];
 for(const rec of records){
  const isbnFields=field(rec,'020');
  const specific=isbnFields.filter(f=>sub(f,'a').some(raw=>{
   const isbn=isbnDigits(raw.split(/[\s(]/)[0]);
   return to13(isbn)===edition.isbn13;
  }));
  if(!specific.length){reasons.push('isbn_mismatch');continue}
  const titles=field(rec,'245').map(f=>[...sub(f,'a'),...sub(f,'b')].join(' ').replace(/[\/:;,. ]+$/,''));
  const authors=field(rec,'100').flatMap(f=>sub(f,'a'));
  const expectedTitle=norm(book.title),expectedAuthor=norm(book.author);
  if(!titles.some(t=>norm(t)===expectedTitle||norm(t).startsWith(expectedTitle+' '))){
   reasons.push('title_mismatch');continue
  }
  if(!authors.some(a=>expectedAuthor.split(' ').every(part=>norm(a).split(' ').includes(part)))){
   reasons.push('author_mismatch');continue
  }
  const qualifiers=specific.flatMap(f=>sub(f,'q'));
  const classified=classifyMarcFormat(rec,qualifiers);
  accepted.push({format:classified.format,basis:classified.basis});
 }
 if(!accepted.length)return {status:reasons[0]||'no_matching_record'};
 const formats=[...new Set(accepted.map(x=>x.format).filter(Boolean))];
 if(formats.length>1)return {status:'conflicting_formats'};
 if(formats.length===1&&accepted.some(x=>x.format&&x.format!==formats[0]))return {status:'conflicting_formats'};
 if(formats.length===1)return {status:'explicit_format',format:formats[0],
  basis:accepted.find(x=>x.format===formats[0]).basis};
 return {status:'no_explicit_format',basis:accepted[0].basis};
}
export function queueUnknown(input,max=40){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten pilot works');
 const seen=new Set(),all=[];
 for(const book of input.candidates)for(const edition of book.editions||[]){
  if(edition.format!=='unknown'||!valid13(edition.isbn13))continue;
  if(!/^\/books\/OL\d+M$/.test(edition.sourceKey))throw Error('Invalid edition ID');
  if(seen.has(edition.isbn13))throw Error('Duplicate ISBN in unknown edition queue');
  seen.add(edition.isbn13);all.push({book,edition});
 }
 return {all:all.length,items:all.slice(0,max)};
}
export async function researchLoc(input,getXml,{max=40,onProgress=()=>{}}={}){
 const selected=queueUnknown(input,max),findings=[];
 const stats={explicit_format:0,no_explicit_format:0,no_result:0,
  isbn_mismatch:0,title_mismatch:0,author_mismatch:0,
  conflicting_formats:0,sru_diagnostic:0,error:0,other:0};
 for(const {book,edition} of selected.items){
  const isbn=edition.isbn13;let finding;
  try{
   const decision=evaluateLocMarc(await getXml(isbn),book,edition);
   finding={title:book.title,isbn13:isbn,editionSourceKey:edition.sourceKey,
    status:decision.status,...(decision.format?{format:decision.format}:{}),
    ...(decision.basis?{basis:decision.basis}:{}),
    sourceUrl:buildSruUrl(isbn)};
  }catch(e){
   finding={title:book.title,isbn13:isbn,editionSourceKey:edition.sourceKey,
    status:'error',error:String(e).slice(0,160)};
  }
  stats[finding.status in stats?finding.status:'other']++;
  findings.push(finding);onProgress(findings.length,selected.items.length,finding);
 }
 return {mode:'library_of_congress_sru_review_only',importEligible:false,
  totals:{works:input.candidates.length,unknownWithIsbn:selected.all,
   attempted:findings.length,explicitFormatProposals:stats.explicit_format,
   remainingUnknownFormats:input.candidates.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0)},
  statusCounts:stats,findings,
  notes:['Uses official Library of Congress SRU bath.isbn query and MARCXML record data.',
   'Exact ISBN, title and author match required. Binding qualifiers only apply to the matched ISBN.',
   'No candidate edits, permanent publisher text import, or production database writes.']};
}
export async function run(argv){
 const options={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out','--max','--delay-ms','--api-base'].includes(argv[i])||!argv[i+1])
   throw Error('Unknown option or missing value: '+argv[i]);
  options[argv[i]]=argv[i+1];
 }
 if(!options['--input']||!options['--out'])throw Error('Required --input --out');
 const max=Number(options['--max']??40),delay=Number(options['--delay-ms']??700);
 if(!Number.isInteger(max)||max<1||max>100||!Number.isInteger(delay)||delay<250||delay>10000)
  throw Error('Invalid max or delay');
 const base=(options['--api-base']||BASE);
 if(options['--api-base']&&!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/.*)?$/.test(base))
  throw Error('Custom URL must be localhost test fixture');
 const out=resolve(options['--out']),cache=join(out,'loc-sru-cache');
 mkdirSync(cache,{recursive:true});
 let requests=0,cacheHits=0;
 const getXml=async isbn=>{
  const file=join(cache,isbn+'.xml');
  if(existsSync(file)){cacheHits++;return readFileSync(file,'utf8')}
  await pause(delay);
  const response=await fetch(buildSruUrl(isbn,base),{headers:{Accept:'application/xml',
   'User-Agent':'ChapterAndSoundPilot/0.1 (bibliographic ISBN research)'},
   signal:AbortSignal.timeout(18000)});
  requests++;
  if(!response.ok)throw Error('Library of Congress HTTP '+response.status);
  const xml=await response.text();
  if(!/<(?:\w+:)?searchRetrieveResponse\b/i.test(xml))throw Error('Invalid SRU response');
  writeFileSync(file+'.partial',xml);renameSync(file+'.partial',file);
  return xml;
 };
 const report=await researchLoc(JSON.parse(readFileSync(resolve(options['--input']),'utf8')),
  getXml,{max,onProgress:(done,total,f)=>console.error('[loc-sru] '+done+'/'+total+' '+f.isbn13+' '+f.status)});
 report.totals.requests=requests;report.totals.cacheHits=cacheHits;
 const file=join(out,'loc-sru-report.json');
 writeFileSync(file+'.partial',JSON.stringify(report,null,2)+'\n');renameSync(file+'.partial',file);
 return {report:file,totals:report.totals,statusCounts:report.statusCounts,
  status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2)))
 .catch(e=>{console.error(e);process.exitCode=1});
