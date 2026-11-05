#!/usr/bin/env node
/**
 * Offline ISBNdb result comparison against one canonical pilot manifest.
 * Does not call ISBNdb. Does not apply results or overwrite catalogue files.
 * Rechecks exact edition ID, primary ISBN, work title and canonical work key.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const norm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const isSet=v=>v!==undefined&&v!==null&&v!==''&&v!=='unknown';
const keys=['format','publisher','publicationDate','language','pageCount','largePrint'];
export function compareIsbndb(manifest,coverage){
 if(!Array.isArray(manifest?.candidates)||manifest.candidates.length!==10||
 !Array.isArray(coverage?.records))throw Error('Expected canonical pilot and ISBNdb report');
 const editions=new Map();
 for(const work of manifest.candidates)for(const ed of work.editions||[]){
  if(editions.has(ed.sourceKey))throw Error('Duplicate edition identity: '+ed.sourceKey);
  editions.set(ed.sourceKey,{work,ed});
 }
 const findings=[],counters={matched:0,noResult:0,unmatchedIdentity:0,
  ambiguousEdition:0,formatCandidates:0,formatConflicts:0,formatAlreadyKnown:0,
  candidateOnlyIsbns:0,fieldCandidates:0,fieldConflicts:0,withoutFormat:0};
 for(const item of coverage.records){
  if(item.status==='no_result'){counters.noResult++;continue}
  if(item.status!=='identity_matched')continue;
  counters.matched++;
  const targets=(item.editionSourceKeys||[]).map(key=>editions.get(key))
   .filter(Boolean).filter(({work,ed})=>work.workSourceKey===item.workSourceKey&&
    norm(work.title)===norm(item.title)&&ed.isbn13===item.isbn13);
  if(targets.length!==1){
   const row={title:item.title,isbn13:item.isbn13,kind:targets.length?'ambiguous_edition':'unmatched_primary_isbn',
    editionSourceKeys:item.editionSourceKeys||[],notes:'Do not transfer candidate-only ISBN data to another edition'};
   findings.push(row);
   if(targets.length)counters.ambiguousEdition++;else counters.unmatchedIdentity++;
   counters.candidateOnlyIsbns++;continue;
  }
  const {work,ed}=targets[0],fields=item.fields||{};
  const row={title:work.title,isbn13:item.isbn13,editionSourceKey:ed.sourceKey,
   source:'isbndb',sourceRecordUrl:item.sourceRecordUrl||'https://isbndb.com/book/'+item.isbn13,
   rightsStatus:'verify_isbndb_subscription_terms_before_persistence',
   candidates:{},agreements:{},conflicts:{},status:'no_new_metadata'};
  for(const name of keys){
   const value=fields[name];
   if(!isSet(value))continue;
   const existing=ed[name];
   // ISBNdb is a secondary source, and cannot establish a false "no" for large print.
   if(name==='largePrint'&&value!==true)continue;
   if(!isSet(existing)){row.candidates[name]=value; counters.fieldCandidates++;
    if(name==='format')counters.formatCandidates++;
   }else if(norm(existing)===norm(value)||(typeof existing==='number'&&existing===value)){
    row.agreements[name]=value;
    if(name==='format')counters.formatAlreadyKnown++;
   }else{
    row.conflicts[name]={existing,observed:value};
    counters.fieldConflicts++;
    if(name==='format')counters.formatConflicts++;
   }
  }
  if(!fields.format)counters.withoutFormat++;
  row.status=Object.keys(row.conflicts).length?'conflict_review':
   Object.keys(row.candidates).length?'candidate_review':'already_known';
  findings.push(row);
 }
 const unresolved=manifest.candidates.flatMap(book=>(book.editions||[])
  .filter(ed=>!ed.format||ed.format==='unknown')
  .map(ed=>{
   const match=findings.find(x=>x.editionSourceKey===ed.sourceKey);
   return {title:book.title,editionSourceKey:ed.sourceKey,isbn13:ed.isbn13||null,
    proposedFormat:match?.candidates?.format||null,
    conflict:match?.conflicts?.format||null,
    status:match?.candidates?.format?'review_candidate':
     ed.isbn13?'no_matching_explicit_format':'no_isbn_or_verified_product_identity'};
  }));
 return {status:'OFFLINE_REVIEW_ONLY_NO_DATABASE_WRITES',counts:{
  inputEditions:editions.size,coverageRecords:coverage.records.length,
  ...counters,unresolvedEditions:unresolved.length,
  unresolvedWithProposals:unresolved.filter(x=>x.proposedFormat).length,
  unresolvedStillMissing:unresolved.filter(x=>!x.proposedFormat).length},
  findings,unresolved,notes:[
   'Offline report only: no API requests, licence acceptance, data persistence or D1 writes.',
   'Only exact primary edition ISBN matches are eligible for field comparisons.',
   'Provider data from candidate-only ISBNs must be independently assigned to correct editions.',
   'Format conflicts require manual research; absence of a binding remains unknown.',
   'ISBNdb subscription data retention and redistribution rights must be checked before publication.'
  ]};
}
export function run(args){
 const o={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--isbndb','--out'].includes(args[i])||!args[i+1])throw Error('Unknown or incomplete option '+args[i]);
  o[args[i]]=args[i+1];
 }
 if(!o['--input']||!o['--isbndb']||!o['--out'])throw Error('Required --input --isbndb --out');
 const result=compareIsbndb(JSON.parse(readFileSync(resolve(o['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(o['--isbndb']),'utf8')));
 const dir=resolve(o['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'isbndb-offline-comparison.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');renameSync(file+'.partial',file);
 return {report:file,status:result.status,counts:result.counts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(e){console.error('[isbndb-compare] '+e.message);process.exitCode=1}
