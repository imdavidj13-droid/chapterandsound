#!/usr/bin/env node
/**
 * Offline reviewer-friendly triage for ISBNdb comparison.
 * Zero network requests, no catalogue mutations, no database writes.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const countBy=xs=>Object.fromEntries([...xs.reduce((m,x)=>m.set(x,(m.get(x)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))));
export function triageComparison(report){
 if(report?.status!=='OFFLINE_REVIEW_ONLY_NO_DATABASE_WRITES'||
 !Array.isArray(report.findings)||!Array.isArray(report.unresolved))
  throw Error('Expected offline ISBNdb comparison report');
 const proposedFormats=report.unresolved.filter(x=>x.status==='review_candidate')
  .map(x=>({title:x.title,isbn13:x.isbn13,editionSourceKey:x.editionSourceKey,
   proposedFormat:x.proposedFormat,decision:'VERIFY_EXACT_EDITION_AND_LICENCE_BEFORE_APPROVAL'}));
 const stillUnknown=report.unresolved.filter(x=>x.status!=='review_candidate').map(x=>({
  title:x.title,isbn13:x.isbn13,editionSourceKey:x.editionSourceKey,
  nextAction:x.isbn13?'RESEARCH_EXACT_EDITION_WITH_INDEPENDENT_SOURCE':'QUARANTINE_UNTIL_INDEPENDENT_PRODUCT_IDENTITY',
  decision:'NOT_APPROVED'}));
 const fieldConflicts=report.findings.flatMap(f=>Object.entries(f.conflicts||{})
  .map(([field,v])=>({title:f.title,isbn13:f.isbn13,editionSourceKey:f.editionSourceKey,
   field,existing:v.existing,isbndbObserved:v.observed,source:'isbndb',
   decision:'SOURCE_REVIEW_REQUIRED'})));
 const additionalFields=report.findings.flatMap(f=>Object.entries(f.candidates||{})
  .filter(([field])=>field!=='format')
  .map(([field,value])=>({title:f.title,isbn13:f.isbn13,
   editionSourceKey:f.editionSourceKey,field,value,source:'isbndb',
   decision:'VERIFY_AND_CHECK_REUSE_RIGHTS'})));
 const candidateOnly=report.findings.filter(x=>x.kind==='unmatched_primary_isbn')
  .map(x=>({title:x.title,isbn13:x.isbn13,editionSourceKeys:x.editionSourceKeys,
   decision:'DO_NOT_ASSIGN_TO_EDITION_WITHOUT_EXACT_ISBN_IDENTITY'}));
 return {status:'OFFLINE_REVIEW_ONLY_NO_API_CALLS',totals:{
  proposedFormats:proposedFormats.length,stillUnknown:stillUnknown.length,
  unknownWithISBN:stillUnknown.filter(x=>x.isbn13).length,
  unknownWithoutISBN:stillUnknown.filter(x=>!x.isbn13).length,
  metadataConflicts:fieldConflicts.length,metadataCandidates:additionalFields.length,
  candidateOnlyISBNs:candidateOnly.length},
  conflictsByField:countBy(fieldConflicts.map(x=>x.field)),
  newFieldsByField:countBy(additionalFields.map(x=>x.field)),
  proposedFormats,stillUnknown,fieldConflicts,additionalFields,candidateOnly,
  rules:['No ISBNdb calls are made by this script.',
   'These are review candidates, not production-ready metadata.',
   'A source record ID alone is insufficient to publish an unidentified edition.',
   'A publisher name, binding label or page count cannot be copied across candidate ISBNs.',
   'Keep provider-level provenance and check subscription rights before storing or displaying data.']};
}
export function run(argv){
 const args={};for(let i=0;i<argv.length;i+=2){
  if(!['--comparison','--out'].includes(argv[i])||!argv[i+1])
   throw Error('Unknown or incomplete argument: '+argv[i]);
  args[argv[i]]=argv[i+1];
 }
 if(!args['--comparison']||!args['--out'])throw Error('Required --comparison and --out');
 const result=triageComparison(JSON.parse(readFileSync(resolve(args['--comparison']),'utf8')));
 const out=resolve(args['--out']);mkdirSync(out,{recursive:true});
 const file=join(out,'isbndb-manual-triage.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');
 renameSync(file+'.partial',file);
 return {status:result.status,report:file,totals:result.totals,
  conflictsByField:result.conflictsByField,
  newFieldsByField:result.newFieldsByField,proposedFormats:result.proposedFormats,
  stillUnknown:result.stillUnknown};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(e){console.error('[isbndb-triage] '+e.message);process.exitCode=1}
