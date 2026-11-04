#!/usr/bin/env node
/**
 * Convert a staged completeness report into an evidence-aware source action plan.
 * Local diagnostic only; no requests or database writes.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const actionsFor={
 'edition.format':'verify_edition_medium',
 'edition.cover_asset':'obtain_rights_cleared_cover',
 'edition.language':'verify_edition_language',
 'edition.publisher':'verify_edition_publisher',
 'work.original_language':'verify_original_language',
 'work.first_publication_date':'verify_first_publication',
 'recording.abridgement':'verify_recording_abridgement',
 'recording.narration_language':'verify_audio_language',
 'recording.audio_publisher_label':'verify_audio_label',
 'edition.page_count':'verify_print_page_count',
 'edition.release_date':'verify_edition_release_date',
 'recording.narrators_and_cast':'verify_recording_narrator_identity',
 'recording.duration_seconds':'verify_audio_duration',
 'work.subjects_genres':'verify_subject_categories',
 'work.synopsis':'obtain_licensed_synopsis'
};
const priority=['required','priority','conditional'];
function resultMap(report,kind){
 const out=new Map();
 for(const row of report?.findings||[]){
  if(row?.isbn13)out.set(row.isbn13,kind==='hardcover'?row.status:row.status);
 }
 return out;
}
function recommendationFor(g,hardcover,loc){
 // An ISBN-specific failure only disqualifies the *same lookup*.
 // It does not prove that source has no other editions of this work.
 const sources=(g.sourceCandidates||[]).filter(code=>code!=='canonical_local');
 return sources.map(code=>{
  let previous='not_tested',decision='candidate';
  if(g.isbn13&&code==='hardcover'&&hardcover.has(g.isbn13)){
   previous=hardcover.get(g.isbn13);
   if(previous==='no_result'||previous==='isbn_mismatch'){
    decision='avoid_repeating_identical_isbn_lookup';
   }else if(previous==='no_explicit_format'&&g.fieldPath==='format'){
    decision='avoid_repeating_same_field_lookup';
   }else if(previous==='provisional_format'&&g.fieldPath==='format'){
    decision='review_existing_candidate_evidence';
   }else if(previous==='identity_mismatch'){
    decision='review_identity_before_retry';
   }
  }
  if(g.isbn13&&code==='loc'&&loc.has(g.isbn13)){
   previous=loc.get(g.isbn13);
   if(previous==='no_result'||previous==='isbn_mismatch'){
    decision='avoid_repeating_identical_isbn_lookup';
   }else if(previous==='no_explicit_format'&&g.fieldPath==='format'){
    decision='avoid_repeating_same_field_lookup';
   }
  }
  if(code==='manual'&&g.fieldPath==='cover_asset')decision='rights_approved_manual_upload';
  if(code==='licensed_cover_provider'&&g.fieldPath==='cover_asset')decision='verify_image_licence_first';
  return {code,previous,decision};
 });
}
export function buildGapActionPlan(audit,{hardcoverReport=null,locReport=null}={}){
 if(!Array.isArray(audit?.gaps)||!Array.isArray(audit?.fields))throw Error('Expected catalogue completeness report');
 const hc=resultMap(hardcoverReport,'hardcover'),loc=resultMap(locReport,'loc');
 const unknownFormatKeys=new Set(audit.gaps.filter(g=>g.entityKind==='edition'&&g.fieldPath==='format'
  &&g.status==='unknown').map(g=>g.editionSourceKey));
 const queue=[],deferred=[],rightsReview=[],metadataInvestigations=[],summaries=new Map();
 for(const g of audit.gaps){
  const id=g.entityKind+'.'+g.fieldPath;
  const row=summaries.get(id)||{field:id,requirement:g.requirement,count:0,
   missing:0,unknown:0,applicabilityUnknown:0,rightsReview:0,
   recommendedProviders:new Set(),historicalLookupsToAvoid:0};
  row.count++;
  if(g.status==='missing')row.missing++;
  if(g.status==='unknown')row.unknown++;
  if(g.status==='applicability_unknown')row.applicabilityUnknown++;
  if(g.evidence==='rights_unverified')row.rightsReview++;
  summaries.set(id,row);
  if(g.evidence==='rights_unverified'){
   rightsReview.push(g);
   continue;
  }
  if(g.status==='applicability_unknown'){
   deferred.push({...g,reason:unknownFormatKeys.has(g.editionSourceKey)?
    'resolve_edition_format_before_testing_this_field':'determine_applicability_first'});
   continue;
  }
  if(!['missing','unknown'].includes(g.status)||!priority.includes(g.requirement)){
   metadataInvestigations.push(g);
   continue;
  }
  const sources=recommendationFor(g,hc,loc);
  const eligible=sources.filter(s=>!s.decision.startsWith('avoid_repeating'));
  for(const source of eligible)row.recommendedProviders.add(source.code);
  row.historicalLookupsToAvoid+=sources.length-eligible.length;
  queue.push({title:g.title,editionSourceKey:g.editionSourceKey,
   isbn13:g.isbn13,field:id,action:actionsFor[id]||'find_explicit_field_evidence',
   requirement:g.requirement,sources,sourceCandidatesToTry:eligible.map(s=>s.code)});
 }
 const fieldPriorities=[...summaries.values()].map(row=>({...row,
  recommendedProviders:[...row.recommendedProviders]}))
  .sort((a,b)=>{
   const aa=queue.filter(q=>q.field===a.field).length;
   const bb=queue.filter(q=>q.field===b.field).length;
   return bb-aa||b.count-a.count;
  });
 const providerOpportunities={};
 for(const q of queue)for(const source of q.sourceCandidatesToTry)
  providerOpportunities[source]=(providerOpportunities[source]||0)+1;
 return {mode:'evidence_aware_field_action_plan',status:'READ_ONLY_NO_DATABASE_WRITES',
  input:{works:audit.totals?.works,editions:audit.totals?.editions,
   hardcoverHistoricalIsbns:hc.size,locHistoricalIsbns:loc.size},
  totals:{actionablePriorityGaps:queue.length,
   unknownFormatBlockedEditions:unknownFormatKeys.size,
   deferredApplicabilityChecks:deferred.length,
   rightsChecks:rightsReview.length,
   optionalOrNonCoreInvestigations:metadataInvestigations.length,
   previouslyUnproductiveSourceSuggestions:queue.reduce((n,q)=>n+q.sources.filter(s=>s.decision.startsWith('avoid_repeating')).length,0)},
  fieldPriorities,providerOpportunities,queue,deferred,rightsReview,metadataInvestigations,
  limitations:[
   'This report is based on the staged candidate manifest, not live BOOK_DB data.',
   'A field can be present without evidence or rights clearance.',
   'Provider opportunities are untested possible routes; not claims of availability.',
   'Historical no-result/format-missing suppresses only repeating an identical ISBN/field query.',
   'Missing rights clearance is a separate workflow from missing bibliographic facts.',
   'Field applicability for unknown-format editions is deferred, not silently treated as missing.',
   'No automated source requests, database writes, publication or merges.'
  ]};
}
export function run(argv){
 const opts={};for(let i=0;i<argv.length;i+=2){
  if(!['--audit','--out','--hardcover','--loc'].includes(argv[i])||!argv[i+1])
   throw Error('Invalid option: '+argv[i]);
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--audit']||!opts['--out'])throw Error('Required --audit and --out');
 const load=key=>opts[key]&&existsSync(resolve(opts[key]))?
  JSON.parse(readFileSync(resolve(opts[key]),'utf8')):null;
 const audit=JSON.parse(readFileSync(resolve(opts['--audit']),'utf8'));
 const plan=buildGapActionPlan(audit,{hardcoverReport:load('--hardcover'),locReport:load('--loc')});
 const out=resolve(opts['--out']);mkdirSync(out,{recursive:true});
 const path=join(out,'catalogue-field-action-plan.json');
 writeFileSync(path+'.partial',JSON.stringify(plan,null,2)+'\n');
 renameSync(path+'.partial',path);
 return {report:path,totals:plan.totals,topFields:plan.fieldPriorities.slice(0,14),
  providerOpportunities:plan.providerOpportunities,status:plan.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2))
 .catch?.(()=>{});
