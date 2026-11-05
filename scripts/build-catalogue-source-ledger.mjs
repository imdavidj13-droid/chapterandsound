#!/usr/bin/env node
/**
 * Build a field-level source and publication-readiness ledger for the pilot.
 * Review-only: does not fetch sources, infer unknowns, import, or modify D1.
 * Sources are provenance, not permission to reuse copyrighted descriptions/covers.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const validIsbn13=x=>typeof x==='string'&&/^97[89]\d{10}$/.test(x)&&
 (10-[...x.slice(0,12)].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10===Number(x[12]);
const meaningful=v=>v!==null&&v!==undefined&&v!==''&&v!=='unknown'&&(!Array.isArray(v)||v.length>0);
const registryKey=f=>f.entityKind+'.'+f.fieldPath;
const paths={
 'edition.format': ['format'],
 'edition.publisher':['publisher'],
 'edition.release_date':['publicationDate','releaseDate'],
 'edition.language':['language'],
 'edition.page_count':['pageCount','pages'],
 'edition.cover_asset':['coverAssetId','coverKey','coverIds','coverUrl'],
 'edition.binding':['binding','physicalFormat'],
 'edition.large_print':['largePrint'],
 'edition.isbn13_isbn10':['isbn13','isbn10'],
 'edition.alternate_product_identifier':['providerRecordingId','asin','externalId','sourceKey'],
 'recording.narrators_and_cast':['narratorSourceKeys','narratorNames','narrators'],
 'recording.duration_seconds':['durationSeconds','durationMinutes'],
 'recording.abridgement':['abridgement'],
 'recording.narration_language':['narrationLanguage','language'],
 'recording.audio_publisher_label':['audioPublisher','publisher'],
 'work.canonical_title':['title'],
 'work.author_identity':['authorSourceKeys','authorSourceKey','authorId','author'],
 'work.source_identifiers':['workSourceKey','sourceWorkKeys'],
 'work.synopsis':['description','synopsis','summary'],
 'work.original_language':['originalLanguage','language'],
 'work.first_publication_date':['firstPublicationDate','firstPublished'],
 'work.subjects_genres':['subjects','genres']
};
const provAliases={
 format:['format'],publisher:['publisher'],release_date:['publicationDate','releaseDate'],
 language:['language'],page_count:['pageCount'],binding:['binding','format'],
 large_print:['largePrint'],cover_asset:['coverIds','coverUrl','coverAssetId'],
 isbn13_isbn10:['isbn13','isbn10'],duration_seconds:['durationSeconds'],
 narrators_and_cast:['narratorNames','narratorSourceKeys']
};
export function buildSourceLedger(manifest,registry){
 if(!Array.isArray(manifest?.candidates)||!manifest.candidates.length||
 !Array.isArray(registry?.fields)||!registry.fields.length)throw Error('Missing catalogue manifest or field registry');
 const sourceCatalog=Object.fromEntries(Object.entries(registry.sources||{}).map(([id,s])=>
  [id,{label:s.label,access:s.access,reuse:s.reuse,
   verifiedForAutomaticReuse:false,notes:'Review provider terms/contract per field and medium before automation'}]));
 const sourceUsage=new Map(),editionRows=[],workRows=[],blockers=[];
 const addUsage=(source,key,kind)=>{
  if(!source)return;
  const row=sourceUsage.get(source)||{source,fields:new Set(),records:0};
  row.fields.add(key);row.records++;sourceUsage.set(source,row);
 };
 for(const work of manifest.candidates){
  const workFields=[];
  for(const field of registry.fields.filter(x=>x.entityKind==='work')){
   const key=registryKey(field),value=paths[key]?.map(p=>work[p]).find(meaningful);
   const evidence=work.fieldProvenance?.[field.fieldPath]||null;
   workFields.push({field:key,requirement:field.requirement,
    status:meaningful(value)?'present':'missing',
    provenance:evidence?.source||null,
    rightsStatus:['licensed_text','licensed_media'].includes(field.rightsClass)?'review_required':'not_evaluated',
    sourcesToTry:field.sources});
   if(evidence?.source)addUsage(evidence.source,key,'work');
  }
  workRows.push({title:work.title,workSourceKey:work.workSourceKey,fields:workFields});
  for(const ed of work.editions||[]){
   const fields=[],audio=['audiobook','audio_cd'].includes(ed.format);
   const isbnValid=validIsbn13(ed.isbn13);
   const sourceKey=typeof ed.sourceKey==='string'&&ed.sourceKey.trim()?ed.sourceKey:null;
   const providerQualified=sourceKey&&/^[a-z][a-z0-9_-]+:[^\s]+$/.test(sourceKey);
   const bibliographicIdentity=isbnValid?'isbn13':
    providerQualified?'provider_specific_id':'open_library_id_only';
   const identityStatus=isbnValid||providerQualified?'identity_review_required':'independent_edition_identity_required';
   for(const field of registry.fields.filter(x=>x.entityKind==='edition'||(audio&&x.entityKind==='recording'))){
    const key=registryKey(field);
    const names=paths[key]||[],value=names.map(n=>ed[n]).find(meaningful);
    const provenance=(provAliases[field.fieldPath]||[field.fieldPath])
     .map(k=>ed.fieldProvenance?.[k]).find(Boolean);
    const unknown=key==='edition.format'&&(!value||value==='unknown');
    const isAudioOnly=field.entityKind==='recording';
    const reason=unknown?'unresolved_format':!meaningful(value)?'missing_value':null;
    fields.push({field:key,requirement:field.requirement,
     status:unknown?'unknown':meaningful(value)?'present':'missing',
     source:provenance?.source||null,sourceUrl:provenance?.url||provenance?.sourceUrl||null,
     evidenceStatus:provenance?.status||'not_verified',
     rightsStatus:['licensed_text','licensed_media'].includes(field.rightsClass)?'review_required':'not_evaluated',
     sourcesToTry:field.sources,reason,isAudioOnly});
    if(provenance?.source)addUsage(provenance.source,key,'edition');
   }
   const reasons=[];
   if(!ed.format||ed.format==='unknown')reasons.push('unknown_format');
   if(identityStatus==='independent_edition_identity_required')reasons.push('no_verified_product_identifier');
   if(ed.potentialDuplicateSourceKeys?.length)reasons.push('possible_duplicate');
   if(audio&&!((ed.narratorSourceKeys||[]).length||(ed.narratorNames||[]).length))
    reasons.push('missing_narrator');
   if(audio&&!Number.isFinite(ed.durationSeconds)&&!Number.isFinite(ed.durationMinutes))
    reasons.push('missing_audio_duration');
   // A known ISBN or provider ID is an identifier, not proof of independent edition uniqueness.
   reasons.push('identity_and_rights_approval_required');
   const row={title:work.title,workSourceKey:work.workSourceKey,
    editionSourceKey:ed.sourceKey,isbn13:ed.isbn13||null,
    publisher:ed.publisher||null,format:ed.format||'unknown',
    identityKind:bibliographicIdentity,sourceVerified:Boolean(
      ed.fieldProvenance?.format?.source&&ed.format!=='unknown'),
    publicationStatus:'not_approved',blockers:reasons,fields};
   editionRows.push(row);
   if(reasons.length)blockers.push({editionSourceKey:ed.sourceKey,title:work.title,reasons});
  }
 }
 const byStatus={};
 for(const ed of editionRows)for(const reason of ed.blockers)byStatus[reason]=(byStatus[reason]||0)+1;
 const sourceStats=[...sourceUsage.values()].map(x=>({source:x.source,fields:[...x.fields].sort(),observations:x.records}));
 return {mode:'source_provenance_and_readiness_review',importEligible:false,
  totals:{works:workRows.length,editions:editionRows.length,
   knownFormats:editionRows.filter(x=>x.format!=='unknown').length,
   unknownFormats:editionRows.filter(x=>x.format==='unknown').length,
   isbnless:editionRows.filter(x=>!x.isbn13).length,
   notApproved:editionRows.length},
  blockerCounts:byStatus,sourceCatalog,sourceStats,
  works:workRows,editions:editionRows,blockers,
  policy:['Completeness must distinguish not-applicable, unknown, unverified, and known fields.',
   'All sources need provider/field-specific permission for retention, redistribution and automation.',
   'A library catalogue record ID alone does not verify commercial edition uniqueness.',
   'Never infer a format from imprint, publisher, ISBN range or title.',
   'A known format does not imply a publication-ready edition.',
   'No automatic record merging, cover copying, audio scraping or production database writes.']};
}
export function run(args){
 const o={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--registry','--out'].includes(args[i])||!args[i+1])
   throw Error('Unknown/missing option '+args[i]);
  o[args[i]]=args[i+1];
 }
 if(!o['--input']||!o['--registry']||!o['--out'])
  throw Error('Required --input --registry --out');
 const report=buildSourceLedger(JSON.parse(readFileSync(resolve(o['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(o['--registry']),'utf8')));
 const dir=resolve(o['--out']);mkdirSync(dir,{recursive:true});
 const path=join(dir,'catalogue-source-provenance-ledger.json');
 writeFileSync(path+'.partial',JSON.stringify(report,null,2)+'\n');
 renameSync(path+'.partial',path);
 return {report:path,status:'REVIEW_ONLY_NO_DATABASE_WRITES',totals:report.totals,
  blockerCounts:report.blockerCounts,sourceObservations:report.sourceStats.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(e){console.error('[source-ledger] '+e.message);process.exitCode=1}
