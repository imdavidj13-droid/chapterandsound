import {previewCatalogueImport,type ImportCandidate} from './catalogue-import-preview.js';

/**
 * Review-only draft ingestion. All statements for one small batch are issued
 * through one D1 batch transaction. NEVER publish works or editions here.
 * Open Library search results are not accepted: every candidate requires
 * source-linked edition records and a resolved canonical author identity.
 */
type Scalar=string|number|null;
interface Statement{
 bind(...args:Scalar[]):Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<{meta?:{changes?:number}}>;
}
export interface DraftImportDB{prepare(query:string):Statement;batch(statements:Statement[]):Promise<unknown[]>}
type Candidate=ImportCandidate&{authorId?:string};
const clean=(s:unknown,max=500)=>typeof s==='string'?s.trim().slice(0,max):'';
const normalized=(s:string)=>s.replace(/[\s-]/g,'').toUpperCase();
const isoDate=(s:unknown)=>{const v=clean(s,10);return /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(v)?v:null};
const id=()=>crypto.randomUUID();
export class ImportConflict extends Error{constructor(message:string){super(message);this.name='ImportConflict'}}
export async function importCatalogueDrafts(db:DraftImportDB,input:unknown,actor:string){
 if(!Array.isArray(input)||input.length<1||input.length>10)throw new ImportConflict('Draft batches are limited to 1–10 books.');
 const items=input as Candidate[];
 const editionCount=items.reduce((n,item)=>n+(Array.isArray(item.editions)?item.editions.length:0),0);
 if(editionCount>50)throw new ImportConflict('More than 50 editions require a smaller draft batch.');
 const preview=await previewCatalogueImport(db,items);
 const blocker=preview.rows.find(row=>row.decision!=='create_draft');
 if(blocker)throw new ImportConflict('Batch held for review: '+blocker.title+' — '+blocker.decision+'. '+blocker.reason);
 const statements:Statement[]=[];
 const personIds=new Map<string,string>();
 const authorKeysByName=new Map<string,string>();
 const publishers=new Map<string,string>();
 const subjectIds=new Map<string,string>();
 let classificationSchemeId:string|null=null;
 const schemes=new Map<string,string>();
 const imported:{id:string;title:string;editionIds:string[]}[]=[];
 const recordKeys=new Set<string>();
 for(const candidate of items){
  const sourceId=clean(candidate.sourceId,50),workKey=clean(candidate.workSourceKey||candidate.sourceKey,200);
  if(sourceId!=='openlibrary'||!/^\/works\/OL\d+W$/.test(workKey))
   throw new ImportConflict('Only source-identified Open Library works can enter this pilot.');
  const previous=await db.prepare("SELECT target_id AS id FROM catalogue_audit_log WHERE action='import_draft' AND json_extract(details_json,'$.workSourceKey')=? LIMIT 1")
   .bind(workKey).first<{id:string}>();
  if(previous)throw new ImportConflict('Source work already imported as draft: '+workKey+' (work '+previous.id+')');
  const title=clean(candidate.title),author=clean(candidate.author),personKey=author.toLowerCase();
  const sourceAuthors=(candidate.authorSourceKeys||[]).filter(key=>/^\/authors\/OL\d+A$/.test(key)).sort().join('|');
  if(!sourceAuthors)throw new ImportConflict('Verified author source identifiers are required for '+author);
  const previousAuthorKeys=authorKeysByName.get(personKey);
  if(previousAuthorKeys&&previousAuthorKeys!==sourceAuthors)
   throw new ImportConflict('Two source author identities share this name; manual disambiguation required: '+author);
  authorKeysByName.set(personKey,sourceAuthors);
  const authors=(await db.prepare("SELECT id,preferred_name AS name FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 3")
   .bind(author).all<{id:string;name:string}>()).results;
  let personId=personIds.get(personKey);
  if(!personId){
   if(authors.length){
    if(authors.length!==1||!candidate.authorId||candidate.authorId!==authors[0]?.id)
     throw new ImportConflict('Existing author requires a confirmed canonical authorId: '+author);
    personId=authors[0].id;
   }else{
    if(candidate.authorId)throw new ImportConflict('An unknown authorId was supplied for '+author);
    personId=id();
    statements.push(db.prepare('INSERT INTO people(id,preferred_name) VALUES(?,?)').bind(personId,author));
   }
   personIds.set(personKey,personId);
  }else if(candidate.authorId&&candidate.authorId!==personId){
   throw new ImportConflict('Conflicting author identities in one draft batch: '+author);
  }
  const workId=id(),editionIds:string[]=[];
  statements.push(db.prepare("INSERT INTO works(id,canonical_title,original_language,first_publication_date,status) VALUES(?,?,?,?,'draft')")
   .bind(workId,title,clean(candidate.originalLanguage,20)||null,isoDate(candidate.firstPublicationDate||candidate.publicationDate)));
  statements.push(db.prepare("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES(?,?,?,'author')")
   .bind(id(),personId,workId));
  const desc=clean(candidate.description,8000);
  if(desc)statements.push(db.prepare("INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility) VALUES(?,'work',?,'synopsis',?,'private')")
   .bind(id(),workId,desc));
  const subjects=[...new Set((candidate.subjects||[]).map(value=>clean(value,300)).filter(Boolean))];
  if(subjects.length>40)throw new ImportConflict('This work has more than 40 subject tags; split and review the subject taxonomy: '+title);
  if(subjects.length){
   if(!classificationSchemeId){
    const found=await db.prepare("SELECT id FROM classification_schemes WHERE scheme_code='OPENLIBRARY' LIMIT 1").first<{id:string}>();
    classificationSchemeId=found?.id||id();
    if(!found)statements.push(db.prepare("INSERT INTO classification_schemes(id,scheme_code,version) VALUES(?,'OPENLIBRARY','1')").bind(classificationSchemeId));
   }
   for(const [index,subject] of subjects.entries()){
    const tag=subject.toLocaleLowerCase('en-GB');
    let subjectId=subjectIds.get(tag);
    if(!subjectId){
     const existing=await db.prepare('SELECT id FROM subjects WHERE scheme_id=? AND lower(label)=lower(?) LIMIT 2')
      .bind(classificationSchemeId,subject).all<{id:string}>();
     if(existing.results.length>1)throw new ImportConflict('Duplicate subject entries need review: '+subject);
     subjectId=existing.results[0]?.id||id();
     if(!existing.results.length){
      // Stable code with a hash suffix avoids collisions from long labels.
      let hash=2166136261;
      for(const character of tag){hash=Math.imul(hash^character.charCodeAt(0),16777619)}
      const code='OL_'+(hash>>>0).toString(16).padStart(8,'0');
      statements.push(db.prepare('INSERT INTO subjects(id,scheme_id,code,label) VALUES(?,?,?,?)')
       .bind(subjectId,classificationSchemeId,code,subject));
     }
     subjectIds.set(tag,subjectId);
    }
    statements.push(db.prepare('INSERT INTO work_subjects(id,work_id,subject_id,primary_flag) VALUES(?,?,?,?)')
     .bind(id(),workId,subjectId,index===0?1:0));
   }
  }
  for(const edition of candidate.editions||[]){
   const editionKey=clean(edition.sourceKey,200),format=clean(edition.format,30).toLowerCase();
   if(!/^\/books\/OL\d+M$/.test(editionKey)||recordKeys.has(editionKey))
    throw new ImportConflict('Repeated or invalid Open Library edition key: '+editionKey);
   recordKeys.add(editionKey);
   if(format==='audiobook'||format==='audio_cd')
    throw new ImportConflict('Audio edition '+editionKey+' needs a verified recording and narrator adapter before draft ingestion.');
   if(!['paperback','hardback','ebook','other_print','other_digital','unknown'].includes(format))
    throw new ImportConflict('Edition format cannot be safely mapped: '+editionKey);
   const editionId=id();editionIds.push(editionId);
   const count=typeof edition.pageCount==='number'&&Number.isSafeInteger(edition.pageCount)&&edition.pageCount>0?edition.pageCount:null;
   statements.push(db.prepare("INSERT INTO editions(id,work_id,format,language,page_count,publication_status,verification_status) VALUES(?,?,?,?,?,'draft','draft')")
    .bind(editionId,workId,format,clean(edition.language,20)||null,count));
   for(const [code,value] of [['ISBN13',edition.isbn13],['ISBN10',edition.isbn10]] as const){
    if(!value)continue;
    let schemeId=schemes.get(code);
    if(!schemeId){
     const scheme=await db.prepare('SELECT id FROM identifier_schemes WHERE code=?').bind(code).first<{id:string}>();
     schemeId=scheme?.id||id();
     if(!scheme)statements.push(db.prepare("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES(?,?,'edition','global')").bind(schemeId,code));
     schemes.set(code,schemeId);
    }
    const norm=normalized(value);
    statements.push(db.prepare("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES(?,?,'edition',?,?,?)")
     .bind(id(),schemeId,editionId,value,norm));
   }
   const pubName=clean(edition.publisher,200),release=isoDate(edition.publicationDate);
   let publisherId:string|null=null;
   if(pubName){
    const nameKey=pubName.toLowerCase();
    publisherId=publishers.get(nameKey)||null;
    if(!publisherId){
     const matches=(await db.prepare("SELECT o.id FROM organisations o JOIN publishers p ON p.organisation_id=o.id WHERE lower(trim(o.name))=lower(?) LIMIT 3")
      .bind(pubName).all<{id:string}>()).results;
     if(matches.length>1)throw new ImportConflict('Ambiguous publisher: '+pubName);
     publisherId=matches[0]?.id||id();
     if(!matches.length){
      statements.push(db.prepare("INSERT INTO organisations(id,name,organisation_type) VALUES(?,?,'publisher')").bind(publisherId,pubName));
      statements.push(db.prepare('INSERT INTO publishers(organisation_id) VALUES(?)').bind(publisherId));
     }
     publishers.set(nameKey,publisherId);
    }
   }
   if(release||publisherId)statements.push(db.prepare("INSERT INTO publication_events(id,edition_id,event_type,date_value,publisher_id) VALUES(? ,?,'released',?,?)")
    .bind(id(),editionId,release,publisherId));
  }
  const provenance={sourceId,workSourceKey:workKey,authorSourceKeys:candidate.authorSourceKeys,
   editionSourceKeys:(candidate.editions||[]).map(e=>e.sourceKey),subjects:candidate.subjects||[],
   deferredCovers:true,importMode:'draft',snapshot:'owner-reviewed'};
  statements.push(db.prepare("INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,'import_draft','work',?,?)")
   .bind(id(),actor,workId,JSON.stringify(provenance)));
  imported.push({id:workId,title,editionIds});
 }
 if(statements.length>400)throw new ImportConflict('Too many statements in one atomic draft batch. Submit fewer works.');
 // Cloudflare D1 batch runs atomically; constraint errors abort the complete batch.
 await db.batch(statements);
 return {saved:true,status:'draft',published:false,imported,editionCount,source:'openlibrary'};
}
