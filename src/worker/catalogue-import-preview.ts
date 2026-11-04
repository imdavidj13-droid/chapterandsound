import {validIsbn13,validIsbn10} from './catalogue-manual-api.js';
import {assessImportQuality,type ImportQuality,type WorkForReview} from './catalogue-import-quality.js';

type Param=string|number|null;
interface Statement{bind(...args:Param[]):Statement;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}
export type ImportCandidate=WorkForReview&{sourceId?:string;sourceKey?:string};
type Decision='create_draft'|'needs_enrichment'|'existing_edition'|'review_match'|'invalid'|'duplicate_in_batch';
export type PreviewRow={index:number;title:string;author:string;isbn13:string|null;isbn10:string|null;decision:Decision;reason:string;existingWorkId?:string;existingEditionId?:string;matches?:{id:string;title:string}[];authorMatches?:{id:string;name:string}[];quality:ImportQuality};
const norm=(value:unknown,max=500)=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,max):'';
const normalizedTitle=(v:string)=>v.toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const normalizeIsbn=(v:string)=>v.replace(/[\s-]/g,'').toUpperCase();
const allowedFormats=new Set(['paperback','hardback','ebook','audiobook','audio_cd','unknown']);
export async function previewCatalogueImport(db:Database,candidates:unknown):Promise<{dryRun:true;rows:PreviewRow[];summary:Record<Decision,number>}>{
 if(!Array.isArray(candidates)||!candidates.length||candidates.length>100)throw Error('Provide 1–100 catalogue candidates per dry run.');
 const summary:Record<Decision,number>={create_draft:0,needs_enrichment:0,existing_edition:0,review_match:0,invalid:0,duplicate_in_batch:0};
 const rows:PreviewRow[]=[];
 const seen=new Set<string>();
 const seenIsbns=new Set<string>();
 const seenTitles=new Set<string>();
 for(let index=0;index<candidates.length;index++){
  const candidate=candidates[index] as ImportCandidate|null;
  const raw:ImportCandidate=(candidate&&typeof candidate==='object'&&!Array.isArray(candidate))?candidate:{};
  const title=norm(raw.title,500),author=norm(raw.author,300);
  const isbn13=normalizeIsbn(norm(raw.isbn13,32))||null;
  const isbn10=normalizeIsbn(norm(raw.isbn10,32))||null;
  const format=norm(raw.format,30).toLowerCase();
  const publicationDate=norm(raw.publicationDate,10);
  const quality=assessImportQuality({...raw,title,author,isbn13:isbn13||undefined,isbn10:isbn10||undefined});
  const authorMatches=author?(await db.prepare("SELECT id,preferred_name AS name FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 5")
   .bind(author).all<{id:string;name:string}>()).results:[];
  const base={index:index+1,title,author,isbn13,isbn10,quality,authorMatches};
  const add=(decision:Decision,reason:string,other:Partial<PreviewRow>={})=>{summary[decision]++;rows.push({...base,decision,reason,...other})};
  if(!title||!author){add('invalid','A title and author are required.');continue}
  if(isbn13&&!validIsbn13(isbn13)){add('invalid','Invalid ISBN-13 check digit.');continue}
  if(isbn10&&!validIsbn10(isbn10)){add('invalid','Invalid ISBN-10 check digit.');continue}
  if(format&&!allowedFormats.has(format)){add('invalid','Unsupported edition format.');continue}
  if(publicationDate&&!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(publicationDate)){
   add('invalid','Publication date must be YYYY, YYYY-MM or YYYY-MM-DD.');continue
  }
  const sourceId=norm(raw.sourceId,100),sourceKey=norm(raw.workSourceKey||raw.sourceKey,200);
  const isbnValues=[isbn13,isbn10,...(raw.editions||[]).flatMap(e=>[e.isbn13||null,e.isbn10||null])]
   .filter((value):value is string=>!!value).map(normalizeIsbn);
  if(isbnValues.some(value=>(value.length===13&&!validIsbn13(value))||(value.length===10&&!validIsbn10(value))||![10,13].includes(value.length))){
   add('invalid','At least one edition has an invalid ISBN checksum.');continue
  }
  if((raw.editions||[]).some(e=>!!e.format&&!allowedFormats.has(e.format.toLowerCase()))){
   add('invalid','An edition has an unsupported format.');continue
  }
  if(raw.editions&&raw.editions.length>500){add('invalid','More than 500 editions in one work. Split offline processing into validated batches.');continue}
  const values=[...new Set(isbnValues)];
  const signature=sourceId&&sourceKey?'source:'+sourceId+':'+sourceKey:'work:'+normalizedTitle(title)+'|'+normalizedTitle(author);
  const titleSignature=normalizedTitle(title)+'|'+normalizedTitle(author);
  if(seen.has(signature)||seenTitles.has(titleSignature)||values.some(v=>seenIsbns.has(v))){
   add('duplicate_in_batch','Another candidate in this batch uses the same title/author, work key or edition identifier. Review before merging.');continue
  }
  seen.add(signature);seenTitles.add(titleSignature);values.forEach(v=>seenIsbns.add(v));
  if(values.length){
   const placeholders=values.map(()=>'?').join(',');
   const {results}=await db.prepare(`SELECT DISTINCT e.id AS editionId,w.id AS workId,w.canonical_title AS title
     FROM entity_identifiers ei JOIN identifier_schemes scheme ON scheme.id=ei.scheme_id
     JOIN editions e ON ei.entity_kind='edition' AND ei.entity_id=e.id JOIN works w ON w.id=e.work_id
     WHERE ei.normalized_value IN (${placeholders}) AND scheme.code IN ('ISBN13','ISBN10') LIMIT 5`)
     .bind(...values).all<{editionId:string;workId:string;title:string}>();
   if(results.length){
    const multiple=(raw.editions?.length||0)>1;
    add(multiple?'review_match':'existing_edition',
     multiple?'One or more edition ISBNs already exist. Reconcile all edition records and add only verified missing editions to the existing work.':
     'An edition with this ISBN already exists; do not create a duplicate.',
     {existingEditionId:results[0]!.editionId,existingWorkId:results[0]!.workId});continue
   }
  }
  if(sourceId&&sourceKey){
   const {results}=await db.prepare(`SELECT sr.id FROM source_records sr JOIN metadata_sources ms ON ms.id=sr.source_id
    WHERE ms.name=? AND sr.external_key=? LIMIT 2`).bind(sourceId,sourceKey).all<{id:string}>();
   if(results.length){add('review_match','This source identifier has been recorded before. Review its existing identity instead of reimporting.');continue}
  }
  // A fuzzy title/author match is advisory only, never sufficient for an auto-merge.
  const {results}=await db.prepare(`SELECT DISTINCT w.id,w.canonical_title AS title
    FROM works w JOIN contributions c ON c.work_id=w.id AND c.role_code IN ('author','coauthor')
    JOIN people p ON p.id=c.person_id
    WHERE lower(w.canonical_title)=lower(?) AND lower(p.preferred_name)=lower(?)
    LIMIT 8`).bind(title,author).all<{id:string;title:string}>();
  if(results.length){add('review_match','A work with this title and author exists. Verify edition and identity before linking.',{matches:results});continue}
  if(!quality.ready){add('needs_enrichment','No duplicate detected, but work/edition metadata is incomplete. Enrich it before draft import.');continue}
  add('create_draft',quality.optionalMissing.length?'Core identity and edition structure are present; optional metadata gaps remain for source enrichment. Draft review only.':'Core metadata is present; still requires source-rights and identity review before any draft import.');
 }
 return {dryRun:true,rows,summary};
}
