#!/usr/bin/env node
/**
 * Prepare a deterministic, no-write candidate manifest from official Open Library
 * monthly TSV dumps. Works/editions/authors are streamed as gzipped records:
 *   type TAB key TAB revision TAB modified TAB JSON
 *
 * No network calls, no R2/Cloudflare writes. This is a staging preprocessor,
 * not a production importer. Only requested work keys are considered.
 */
import {createReadStream,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {resolve,join} from 'node:path';

function usage(){
 console.error('Usage: node scripts/prepare-openlibrary-pilot.mjs --works works.txt.gz --authors authors.txt.gz --editions editions.txt.gz (--seeds pilot-work-keys.txt | --author-key /authors/OL1516279A --titles-file pilot-titles.txt | --author-name "Simon Kernick" --max 10) --out .private-catalogue-pilot');
 process.exitCode=2;
}
const opts={};
for(let i=2;i<process.argv.length;i+=2){opts[process.argv[i]]=process.argv[i+1]}
const needed=['--works','--authors','--editions','--out'];
if(needed.some(key=>!opts[key])||(!opts['--seeds']&&!opts['--author-name']&&!opts['--author-key'])){usage();process.exit(2)}
if([opts['--seeds'],opts['--author-name'],opts['--author-key']].filter(Boolean).length!==1)
 throw Error('Choose exactly one: --seeds, --author-name, or --author-key.');
if(opts['--author-key']&&!/^\/authors\/OL\d+A$/.test(opts['--author-key']))
 throw Error('Invalid Open Library author key.');
if(opts['--titles-file']&&!opts['--author-key']&&!opts['--author-name'])
 throw Error('--titles-file requires --author-key or --author-name.');
const output=resolve(opts['--out']);
const resolution=opts['--resolution-file']?JSON.parse(readFileSync(opts['--resolution-file'],'utf8')):null;
const resolutionByTitle=new Map();
if(resolution){
 if(!opts['--author-key']||resolution.authorKey!==opts['--author-key'])
  throw Error('Resolution author key must match --author-key.');
 if(!Array.isArray(resolution.books)||!resolution.books.length)throw Error('Resolution must contain books.');
 const seenKeys=new Set();
 for(const book of resolution.books){
  const title=String(book.title||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const keys=[book.canonicalWorkKey,...(book.aliasWorkKeys||[])];
  if(!title||resolutionByTitle.has(title)||keys.length<1||keys.some(k=>!/^\/works\/OL\d+W$/.test(k)||seenKeys.has(k)))
   throw Error('Resolution contains duplicate titles, work keys, or invalid identifiers.');
  for(const key of keys)seenKeys.add(key);
  resolutionByTitle.set(title,{...book,keys});
 }
}
const max=Number(opts['--max']||10);
if(!Number.isInteger(max)||max<1||max>250)throw Error('--max must be between 1 and 250.');
const normalize=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' '):'';
const normalizeTitle=value=>normalize(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const requestedTitles=opts['--titles-file']
 ?readFileSync(opts['--titles-file'],'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')).map(normalizeTitle).filter(Boolean)
 :[];
if(requestedTitles.length>250||new Set(requestedTitles).size!==requestedTitles.length)
 throw Error('Title list must contain unique titles (maximum 250).');
const matchedTitles=new Map();
const unresolvedTitles=[];
const candidateAlternatives=new Set();
const wanted=new Set(opts['--seeds']?readFileSync(opts['--seeds'],'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')):[]);
if(opts['--seeds']&&(!wanted.size||wanted.size>250||[...wanted].some(x=>!/^\/works\/OL\d+W$/.test(x)))){
 throw Error('Seed file must contain 1–250 unique Open Library work keys, e.g. /works/OL123W.');
}
mkdirSync(output,{recursive:true});
const workRecords=new Map(),authors=new Map(),editions=new Map();
const valid13=value=>{
 const v=normalize(value).replace(/[ -]/g,'');
 if(!/^\d{13}$/.test(v)||!/^97[89]/.test(v))return false;
 const sum=v.slice(0,12).split('').reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(v[12]);
};
async function scan(path,onRecord){
 console.error('[catalogue] Scanning '+path);
 const started=Date.now();
 const stream=createReadStream(path).pipe(createGunzip());
 const lines=createInterface({input:stream,crlfDelay:Infinity});
 let seen=0,parsed=0;
 for await(const line of lines){
  seen++;
  if(seen%1000000===0)console.error('[catalogue] '+path+': '+seen.toLocaleString('en-GB')+' records read ('+Math.round((Date.now()-started)/1000)+'s)');
  const chunks=line.split('\t');
  if(chunks.length<5)continue;
  let record;
  try{record=JSON.parse(chunks.slice(4).join('\t'))}catch{continue}
  await onRecord(chunks[1],record);
  parsed++;
 }
 console.error('[catalogue] Finished '+path+': '+seen.toLocaleString('en-GB')+' records ('+Math.round((Date.now()-started)/1000)+'s)');
 return {lines:seen,parsed};
}
if(opts['--author-name']||opts['--author-key']){
 const authorName=String(opts['--author-name']||'').trim().normalize('NFKC').toLocaleLowerCase('en-GB');
 const matching=opts['--author-key']?[opts['--author-key']]:[];
 if(!opts['--author-key']){
  if(!authorName)throw Error('Provide an author name for automated pilot selection.');
  await scan(opts['--authors'],(key,record)=>{
   if(normalize(record.name).toLocaleLowerCase('en-GB')===authorName&&/^\/authors\/OL\d+A$/.test(key))
    matching.push(key);
  });
 }
 if(matching.length!==1)throw Error('Author name matched '+matching.length+' profiles. Resolve the exact author identity before pilot selection.');
 const possible=[];
 await scan(opts['--works'],(key,record)=>{
  if(!/^\/works\/OL\d+W$/.test(key))return;
  const keys=(record.authors||[]).map(a=>a?.author?.key||a?.key);
  if(!keys.includes(matching[0]))return;
  const norm=normalizeTitle(record.title);
  if(requestedTitles.length){
   const match=requestedTitles.find(title=>norm===title||norm.startsWith(title+' '));
   if(!match)return;
   const found=matchedTitles.get(match)||[];
   found.push({key,title:record.title,firstPublicationDate:normalize(record.first_publish_date),
    hasDescription:Boolean(normalize(typeof record.description==='string'?record.description:record.description?.value)),
    subjectCount:Array.isArray(record.subjects)?record.subjects.length:0});
   matchedTitles.set(match,found);
  }else possible.push({key,title:record.title});
 });
 if(requestedTitles.length){
  if(resolution && (resolutionByTitle.size!==Math.min(requestedTitles.length,max)||
   requestedTitles.slice(0,max).some(t=>!resolutionByTitle.has(t))))
   throw Error('Resolution must map each requested title exactly once.');
  for(const title of requestedTitles.slice(0,max)){
   const matches=matchedTitles.get(title)||[];
   const plan=resolutionByTitle.get(title);
   const observed=new Set(matches.map(x=>x.key));
   if(plan){
    const expected=new Set(plan.keys);
    if(observed.size!==expected.size||[...observed].some(k=>!expected.has(k))){
     unresolvedTitles.push({title,reason:'resolution_mismatch_new_or_missing_source_work',
      options:matches.sort((a,b)=>a.key.localeCompare(b.key)),expectedWorkKeys:plan.keys});
     for(const match of matches)candidateAlternatives.add(match.key);
    }else{
     wanted.add(plan.canonicalWorkKey);
     for(const key of plan.aliasWorkKeys||[])candidateAlternatives.add(key);
    }
   }else if(matches.length!==1){
    unresolvedTitles.push({title,reason:matches.length?'ambiguous_work_identity':'source_work_not_found',
     options:matches.sort((a,b)=>a.key.localeCompare(b.key))});
    for(const match of matches)candidateAlternatives.add(match.key);
   }else wanted.add(matches[0].key);
  }
 }else{
  // Do not automatically select two work records carrying the same normalised title.
  const byTitle=new Map();
  for(const entry of possible){
   const title=normalizeTitle(entry.title);
   if(!byTitle.has(title))byTitle.set(title,[]);
   byTitle.get(title).push(entry.key);
  }
  for(const [title,keys] of [...byTitle.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
   if(keys.length!==1)continue;
   wanted.add(keys[0]);
   if(wanted.size>=max)break;
  }
 }
 if(!wanted.size&&!candidateAlternatives.size)throw Error('No source works match the pilot selection.');
}
// Read every competing source record and its linked editions for the review report.
const scannedKeys=new Set([...wanted,...candidateAlternatives]);
const workScan=await scan(opts['--works'],(key,record)=>{
 if(scannedKeys.has(key)){
  const authorKeys=(record.authors||[]).map(a=>a?.author?.key||a?.key).filter(x=>typeof x==='string');
  workRecords.set(key,{key,title:normalize(record.title),authorKeys,
   description:normalize(typeof record.description==='string'?record.description:record.description?.value),
   subjects:(record.subjects||[]).filter(x=>typeof x==='string').map(normalize).filter(Boolean).slice(0,40),
   originalLanguage:normalize(record.original_language?.key||record.original_language),
   firstPublicationDate:normalize(record.first_publish_date),
   revision:record.revision||null});
 }
});
const authorIds=new Set([...workRecords.values()].flatMap(w=>w.authorKeys));
const authorScan=await scan(opts['--authors'],(key,record)=>{
 if(authorIds.has(key)&&normalize(record.name))authors.set(key,normalize(record.name));
});
const editionScan=await scan(opts['--editions'],(key,record)=>{
 const refs=(record.works||[]).map(x=>x?.key).filter(x=>scannedKeys.has(x));
 if(!refs.length)return;
 const isbns=(record.isbn_13||[]).map(normalize).filter(valid13);
 const isbn10s=(record.isbn_10||[]).map(normalize).filter(x=>/^\d{9}[\dXx]$/.test(x));
 const normalizedFormat=normalize(record.physical_format).toLowerCase();
 const format=normalizedFormat.includes('paperback')?'paperback':
  normalizedFormat.includes('hardcover')||normalizedFormat.includes('hardback')?'hardback':
  normalizedFormat.includes('ebook')||normalizedFormat.includes('electronic')?'ebook':
  normalizedFormat.includes('audio')?'audiobook':'';
 for(const workKey of refs){
  // Candidate identity is edition-specific; never guess an ISBN from a work aggregate.
  const item={sourceKey:key,format,isbn13:[...new Set(isbns)].length===1?isbns[0]:'',
   isbn10:[...new Set(isbn10s)].length===1?isbn10s[0]:'',
   publicationDate:normalize(record.publish_date),publisher:normalize(record.publishers?.[0]),
   language:normalize(record.languages?.[0]?.key?.split('/').pop()),
   pageCount:Number.isSafeInteger(record.number_of_pages)?record.number_of_pages:null};
  if(!editions.has(workKey))editions.set(workKey,[]);
  editions.get(workKey).push(item);
 }
});
const candidates=[],errors=[];
for(const key of wanted){
 const work=workRecords.get(key);
 if(!work){errors.push({key,reason:'Work key not found in dump'});continue}
 const names=work.authorKeys.map(k=>authors.get(k)).filter(Boolean);
 if(!names.length){errors.push({key,reason:'Author identity missing in author dump'});continue}
 if(!work.title){errors.push({key,reason:'Work title missing'});continue}
 const plan=resolution?[...resolutionByTitle.values()].find(p=>p.canonicalWorkKey===key):null;
 const sourceWorkKeys=plan?plan.keys:[key];
 const allRaw=sourceWorkKeys.flatMap(sourceKey=>(editions.get(sourceKey)||[]).map(e=>({...e,sourceWorkKeys:[sourceKey]})))
  .sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey));
 if(!allRaw.length){errors.push({key,reason:'No edition records found for work; retained as unresolved'});continue}
 // Duplicate source identifiers and identical ISBNs collapse into a single edition.
 // Keep every Open Library source key for provenance and manual review.
 const byIdentity=new Map();
 const duplicateEditionGroups=[];
 for(const edition of allRaw){
  const identity=edition.isbn13?'isbn13:'+edition.isbn13:
   edition.isbn10?'isbn10:'+edition.isbn10:'openlibrary:'+edition.sourceKey;
  if(byIdentity.has(identity)){
   const existing=byIdentity.get(identity);
   existing.sourceWorkKeys=[...new Set([...existing.sourceWorkKeys,...edition.sourceWorkKeys])];
   existing.aliasEditionSourceKeys=[...new Set([...(existing.aliasEditionSourceKeys||[]),edition.sourceKey])];
   if(['format','publisher','publicationDate','language'].some(field=>existing[field]&&edition[field]&&existing[field]!==edition[field]))
    errors.push({key,reason:'Conflicting metadata across editions sharing '+identity+'; verify before import'});
   duplicateEditionGroups.push({identity,sourceKey:edition.sourceKey,retainedKey:existing.sourceKey});
  }else byIdentity.set(identity,edition);
 }
 const all=[...byIdentity.values()];
 const selected=all.find(e=>e.isbn13)||all[0];
 candidates.push({sourceId:'openlibrary',sourceKey:key,workSourceKey:key,sourceWorkKeys,
  identityStatus:plan?'provisional_review_required':'single_source_work',title:work.title,author:names[0],
  authorSourceKeys:work.authorKeys,description:work.description,subjects:work.subjects,
  originalLanguage:work.originalLanguage,firstPublicationDate:work.firstPublicationDate,
  isbn13:selected.isbn13,format:selected.format,editions:all,
  duplicateEditionGroups});
 if(all.some(e=>!e.isbn13&&!e.isbn10))errors.push({key,reason:'Some editions lack usable ISBNs; retained for review'});
 if(all.some(e=>!e.format||!e.publisher||!e.publicationDate||!e.language))errors.push({key,reason:'Some editions have incomplete format, publisher, release date or language; retained for enrichment'});
 if(names.length>1)errors.push({key,reason:'Multiple author contributors require manual review before applying: '+names.join(', ')});
}
// Potential duplicates are never silently imported. Report all work alternatives,
 // including edition counts and a small set of source-linked identifiers.
