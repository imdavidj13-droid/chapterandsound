import type {WorkForReview,EditionForReview} from './catalogue-import-quality.js';

/**
 * Deterministic, non-mutating metadata fusion.
 * A secondary provider may fill absent fields ONLY when the work identity can
 * be verified using an exact work key or a shared edition ISBN plus matching
 * title and author. Conflicting values are reported, never overwritten.
 */
export type SourceCandidate=WorkForReview&{sourceId:string;sourceKey?:string};
export type MergeConflict={field:string;primary:unknown;incoming:unknown;sourceId:string;reason:string};
export type MergeResult={candidate:SourceCandidate;applied:{field:string;sourceId:string}[];
 conflicts:MergeConflict[];rejectedSources:{sourceId:string;reason:string}[]};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const key=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const isbn=(v:unknown)=>text(v).replace(/[\s-]/g,'').toUpperCase();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const copyEdition=(value:EditionForReview):EditionForReview=>({...value,narratorSourceKeys:value.narratorSourceKeys?[...value.narratorSourceKeys]:undefined});
export function mergeCatalogueMetadata(primary:SourceCandidate,extras:SourceCandidate[]):MergeResult{
 const candidate:SourceCandidate={...primary,subjects:primary.subjects?[...primary.subjects]:undefined,
  authorSourceKeys:primary.authorSourceKeys?[...primary.authorSourceKeys]:undefined,
  editions:primary.editions?.map(copyEdition)};
 const applied:MergeResult['applied']=[],conflicts:MergeConflict[]=[],rejectedSources:MergeResult['rejectedSources']=[];
 const workIsbns=new Set((candidate.editions||[]).flatMap(e=>[isbn(e.isbn13),isbn(e.isbn10)]).filter(Boolean));
 for(const extra of extras){
  const sourceId=text(extra.sourceId);
  if(!sourceId||!text(extra.title)||!text(extra.author)){
   rejectedSources.push({sourceId,reason:'Source or work identity missing'});continue
  }
  if(key(extra.title!)!==key(candidate.title||'')||key(extra.author!)!==key(candidate.author||'')){
   rejectedSources.push({sourceId,reason:'Title/author identity conflicts with canonical work'});continue
  }
  const workKey=text(extra.workSourceKey||extra.sourceKey);
  const primaryKey=text(candidate.workSourceKey||candidate.sourceKey);
  const sameProviderKey=sourceId===candidate.sourceId&&Boolean(workKey)&&workKey===primaryKey;
  const sharedEdition=(extra.editions||[]).some(e=>
   [isbn(e.isbn13),isbn(e.isbn10)].some(v=>Boolean(v)&&workIsbns.has(v)));
  if(!sameProviderKey&&!sharedEdition){
   rejectedSources.push({sourceId,reason:'No exact work key or independently shared edition ISBN; source not merged'});continue
  }
  const workFields=['description','originalLanguage','firstPublicationDate'] as const;
  for(const field of workFields){
   const incoming=text(extra[field]);
   if(!incoming)continue;
   if(!text(candidate[field])){candidate[field]=incoming;applied.push({field:'work.'+field,sourceId})}
   else if(key(candidate[field]!)!==key(incoming))
    conflicts.push({field:'work.'+field,primary:candidate[field],incoming,sourceId,reason:'Conflicting work-level claim'});
  }
  if(extra.subjects?.length){
   const existing=candidate.subjects||[];
   const seen=new Set(existing.map(key));
   for(const subject of extra.subjects){
    if(!text(subject)||seen.has(key(subject)))continue;
    existing.push(subject);seen.add(key(subject));
    applied.push({field:'work.subjects',sourceId});
   }
   candidate.subjects=existing;
  }
  // Source author keys are provider-specific: never transplant an unfamiliar
  // provider identifier into the canonical primary identity namespace.
  if(sameProviderKey&&extra.authorSourceKeys?.length&&!candidate.authorSourceKeys?.length){
   candidate.authorSourceKeys=[...extra.authorSourceKeys];
   applied.push({field:'work.authorSourceKeys',sourceId});
  }
  for(const incomingEdition of extra.editions||[]){
   const values=[isbn(incomingEdition.isbn13),isbn(incomingEdition.isbn10)].filter(Boolean);
   const matches=(candidate.editions||[]).filter(e=>
    (sameProviderKey&&Boolean(e.sourceKey)&&e.sourceKey===incomingEdition.sourceKey)
    ||values.some(v=>v===isbn(e.isbn13)||v===isbn(e.isbn10)));
   if(matches.length!==1){
    if(matches.length>1)conflicts.push({field:'edition.identity',primary:matches.map(e=>e.sourceKey),incoming:incomingEdition.sourceKey,sourceId,reason:'Ambiguous edition match'});
    // New editions from external providers require separate identity validation.
    continue;
   }
   const edition=matches[0]!;
   const fields=['format','isbn13','isbn10','publisher','publicationDate','language','pageCount','durationSeconds'] as const;
   for(const field of fields){
    const incoming=incomingEdition[field];
    if(incoming===null||incoming===undefined||incoming==='')continue;
    const previous=edition[field];
    if(previous===null||previous===undefined||previous===''){
     // Source-specific conflicts are not overridden, including formats.
     // TS type unions for numeric/string fields need field-specific assignment.
     if(field==='pageCount'||field==='durationSeconds'){
      (edition as Record<string,unknown>)[field]=incoming;
     }else (edition as Record<string,unknown>)[field]=incoming;
     applied.push({field:'edition.'+text(edition.sourceKey)+'.'+field,sourceId});
    }else if(!same(previous,incoming))
     conflicts.push({field:'edition.'+text(edition.sourceKey)+'.'+field,primary:previous,incoming,sourceId,reason:'Conflicting edition-level claim'});
   }
   if(!edition.narratorSourceKeys?.length&&incomingEdition.narratorSourceKeys?.length&&sameProviderKey){
    edition.narratorSourceKeys=[...incomingEdition.narratorSourceKeys];
    applied.push({field:'edition.'+text(edition.sourceKey)+'.narratorSourceKeys',sourceId});
   }
  }
 }
 return {candidate,applied,conflicts,rejectedSources};
}
