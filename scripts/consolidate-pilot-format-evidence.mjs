#!/usr/bin/env node
/**
 * Consolidate reviewed ISBN evidence over one canonical ten-book pilot manifest.
 * Idempotent: re-running on an already-enriched manifest preserves its fields.
 * Outputs ONLY new, local, review-only files; never touches D1 or source input.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reconcileFormats} from './reconcile-targeted-edition-formats.mjs';
import {createFormatResearchQueue} from './create-unknown-format-queue.mjs';

export const EVIDENCE_FILES=[
 'simon-kernick-exact-isbn-format-evidence-20261105.json',
 'simon-kernick-exact-isbn-format-evidence-batch2-20261105.json',
 'simon-kernick-exact-isbn-format-evidence-batch3-20261105.json',
 'simon-kernick-exact-isbn-format-evidence-batch4-20261105.json'
];

function tally(candidates){
 const editions=candidates.flatMap(b=>b.editions||[]);
 return {works:candidates.length,editions:editions.length,
  knownFormats:editions.filter(e=>e.format&&e.format!=='unknown').length,
  unknownFormats:editions.filter(e=>!e.format||e.format==='unknown').length,
  largePrint:editions.filter(e=>e.largePrint===true).length};
}
function validatePilot(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)
  throw Error('Expected exactly ten canonical work candidates');
 const keys=new Set(),isbnToWork=new Map();
 for(const book of input.candidates){
  if(!book.title||!book.author||!book.workSourceKey||!Array.isArray(book.editions))
   throw Error('Incomplete canonical work');
  for(const ed of book.editions){
   // Preserve canonical Open Library edition IDs and source-qualified audio
   // identifiers. A source-qualified ID is not an Open Library edition key.
   const validSourceKey=typeof ed.sourceKey==='string'&&
    (/^\/books\/OL\d+M$/.test(ed.sourceKey)||
     /^[a-z][a-z0-9_-]*:isbn13:97[89]\d{10}$/.test(ed.sourceKey));
   if(!validSourceKey||keys.has(ed.sourceKey))
    throw Error('Invalid or duplicate edition source key: '+ed.sourceKey);
   keys.add(ed.sourceKey);
   if(ed.isbn13){
    const old=isbnToWork.get(ed.isbn13);
    if(old&&old!==book.workSourceKey)throw Error('ISBN attached to multiple works: '+ed.isbn13);
    isbnToWork.set(ed.isbn13,book.workSourceKey);
   }
  }
 }
}
function reviewTier(source){
 if(/official|penguin|simon_and_schuster/.test(source||''))return 'publisher_observation';
 if(/national_bibliography|open_library/.test(source||''))return 'bibliographic_observation';
 return 'retailer_or_community_observation';
}
export function consolidatePilot(input,batches){
 validatePilot(input);
 if(!Array.isArray(batches)||!batches.length)throw Error('At least one evidence batch required');
 const original=tally(input.candidates),seen=new Map(),batchReports=[],warnings=[];
 let current={candidates:structuredClone(input.candidates)};
 for(let i=0;i<batches.length;i++){
  const batch=batches[i];
  if(!Array.isArray(batch?.records)||batch.reviewOnly!==true||batch.importEligible!==false)
   throw Error('Invalid or non-review evidence batch '+(i+1));
  for(const evidence of batch.records){
   const key=evidence.editionSourceKey+'|'+evidence.isbn13;
   const previous=seen.get(key);
   if(previous){
    if(previous.format!==evidence.format||previous.feature!==evidence.feature)
     throw Error('Contradictory evidence batches for '+key);
    warnings.push({type:'duplicate_evidence_observation',key,batches:[previous.batch,i+1]});
   }else seen.set(key,{...evidence,batch:i+1});
  }
  const result=reconcileFormats(current,batch);
  if(result.report.totals.conflicts||result.report.totals.unmatched)
   throw Error('Evidence batch '+(i+1)+' has '+result.report.totals.conflicts+
    ' conflicts and '+result.report.totals.unmatched+' unmatched. Nothing written.');
  batchReports.push({batch:i+1,evidenceRecords:batch.records.length,
   ...result.report.totals});
  current=result.candidates;
 }
 const after=tally(current.candidates);
 const queue=createFormatResearchQueue(current);
 const sourceEvidence=[...seen.values()].map(x=>({
  title:x.title,editionSourceKey:x.editionSourceKey,isbn13:x.isbn13,
  format:x.format,feature:x.feature,source:x.source,sourceUrl:x.sourceUrl,
  evidenceTier:reviewTier(x.source),reviewRequired:true
 }));
 const rows=queue.queue.map(row=>{
  const source=current.candidates.find(b=>b.workSourceKey===row.workSourceKey)
   ?.editions.find(e=>e.sourceKey===row.editionSourceKey);
  return {...row,publisher:source?.publisher||null,largePrint:source?.largePrint===true,
   researchRoute:row.hasUsableISBN?'exact_isbn_publisher_or_national_bibliography':
    'edition_identity_no_isbn',
   priorOpenLibraryCheck:'exhausted_exact_edition_no_explicit_format'};
 });
 const report={mode:'pilot_evidence_consolidation',status:'REVIEW_ONLY_NO_DATABASE_WRITES',
  importEligible:false,baseline:original,totals:after,
  delta:{formatsResolved:original.unknownFormats-after.unknownFormats,
   largePrintTagsAdded:after.largePrint-original.largePrint},
  evidence:{records:sourceEvidence.length,publisher:sourceEvidence.filter(x=>x.evidenceTier==='publisher_observation').length,
   bibliographic:sourceEvidence.filter(x=>x.evidenceTier==='bibliographic_observation').length,
   retailerOrCommunity:sourceEvidence.filter(x=>x.evidenceTier==='retailer_or_community_observation').length},
  batches:batchReports,remaining:{withISBN:queue.totals.withISBN,
   withoutISBN:queue.totals.withoutISBN,sharedISBNGroups:queue.totals.sharedISBNGroups},
  warnings,notes:['Existing values are retained; the original manifest is never overwritten.',
   'All evidence remains provisional until source identity, reliability and reuse rights are approved.',
   'ISBN-less editions are queued for identity research, never assigned a format from publisher names.',
   'No Cloudflare database access, merges, imports, covers or publication.']};
 return {manifest:{...current,mode:'consolidated_review_only',importEligible:false},
  report,queue:{...queue,queue:rows},evidence:{records:sourceEvidence,mode:'review_only'}};
}
function parse(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out','--evidence-dir'].includes(argv[i])||!argv[i+1])
   throw Error('Unknown or missing option '+argv[i]);
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Required --input and --out');
 return opts;
}
export function run(argv){
 const opts=parse(argv);
 const input=JSON.parse(readFileSync(resolve(opts['--input']),'utf8'));
 const evidenceDir=resolve(opts['--evidence-dir']||'pilot');
 const batches=EVIDENCE_FILES.map(name=>JSON.parse(readFileSync(join(evidenceDir,name),'utf8')));
 const result=consolidatePilot(input,batches);
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 for(const [name,value] of [
  ['catalogue-consolidated-review.json',result.manifest],
  ['catalogue-consolidation-report.json',result.report],
  ['catalogue-unresolved-research-queue.json',result.queue],
  ['catalogue-evidence-review.json',result.evidence]
 ]){
  const dest=join(dir,name);
  writeFileSync(dest+'.partial',JSON.stringify(value,null,2)+'\n');
  renameSync(dest+'.partial',dest);
 }
 return {status:result.report.status,report:join(dir,'catalogue-consolidation-report.json'),
  totals:result.report.totals,delta:result.report.delta,remaining:result.report.remaining,
  evidence:result.report.evidence};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(e){console.error('[consolidation] '+e.message);process.exitCode=1}
}