for(const unresolved of unresolvedTitles){
 for(const option of unresolved.options){
  const linked=editions.get(option.key)||[];
  const record=workRecords.get(option.key);
  option.editionCount=linked.length;
  option.verifiedIsbns=[...new Set(linked.map(e=>e.isbn13).filter(Boolean))].slice(0,8);
  option.descriptionPreview=record?.description.slice(0,200)||'';
  option.firstPublicationDate=record?.firstPublicationDate||option.firstPublicationDate;
 }
}
const files=[];
for(let i=0;i<candidates.length;i+=100){
 const name='candidates-'+String(Math.floor(i/100)+1).padStart(2,'0')+'.json';
 writeFileSync(join(output,name),JSON.stringify({candidates:candidates.slice(i,i+100)},null,2)+'\n');
 files.push(name);
}
const report={generatedAt:new Date().toISOString(),source:'Open Library monthly dumps',selection:opts['--author-name']||opts['--author-key']?{authorName:opts['--author-name']||null,authorKey:opts['--author-key']||null,titles:requestedTitles,max}:null,requested:requestedTitles.length?Math.min(requestedTitles.length,max):wanted.size,selectedWorkKeys:wanted.size,worksFound:workRecords.size,authorsFound:authors.size,
 editionsMatched:[...editions.values()].reduce((sum,value)=>sum+value.length,0),
 candidates:candidates.length,reviewItems:errors.length+unresolvedTitles.length+candidates.filter(c=>c.identityStatus==='provisional_review_required').length,files,errors,
 unresolvedTitles,needsIdentityReview:unresolvedTitles.length+
 candidates.filter(c=>c.identityStatus==='provisional_review_required').length,
 resolutionUsed:Boolean(resolution),sourceWorkAliases:candidates.reduce((n,c)=>n+c.sourceWorkKeys.length-1,0),
 collapsedDuplicateEditions:candidates.reduce((n,c)=>n+c.duplicateEditionGroups.length,0),
 scan:{works:workScan,authors:authorScan,editions:editionScan},
 caveats:['No database writes performed','All edition records for each seeded work are retained, including editions with incomplete metadata','Authors with multiple creators need identity review','Cover processing is deferred','Audiobook narrator and duration may need additional licensed metadata','Output needs a BOOK_DB dry-run preview before any future ingestion']};
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,candidates:candidates.length,
 needsIdentityReview:unresolvedTitles.length+candidates.filter(c=>c.identityStatus==='provisional_review_required').length,
 reviewItems:errors.length+unresolvedTitles.length+candidates.filter(c=>c.identityStatus==='provisional_review_required').length,
 files,report:'report.json'},null,2));
