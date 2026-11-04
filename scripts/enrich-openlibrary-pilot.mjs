#!/usr/bin/env node
/**
 * Read-only local edition enrichment and validation for the Simon Kernick pilot.
 * Uses existing API candidate JSON. Optional --isbn-lookups fetches exact ISBNs
 * through Open Library, cache-first; never scans dumps or modifies Cloudflare D1.
 *
 * Output:
 *  enriched-candidates-01.json: canonical work structure + field provenance
 *  enrichment-report.json: explicit blockers, conflicts, and format coverage
 */
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';

const options={};
for(let i=2;i<process.argv.length;i+=2)options[process.argv[i]]=process.argv[i+1];
if(!options['--input']||!options['--out'])
 throw Error('Usage: node scripts/enrich-openlibrary-pilot.mjs --input .private-catalogue-pilot/api-candidates-01.json --out .private-catalogue-pilot [--isbn-lookups]');
const directory=resolve(options['--out']);
mkdirSync(directory,{recursive:true});
const cacheDir=join(directory,'isbn-lookup-cache');
mkdirSync(cacheDir,{recursive:true});
const input=JSON.parse(readFileSync(options['--input'],'utf8'));
if(!Array.isArray(input.candidates)||!input.candidates.length||input.candidates.length>100)
 throw Error('Expected an API candidate file containing 1–100 works');
