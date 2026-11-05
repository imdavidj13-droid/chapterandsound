#!/usr/bin/env node
/**
 * Read-only field dispute workbench for the ISBNdb pilot.
 * Input: existing local comparison and canonical catalogue manifest.
 * Output: per-field source evidence, conflict triage and publication gates.
 * No network calls, no imports, no catalogue writes.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const normalize=x=>String(x??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const monthNames=new Map([['jan',1],['feb',2],['mar',3],['apr',4],['may',5],['jun',6],['jul',7],['aug',8],['sep',9],['oct',10],['nov',11],['dec',12]]);
function dateParts(raw){
 const s=String(raw??'').trim();
 let m=s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
 if(m){const y=+m[1],mo=m[2]?+m[2]:null,d=m[3]?+m[3]:null;
  if(y<1450||y>2100||mo!==null&&(mo<1||mo>12)||d!==null&&(d<1||d>31))return null;
  return {year:y,month:mo,day:d};}
 m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
 if(m){const mo=monthNames.get(m[2].slice(0,3).toLowerCase());if(!mo)return null;
  const d=+m[1],y=+m[3];return y>=1450&&y<=2100&&d>=1&&d<=31?{year:y,month:mo,day:d}:null}
 m=s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
 if(m){const mo=monthNames.get(m[1].slice(0,3).toLowerCase());if(!mo)return null;
  const d=+m[2],y=+m[3];return y>=1450&&y<=2100&&d>=1&&d<=31?{year:y,month:mo,day:d}:null}
 return null;
}
export function classifyDispute(field,existing,observed){
 if(field==='publisher'){
  const a=normalize(existing),b=normalize(observed);
  if(a===b)return {kind:'equivalent_normalized',needsReview:false};
  return {kind:'publisher_or_imprint_disagreement',needsReview:true};
 }
 if(field==='publicationDate'){
  const a=dateParts(existing),b=dateParts(observed);
  if(a&&b){
   if(a.year===b.year&&
      (a.month===null||b.month===null||a.month===b.month)&&
      (a.day===null||b.day===null||a.day===b.day))
     return {kind:'different_date_precision',needsReview:true};
   return {kind:'different_publication_dates',needsReview:true};
  }
  return {kind:'unparsed_date_disagreement',needsReview:true};
 }
 if(field==='pageCount'){
  const a=Number(existing),b=Number(observed);
  return {kind:Number.isSafeInteger(a)&&Number.isSafeInteger(b)?
   'edition_pagination_disagreement':'non_numeric_page_count',needsReview:true};
 }
 return {kind:'other_field_disagreement',needsReview:true};
}
const fieldMap={publisher:'publisher',publicationDate:'publicationDate',pageCount:'pageCount',language:'language',format:'format'};
const sourceChoices={
 identity:['publisher_exact_product','national_bibliography','isbn_authority','openlibrary','isbndb','hardcover'],
 format:['publisher_exact_product','national_bibliography_explicit_binding','isbn_specific_catalogue','isbndb_explicit_binding','openlibrary_explicit_binding'],
 publisher:['publisher_exact_product','national_bibliography','isbn_specific_catalogue','isbndb','openlibrary'],
 publicationDate:['publisher_exact_edition','national_bibliography','isbn_specific_catalogue','isbndb'],
 pageCount:['publisher_exact_edition','national_bibliography','isbn_specific_catalogue','isbndb'],
 language:['publisher_exact_edition','national_bibliography','isbn_specific_catalogue','isbndb'],
 audio:['audio_publisher_exact_recording','producer_catalogue','audio_distributor_authorized_feed']
};
function nextSource(field){
 return sourceChoices[field]||['publisher_exact_edition','national_bibliography','source_with_explicit_field'];
}
export function buildDisputeWorkbench(manifest,comparison){
 if(!Array.isArray(manifest?.candidates)||manifest.candidates.length!==10||
  comparison?.status!=='OFFLINE_REVIEW_ONLY_NO_DATABASE_WRITES'||
  !Array.isArray(comparison.findings)||!Array.isArray(comparison.unresolved))
  throw Error('Expected canonical ten-work manifest and offline ISBNdb comparison');
 const byEdition=new Map();
 for(const work of manifest.candidates)for(const ed of work.editions||[]){
  if(byEdition.has(ed.sourceKey))throw Error('Duplicate edition source key');
  byEdition.set(ed.sourceKey,{work,ed});
 }
 const disputes=[],missing=[],unresolvedIsbn=[];
 for(const f of comparison.findings){
  if(!f.editionSourceKey||!byEdition.has(f.editionSourceKey))continue;
  const {work,ed}=byEdition.get(f.editionSourceKey);
  if(work.title!==f.title||ed.isbn13!==f.isbn13)continue;
  for(const [field,c] of Object.entries(f.conflicts||{})){
   const classification=classifyDispute(field,c.existing,c.observed);
   const p=ed.fieldProvenance?.[field]||null;
   disputes.push({title:work.title,editionSourceKey:ed.sourceKey,isbn13:ed.isbn13,
    field,existing:c.existing,existingSource:p?.source||null,
    existingSourceUrl:p?.url||p?.sourceUrl||null,
    observed:c.observed,observedSource:'isbndb',
    observedSourceUrl:f.sourceRecordUrl||null,
    ...classification,decision:'REVIEW_HOLD_NO_AUTOMATIC_OVERWRITE',
    preferredResearchSequence:nextSource(field)});
  }
  for(const [field,value] of Object.entries(f.candidates||{})){
   if(field==='format')continue;
   const p=ed.fieldProvenance?.[field]||null;
   missing.push({title:work.title,editionSourceKey:ed.sourceKey,isbn13:ed.isbn13,
    field,value,observedSource:'isbndb',sourceRecordUrl:f.sourceRecordUrl||null,
    currentProvenance:p?.source||null,decision:'REVIEW_HOLD_NO_AUTOMATIC_FILL',
    preferredResearchSequence:nextSource(field)});
  }
 }
 for(const u of comparison.unresolved){
  const located=byEdition.get(u.editionSourceKey);
  if(!located)throw Error('Unresolved edition not in manifest: '+u.editionSourceKey);
  const ed=located.ed;
  unresolvedIsbn.push({
   title:u.title,editionSourceKey:u.editionSourceKey,primaryIsbn13:ed.isbn13||null,
   candidateIsbn13s:(ed.isbn13Candidates||[]).filter(x=>x!==ed.isbn13),
   proposedFormat:u.proposedFormat||null,
   status:u.proposedFormat?'PROVISIONAL_FORMAT_REVIEW':
    ed.isbn13?'EXACT_ISBN_SOURCE_RESEARCH':'QUARANTINE_IF_NO_INDEPENDENT_PRODUCT_ID',
   preferredResearchSequence:ed.isbn13?nextSource('format'):nextSource('identity'),
   note:u.proposedFormat?'ISBNdb proposal is not independent binding verification':
    'Do not infer audio/ebook/print from publisher name or ISBN prefix'
  });
 }
 const fieldGroups={};
 for(const d of disputes)fieldGroups[d.field]=(fieldGroups[d.field]||0)+1;
 const disputeKinds={};
 for(const d of disputes)disputeKinds[d.kind]=(disputeKinds[d.kind]||0)+1;
 return {status:'OFFLINE_REVIEW_ONLY_NO_API_CALLS_NO_DATABASE_WRITES',
  totals:{disputes:disputes.length,metadataCandidates:missing.length,
   unresolved:unresolvedIsbn.length,unresolvedPrimaryIsbn:unresolvedIsbn.filter(x=>x.primaryIsbn13).length,
   unresolvedWithoutPrimaryIsbn:unresolvedIsbn.filter(x=>!x.primaryIsbn13).length,
   provisionalFormatCandidates:unresolvedIsbn.filter(x=>x.proposedFormat).length},
  fieldGroups,disputeKinds,sourceSequences:sourceChoices,
  disputes,metadataCandidates:missing,unresolved:unresolvedIsbn,
  policy:['Source priority determines who to consult first, never automatic overwrite.',
   'All edition-specific disagreements remain held until independently verified.',
   'Publisher vs imprint and different date precision need context; neither is automatically an error.',
   'Record provenance independently for every field and each contradictory observation.',
   'An Open Library ID alone is not proof of a distinct market edition.',
   'Check supplier licence before long-term storage, public display, or commercial reuse.',
   'No API calls, no catalogue edits, no database writes.']};
}
export function run(argv){
 const o={};for(let i=0;i<argv.length;i+=2){
  if(!['--input','--comparison','--out'].includes(argv[i])||!argv[i+1])
   throw Error('Unexpected or missing argument '+argv[i]);
  o[argv[i]]=argv[i+1];
 }
 if(!o['--input']||!o['--comparison']||!o['--out'])
  throw Error('Required --input --comparison --out');
 const report=buildDisputeWorkbench(
  JSON.parse(readFileSync(resolve(o['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(o['--comparison']),'utf8')));
 const dir=resolve(o['--out']);mkdirSync(dir,{recursive:true});
 const filepath=join(dir,'catalogue-isbndb-source-dispute-workbench.json');
 writeFileSync(filepath+'.partial',JSON.stringify(report,null,2)+'\n');
 renameSync(filepath+'.partial',filepath);
 return {report:filepath,status:report.status,totals:report.totals,
  fieldGroups:report.fieldGroups,disputeKinds:report.disputeKinds,
  unresolved:report.unresolved};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(e){console.error('[source-disputes] '+e.message);process.exitCode=1}
