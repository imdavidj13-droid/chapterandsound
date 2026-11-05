/**
 * Work-only catalogue drafts from the official Open Library dump.
 *
 * A work may exist without a complete edition. This guarded endpoint persists
 * exactly one canonical work and its author contribution, never invented ISBNs,
 * editions, source descriptions, images or public records. The work is a private
 * draft and must undergo rights/identity review before publication.
 */
type Scalar=string|number|null;
interface Statement {
 bind(...args:Scalar[]):Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<{meta?:{changes?:number}}>;
}
export interface WorkOnlyDB {
 prepare(sql:string):Statement;
 batch(statements:Statement[]):Promise<unknown[]>;
}
export class WorkOnlyConflict extends Error {
 constructor(message:string){super(message);this.name='WorkOnlyConflict'}
}
type Candidate={
 sourceId?:unknown;workSourceKey?:unknown;sourceKey?:unknown;
 title?:unknown;author?:unknown;authorSourceKeys?:unknown;
 editions?:unknown;authorId?:unknown;firstPublicationDate?:unknown;
 originalLanguage?:unknown;
};
const str=(value:unknown,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const norm=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const validDate=(value:string)=>!value||/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(value);
const keyPattern=/^\/works\/OL\d+W$/;
const authorPattern=/^\/authors\/OL\d+A$/;
type Outcome={decision:'create_work_draft'|'review';reason:string;title:string;workSourceKey:string;author:string};
export async function previewWorkOnlyDraft(db:WorkOnlyDB,input:unknown):Promise<Outcome>{
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new WorkOnlyConflict('Provide one Open Library work candidate.');
 const item=input as Candidate;
 const title=str(item.title),author=str(item.author,300);
 const workSourceKey=str(item.workSourceKey||item.sourceKey,100);
 const authorKeys=Array.isArray(item.authorSourceKeys)?item.authorSourceKeys:[];
 const review=(reason:string):Outcome=>({decision:'review',reason,title,author,workSourceKey});
 if(item.sourceId!=='openlibrary'||!keyPattern.test(workSourceKey))
  return review('A valid Open Library work key is required.');
 if(!title||!author||title.length>500||author.length>300)
  return review('Both a work title and canonical author name are required.');
 if(authorKeys.length!==1||typeof authorKeys[0]!=='string'||!authorPattern.test(authorKeys[0]))
  return review('Exactly one source-identified author is required; multi-author works need separate review.');
 if(!Array.isArray(item.editions)||item.editions.length!==0)
  return review('This endpoint is for work-only drafts. Editions must use the existing edition importer.');
 if(item.authorId)
  return review('Work-only imports cannot select an author ID supplied by a client.');
 if(!validDate(str(item.firstPublicationDate,20)))
  return review('Invalid first publication date.');
 const imported=(await db.prepare(
  "SELECT target_id AS id FROM catalogue_audit_log WHERE action IN ('import_draft','import_work_only_draft','simple_import') AND json_extract(details_json,'$.workSourceKey')=? LIMIT 2"
 ).bind(workSourceKey).all<{id:string}>()).results;
 if(imported.length)return review('This Open Library work key has already been imported.');
 // Open Library work keys may also be registered in the source ledger.
 const sourced=(await db.prepare(
  "SELECT sr.id FROM source_records sr JOIN metadata_sources ms ON ms.id=sr.source_id WHERE lower(ms.name)='openlibrary' AND sr.external_key=? LIMIT 2"
 ).bind(workSourceKey).all<{id:string}>()).results;
 if(sourced.length)return review('Open Library source key already exists; verify its canonical work link.');
 const nameMatches=(await db.prepare(
  "SELECT id FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 3"
 ).bind(author).all<{id:string}>()).results;
 if(nameMatches.length)return review('An author with this name already exists. Match their source identity before linking.');
 const workMatches=(await db.prepare(
  "SELECT DISTINCT w.id FROM works w JOIN contributions c ON c.work_id=w.id AND c.role_code IN ('author','coauthor') JOIN people p ON p.id=c.person_id WHERE lower(trim(w.canonical_title))=lower(?) AND lower(trim(p.preferred_name))=lower(?) LIMIT 3"
 ).bind(title,author).all<{id:string}>()).results;
 if(workMatches.length)return review('A work with the same title and author is already in the catalogue.');
 return {decision:'create_work_draft',reason:'No direct source, author-name or work-title collision detected. Further review required before publication.',title,author,workSourceKey};
}
export async function importWorkOnlyDraft(db:WorkOnlyDB,input:unknown,actor:string){
 const verdict=await previewWorkOnlyDraft(db,input);
 if(verdict.decision!=='create_work_draft')throw new WorkOnlyConflict(verdict.reason);
 const item=input as Candidate;
 const authorSourceKey=(item.authorSourceKeys as string[])[0]!;
 const authorId=crypto.randomUUID(),workId=crypto.randomUUID(),auditId=crypto.randomUUID();
 const date=str(item.firstPublicationDate,10)||null;
 const lang=str(item.originalLanguage,20)||null;
 // Source summaries and descriptions are not persisted until rights are assessed.
 const statements=[
  db.prepare("INSERT INTO people(id,preferred_name) VALUES(?,?)").bind(authorId,verdict.author),
  db.prepare("INSERT INTO works(id,canonical_title,original_language,first_publication_date,status) VALUES(?,?,?,?,'draft')").bind(workId,verdict.title,lang,date),
  db.prepare("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES(?,?,?,'author')").bind(crypto.randomUUID(),authorId,workId),
  db.prepare("INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,'import_work_only_draft','work',?,?)")
   .bind(auditId,actor,workId,JSON.stringify({sourceId:'openlibrary',workSourceKey:verdict.workSourceKey,authorSourceKeys:[authorSourceKey],importMode:'work_only',editionCount:0,requiresEnrichment:true,sourceRightsReviewRequired:true}))
 ];
 await db.batch(statements);
 return {saved:true,id:workId,status:'draft',published:false,editionCount:0,sourceKey:verdict.workSourceKey};
}