const lookup=Boolean(options['--isbn-lookups']);
const n=x=>typeof x==='string'?x.trim():'';
const normTitle=x=>n(x).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const valid13=x=>{
 const v=n(x).replace(/[\s-]/g,'');
 if(!/^97[89]\d{10}$/.test(v))return false;
 const sum=[...v.slice(0,12)].reduce((total,c,i)=>total+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(v[12]);
};
const valid10=x=>{
 const v=n(x).replace(/[\s-]/g,'').toUpperCase();
 return /^\d{9}[\dX]$/.test(v)&&[...v].reduce((sum,c,i)=>sum+(10-i)*(c==='X'?10:Number(c)),0)%11===0;
};
const formatOf=value=>{
 const raw=n(value).toLowerCase().replace(/\s+/g,' ');
 if(/\b(?:paperback|mass market|softcover|softback)\b/.test(raw))return 'paperback';
 if(/\b(?:hardcover|hardback|hard cover)\b/.test(raw))return 'hardback';
 if(/\b(?:e-?book|electronic book|kindle edition)\b/.test(raw))return 'ebook';
 if(/\b(?:audiobook|audio book|audio cd|audio cassette|audio download|mp3 cd)\b/.test(raw))return 'audiobook';
 return 'unknown';
};
const save=(path,value)=>{
 const tmp=path+'.partial';
 writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');
 renameSync(tmp,path);
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let requested=0,cached=0,lookupFailures=0;
async function byIsbn(isbn){
 const file=join(cacheDir,isbn+'.json');
 if(existsSync(file)){cached++;return JSON.parse(readFileSync(file,'utf8'))}
 for(let attempt=0;attempt<3;attempt++){
  try{
   await pause(350);
   const response=await fetch('https://openlibrary.org/isbn/'+isbn+'.json',{
    headers:{'Accept':'application/json','User-Agent':'ChapterAndSoundEnrichment/0.1 (low volume; book metadata validation)'},
    signal:AbortSignal.timeout(15000)});
   if(response.status===404){save(file,{notFound:true});requested++;return {notFound:true}}
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   save(file,data);requested++;return data;
  }catch(err){
   if(attempt===2){lookupFailures++;return {error:String(err)}}
   await pause(750*2**attempt);
  }
 }
}
const enriched=[],perBook=[],globalKeys=new Map(),globalIsbn=new Map();
for(const candidate of input.candidates){
 if(!candidate||!n(candidate.title)||!n(candidate.author)||!/^\/works\/OL\d+W$/.test(candidate.workSourceKey))
  throw Error('Invalid candidate canonical work identity');
 if(!Array.isArray(candidate.editions))throw Error('Missing editions for '+candidate.title);
 const issues=[],editions=[];
 for(const original of candidate.editions){
  if(!/^\/books\/OL\d+M$/.test(n(original.sourceKey)))
   throw Error('Invalid edition source identity in '+candidate.title);
  const ed={...original};
  ed.fieldProvenance={format:{source:'openlibrary',field:'physical_format',status:'unverified'}};
  ed.format=formatOf(ed.physicalFormat);
  if(ed.format!=='unknown')ed.fieldProvenance.format.status='source_explicit';
  // Do not convert ISBN-10 to ISBN-13: not every edition record represents the same product.
  const candidates13=[...new Set([...(ed.isbn13Candidates||[]),ed.isbn13].filter(Boolean).map(x=>String(x).replace(/[\s-]/g,'')))];
  const candidates10=[...new Set([...(ed.isbn10Candidates||[]),ed.isbn10].filter(Boolean).map(x=>String(x).replace(/[\s-]/g,'').toUpperCase()))];
  if(candidates13.some(x=>!valid13(x))||candidates10.some(x=>!valid10(x)))
   issues.push({code:'invalid_isbn',edition:ed.sourceKey});
  if(candidates13.length>1||candidates10.length>1)
   issues.push({code:'multiple_isbns_on_one_source_edition',edition:ed.sourceKey,isbns13:candidates13,isbns10:candidates10});
  ed.isbn13=candidates13.length===1&&valid13(candidates13[0])?candidates13[0]:null;
  ed.isbn10=candidates10.length===1&&valid10(candidates10[0])?candidates10[0]:null;
  if(ed.isbn13){
   const previous=globalIsbn.get(ed.isbn13);
   if(previous&&previous!==candidate.workSourceKey)
    issues.push({code:'isbn_linked_to_multiple_canonical_works',edition:ed.sourceKey,isbn:ed.isbn13,otherWork:previous});
   globalIsbn.set(ed.isbn13,candidate.workSourceKey);
  }
  if(globalKeys.has(ed.sourceKey)&&globalKeys.get(ed.sourceKey)!==candidate.workSourceKey)
   issues.push({code:'source_edition_linked_to_multiple_canonical_works',edition:ed.sourceKey,otherWork:globalKeys.get(ed.sourceKey)});
  globalKeys.set(ed.sourceKey,candidate.workSourceKey);
  if(lookup&&ed.isbn13&&ed.format==='unknown'){
   const result=await byIsbn(ed.isbn13);
   if(result.key&&result.isbn_13?.includes(ed.isbn13)){
    // ISBN page can point to a different edition source ID. Treat as verification
    // evidence only when title matches and its declared work is one of the aliases.
    const sameTitle=normTitle(result.title)===normTitle(candidate.title)||
      normTitle(result.title).startsWith(normTitle(candidate.title)+' ');
    const workKeys=(result.works||[]).map(w=>w.key);
    if(sameTitle&&workKeys.some(k=>candidate.sourceWorkKeys.includes(k))){
     const identified=formatOf(result.physical_format);
     if(identified!=='unknown'){
      ed.format=identified;
      ed.fieldProvenance.format={source:'openlibrary_isbn_lookup',identifier:ed.isbn13,
       editionSourceKey:result.key,status:'source_explicit'};
     }
    }else issues.push({code:'isbn_lookup_identity_mismatch',edition:ed.sourceKey,isbn:ed.isbn13,
      lookupKey:result.key,lookupTitle:result.title});
   }else if(result.error)issues.push({code:'isbn_lookup_failed',edition:ed.sourceKey,isbn:ed.isbn13});
  }
  if(ed.format==='unknown')issues.push({code:'format_unverified',edition:ed.sourceKey});
  if(!ed.isbn13&&!ed.isbn10)issues.push({code:'isbn_unavailable',edition:ed.sourceKey});
  if(ed.format==='audiobook'&&!ed.narratorSourceKeys?.length)
   issues.push({code:'audiobook_narrator_unverified',edition:ed.sourceKey});
  if(ed.format==='audiobook'&&!ed.durationSeconds)
   issues.push({code:'audiobook_duration_unverified',edition:ed.sourceKey});
  editions.push(ed);
 }
 for(const conflict of candidate.duplicateEditionGroups||[])
  issues.push({code:'same_isbn_conflicting_metadata',...conflict});
 if(candidate.identityStatus!=='verified')
  issues.push({code:'canonical_work_identity_unreviewed',work:candidate.workSourceKey});
 const canDraft=false; // Import requires manual identity/rights review and DB preview.
 enriched.push({...candidate,editions,identityStatus:candidate.identityStatus||'provisional_review_required',
  importEligible:canDraft,validationIssues:issues});
 perBook.push({title:candidate.title,canonicalWorkKey:candidate.workSourceKey,
  editions:editions.length,formats:editions.reduce((map,e)=>(map[e.format]=(map[e.format]||0)+1,map),{}),
  issueCount:issues.length,issues});
 console.error('[enrichment] '+candidate.title+': '+editions.length+' editions, '+issues.length+' review items');
}
const counts={};
for(const candidate of enriched)for(const e of candidate.editions)counts[e.format]=(counts[e.format]||0)+1;
const report={generatedAt:new Date().toISOString(),mode:'read_only_local_enrichment',
 source:'Open Library candidate manifest'+(lookup?' + exact ISBN lookups':''),
 totals:{books:enriched.length,editions:enriched.reduce((n,b)=>n+b.editions.length,0),
  formats:counts,reviewItems:perBook.reduce((n,b)=>n+b.issueCount,0),
  isbnLookupsRequested:requested,isbnLookupsCached:cached,isbnLookupFailures:lookupFailures},
 reviewRequired:true,databaseWrites:0,publications:0,
 warnings:['ISBN presence alone does not identify paperback/ebook/audio format',
  'Unknown format remains unknown until explicit source evidence is obtained',
  'Audio narrator and duration must be independently verified',
  'Source descriptions and covers require rights checks before public API redistribution',
  'Draft import must pass identity approval, database duplicate preview, and backup/rehearsal'],
 books:perBook};
save(join(directory,'enriched-candidates-01.json'),{candidates:enriched});
save(join(directory,'enrichment-report.json'),report);
console.log(JSON.stringify({output:directory,files:['enriched-candidates-01.json','enrichment-report.json'],
 totals:report.totals,status:'REVIEW_REQUIRED_NO_DATABASE_WRITES'},null,2));
