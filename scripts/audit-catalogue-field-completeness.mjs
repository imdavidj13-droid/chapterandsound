#!/usr/bin/env node
/**
 * Local, read-only completeness audit for Chapter & Sound's ten-work pilot.
 * Classifies applicability separately from data presence, evidence and rights.
 * No network, no database writes. Never guesses missing bibliographic facts.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const has=v=>typeof v==='string'?v.trim().length>0:
 Array.isArray(v)?v.length>0:typeof v==='number'?Number.isFinite(v):v!==null&&v!==undefined;
const first=(obj,...keys)=>keys.map(key=>obj?.[key]).find(has);
const arr=(obj,...keys)=>keys.flatMap(key=>Array.isArray(obj?.[key])?obj[key]:[]);
const known=v=>has(v)&&!['unknown','unconfirmed','unspecified','n/a'].includes(String(v).toLowerCase().trim());
const trim=v=>String(v||'').toLowerCase();
const validFormat=new Set(['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital']);
const audio=e=>['audiobook','audio_cd'].includes(e?.format);
const print=e=>['paperback','hardback','other_print'].includes(e?.format);
const outcome=(value,state='present',reason)=>({value,state,...(reason?{reason}:{})});
function applicability(field,context){
 const {edition,work}=context;
 if(field.entityKind==='recording'&&!audio(edition))return edition?.format==='unknown'?'undetermined':'not_applicable';
 switch(field.appliesTo){
  case 'print':return !edition?'not_applicable':print(edition)?'applicable':edition.format==='unknown'?'undetermined':'not_applicable';
  case 'ebook':return !edition?'not_applicable':edition.format==='ebook'?'applicable':edition.format==='unknown'?'undetermined':'not_applicable';
  case 'audio':return !edition?'not_applicable':audio(edition)?'applicable':edition.format==='unknown'?'undetermined':'not_applicable';
  case 'large_print':return !edition?'not_applicable':edition.largePrint===true?'applicable':edition.largePrint===false?'not_applicable':'undetermined';
  case 'no_isbn':return !edition?'not_applicable':!first(edition,'isbn13','isbn10')?'applicable':'not_applicable';
  case 'isbn_assigned':return !edition?'not_applicable':first(edition,'isbn13','isbn10')?'applicable':'undetermined';
  case 'series':return arr(work,'series','seriesMemberships','seriesMembership').length?'applicable':'undetermined';
  case 'revised_or_translated':return arr(work,'versions','workVersions').length?'applicable':'undetermined';
  default:return 'applicable';
 }
}
function valueOf(field,context){
 const {work,edition:e}=context;
 if(field.entityKind==='system')return outcome(null,'not_audit_target','System data lives in BOOK_DB, not the staging candidate manifest');
 if(field.entityKind==='community'||field.entityKind==='person')return outcome(null,'not_audit_target','Outside the work-and-edition staging manifest');
 if(field.entityKind==='work'){
  switch(field.fieldPath){
   case 'canonical_title':return outcome(first(work,'title','canonicalTitle'));
   case 'author_identity':return outcome(first(work,'authorSourceKeys','authorSourceKey','authorId','author'));
   case 'source_identifiers':return outcome(first(work,'workSourceKey','sourceKey','sourceWorkKeys'));
   case 'original_language':return outcome(first(work,'originalLanguage','language'));
   case 'first_publication_date':return outcome(first(work,'firstPublicationDate','firstPublished','publicationDate'));
   case 'synopsis':return outcome(first(work,'description','synopsis','summary'));
   case 'subjects_genres':return outcome(first(work,'subjects','genres'));
   case 'subtitle':return outcome(first(work,'subtitle'));
   case 'work_type':return outcome(first(work,'workType','type'));
   case 'series_membership':return outcome(first(work,'seriesMemberships','series','seriesMembership'));
   case 'series_position':return outcome(first(work,'seriesNumber','seriesPosition','sequenceNumber'));
   case 'alternate_titles':return outcome(first(work,'alternateTitles','alternativeTitles'));
   case 'work_version':return outcome(first(work,'versions','workVersions'));
   case 'descriptors_themes_moods':return outcome(first(work,'descriptors','themes','moods'));
   case 'audience_or_content_advisories':return outcome(first(work,'contentAdvisories','audience'));
   case 'awards':return outcome(first(work,'awards'));
  }
 }
 if(field.entityKind==='edition'){
  switch(field.fieldPath){
   case 'parent_work_id':return outcome(first(e,'sourceWorkKeys')||first(work,'workSourceKey'));
   case 'edition_source_identifier':return outcome(first(e,'sourceKey','sourceId'));
   case 'format':return known(e.format)&&validFormat.has(e.format)?outcome(e.format):outcome(null,'unknown');
   case 'isbn13_isbn10':return outcome(first(e,'isbn13','isbn10'));
   case 'alternate_product_identifier':return outcome(first(e,'providerRecordingId','asin','externalId','sourceKey'));
   case 'publisher':return outcome(first(e,'publisher'));
   case 'imprint':return outcome(first(e,'imprint'));
   case 'release_date':return outcome(first(e,'publicationDate','releaseDate','publishedAt'));
   case 'language':return outcome(first(e,'language'));
   case 'edition_statement':return outcome(first(e,'editionStatement','statement'));
   case 'page_count':return outcome(first(e,'pageCount','pages'));
   case 'binding':return print(e)&&['paperback','hardback'].includes(e.format)?outcome(e.format):
    outcome(first(e,'binding','physicalFormat'));
   case 'cover_asset':return outcome(first(e,'coverAssetId','coverKey','coverIds','coverUrl'));
   case 'large_print':return outcome(e?.largePrint===true?true:null);
   case 'dimensions_and_weight':return outcome(first(e,'dimensions','weight','trimHeightMm'));
   case 'file_format_and_size':return outcome(first(e,'fileFormat','fileSizeBytes'));
   case 'availability_and_price':return outcome(first(e,'availability','offers'));
   case 'territory_and_rights':return outcome(first(e,'territory','distributionRights'));
  }
 }
 if(field.entityKind==='recording'){
  switch(field.fieldPath){
   case 'recording_identifier':return outcome(first(e,'providerRecordingId','recordingSourceKey','sourceKey'));
   case 'linked_audio_edition':return outcome(first(e,'sourceKey'));
   case 'narrators_and_cast':return outcome(first(e,'narratorSourceKeys','narratorNames','narrators'));
   case 'duration_seconds':return outcome(first(e,'durationSeconds','durationMinutes'));
   case 'abridgement':return outcome(known(first(e,'abridgement'))?e.abridgement:null);
   case 'narration_language':return outcome(first(e,'narrationLanguage','language'));
   case 'audio_publisher_label':return outcome(first(e,'audioPublisher','publisher'));
   case 'performance_type':return outcome(known(first(e,'performanceType','performance'))?first(e,'performanceType','performance'):null);
   case 'production_metadata':return outcome(first(e,'recordedDate','studio','producer'));
   case 'tracks_codec_bitrate':return outcome(first(e,'audioTracks','codec','bitrateKbps'));
  }
 }
 return outcome(null,'not_mapped','Registry entry has no explicit manifest mapping');
}
const evidenceStatus=(field,context,v)=>{
 if(!has(v))return 'missing';
 const {edition:e}=context;
 let p;
 if(field.entityKind==='edition')p=e?.fieldProvenance?.[field.fieldPath]||
  e?.fieldProvenance?.[{
    release_date:'publicationDate',isbn13_isbn10:'isbn13',
    page_count:'pageCount',cover_asset:'coverIds',binding:'format',
    alternate_product_identifier:'providerRecordingId'
  }[field.fieldPath]];
 if(field.entityKind==='recording')p=e?.fieldProvenance?.[{
    duration_seconds:'durationSeconds',narrators_and_cast:'narratorNames',
    recording_identifier:'providerRecordingId'
  }[field.fieldPath]];
 if(field.rightsClass==='licensed_media'||field.rightsClass==='licensed_text')
  return 'rights_unverified'; // A URL, ISBN or text never proves display rights.
 if(p?.status==='conflicted'||p?.status==='disputed')return 'conflicted';
 if(p?.source||p?.sourceUrl||p?.identifier)return 'source_backed';
 return 'present_unverified';
};
function evaluateField(field,context){
 const scope=applicability(field,context);
 if(scope==='not_applicable')return {status:'not_applicable'};
 if(scope==='undetermined')return {status:'applicability_unknown'};
 const raw=valueOf(field,context);
 if(raw.state==='not_audit_target'||raw.state==='not_mapped')return {status:raw.state,reason:raw.reason};
 if(raw.state==='unknown')return {status:'unknown'};
 if(!has(raw.value))return {status:'missing'};
 const evidence=evidenceStatus(field,context,raw.value);
 return {status:evidence==='conflicted'?'conflicted':'present',evidence};
}
const unique=(x)=>[...new Set(x)];
export function auditCatalogueManifest(manifest,registry){
 if(!Array.isArray(manifest?.candidates)||!manifest.candidates.length)throw Error('Manifest missing candidates');
 if(!Array.isArray(registry?.fields)||!registry.fields.length)throw Error('Registry missing fields');
 const books=[],gaps=[],fieldCounts=new Map(),totals={works:manifest.candidates.length,editions:0,
  unknownFormats:0,possibleDuplicateLinks:0,missing:0,unknown:0,applicabilityUnknown:0,
  notApplicable:0,present:0,sourceBacked:0,presentUnverified:0,rightsUnverified:0,conflicts:0};
 const seenWork=new Set(),seenEdition=new Set(),isbnWork=new Map();
 function add(field,book,ed,result){
  const key=field.entityKind+'.'+field.fieldPath;
  const counts=fieldCounts.get(key)||{entityKind:field.entityKind,fieldPath:field.fieldPath,
   requirement:field.requirement,appliesTo:field.appliesTo,sources:field.sources,
   present:0,missing:0,unknown:0,notApplicable:0,applicabilityUnknown:0,
   rightsUnverified:0,presentUnverified:0,sourceBacked:0,conflicted:0};
  if(result.status==='not_applicable'){counts.notApplicable++;totals.notApplicable++}
  else if(result.status==='applicability_unknown'){counts.applicabilityUnknown++;totals.applicabilityUnknown++}
  else if(result.status==='unknown'){counts.unknown++;totals.unknown++}
  else if(result.status==='missing'){counts.missing++;totals.missing++}
  else if(result.status==='conflicted'){counts.conflicted++;totals.conflicts++}
  else if(result.status==='present'){
   counts.present++;totals.present++;
   if(result.evidence==='source_backed'){counts.sourceBacked++;totals.sourceBacked++}
   else if(result.evidence==='rights_unverified'){counts.rightsUnverified++;totals.rightsUnverified++}
   else {counts.presentUnverified++;totals.presentUnverified++}
  }
  fieldCounts.set(key,counts);
  if(['missing','unknown','applicability_unknown','conflicted'].includes(result.status)||
   result.evidence==='rights_unverified'){
   gaps.push({title:book.title,entityKind:field.entityKind,editionSourceKey:ed?.sourceKey||null,
    isbn13:ed?.isbn13||null,fieldPath:field.fieldPath,requirement:field.requirement,
    status:result.status,evidence:result.evidence||null,sourceCandidates:field.sources});
  }
 }
 for(const book of manifest.candidates){
  if(!book.title||!book.workSourceKey||!Array.isArray(book.editions))throw Error('Invalid canonical book manifest');
  if(seenWork.has(book.workSourceKey))throw Error('Duplicate work source ID '+book.workSourceKey);
  seenWork.add(book.workSourceKey);
  const info={title:book.title,workSourceKey:book.workSourceKey,
   editionCount:book.editions.length,unknownFormats:0,possibleDuplicateLinks:0};
  for(const field of registry.fields.filter(f=>f.entityKind==='work'))
   add(field,book,null,evaluateField(field,{work:book,edition:null}));
  for(const ed of book.editions){
   if(!ed.sourceKey||seenEdition.has(ed.sourceKey))throw Error('Missing or duplicated edition source ID');
   seenEdition.add(ed.sourceKey);totals.editions++;
   if(ed.format==='unknown'){totals.unknownFormats++;info.unknownFormats++}
   const duplicates=arr(ed,'potentialDuplicateSourceKeys');
   if(duplicates.length){totals.possibleDuplicateLinks++;info.possibleDuplicateLinks++}
   if(ed.isbn13){
    const linked=isbnWork.get(ed.isbn13)||[];
    linked.push(ed.sourceKey);isbnWork.set(ed.isbn13,linked);
   }
   for(const field of registry.fields.filter(f=>['edition','recording'].includes(f.entityKind)))
    add(field,book,ed,evaluateField(field,{work:book,edition:ed}));
  }
  books.push(info);
 }
 const duplicateISBNs=[...isbnWork.entries()].filter(([,keys])=>keys.length>1)
  .map(([isbn13,editionSourceKeys])=>({isbn13,editionSourceKeys}));
 const fields=[...fieldCounts.values()];
 const rankedSources=Object.entries(registry.sources||{}).map(([code,source])=>({
  code,label:source.label,access:source.access,reuse:source.reuse,
  unresolvedPriorityFields:gaps.filter(g=>['required','priority','conditional'].includes(g.requirement)
   &&g.sourceCandidates.includes(code)&&g.status!=='conflicted').length
 })).filter(s=>s.unresolvedPriorityFields>0)
  .sort((a,b)=>b.unresolvedPriorityFields-a.unresolvedPriorityFields);
 return {mode:'catalogue_field_completeness_audit',status:'READ_ONLY_NO_DATABASE_WRITES',
  manifestMode:manifest.mode||null,registryVersion:registry.version,totals,books,fields,
  gaps,duplicateISBNs,rankedSources,
  limitations:[
   'Counts are candidate manifest fields, not verified production D1 rows.',
   'Present does not mean verified; source-backed only means provenance metadata was attached.',
   'Any synopsis or cover value remains rights-unverified without separate clearance evidence.',
   'Unknown format makes print/audio applicability indeterminate rather than not applicable.',
   'Source rankings are potential coverage opportunities, not guaranteed provider responses.',
   'Records marked possible duplicates are not deduplicated or merged automatically.'
  ]};
}
export function run(argv){
 const opt={};for(let i=0;i<argv.length;i+=2){
  if(!['--input','--registry','--out'].includes(argv[i])||!argv[i+1])
   throw Error('Required --input --registry --out; unknown option: '+argv[i]);
  opt[argv[i]]=argv[i+1];
 }
 if(!opt['--input']||!opt['--registry']||!opt['--out'])throw Error('Required --input --registry --out');
 const result=auditCatalogueManifest(JSON.parse(readFileSync(resolve(opt['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(opt['--registry']),'utf8')));
 const dir=resolve(opt['--out']);mkdirSync(dir,{recursive:true});
 const output=join(dir,'catalogue-field-completeness-report.json');
 writeFileSync(output+'.partial',JSON.stringify(result,null,2)+'\n');renameSync(output+'.partial',output);
 return {report:output,totals:result.totals,topMissingFields:result.fields
  .filter(f=>['required','priority','conditional'].includes(f.requirement))
  .sort((a,b)=>(b.missing+b.unknown)-(a.missing+a.unknown))
  .slice(0,15).map(f=>({field:f.entityKind+'.'+f.fieldPath,missing:f.missing,
   unknown:f.unknown,applicabilityUnknown:f.applicabilityUnknown})),
  nextSources:result.rankedSources.slice(0,8),
  duplicateISBNGroups:result.duplicateISBNs.length,
  status:result.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
