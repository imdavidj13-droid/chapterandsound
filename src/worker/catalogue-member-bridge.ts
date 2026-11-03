/**
 * Member-data compatibility for newly added BOOK_DB books.
 *
 * Member shelves and reviews have SQLite FKs to the original app DB. A minimal
 * internal same-ID reference is created there on demand, but the canonical book
 * metadata remains owned by BOOK_DB. No existing app records are deleted,
 * renamed or merged, and this never runs for unrelated IDs.
 */
interface Statement{
 bind(...params:(string|number|null)[]):Statement;
 first<T>():Promise<T|null>;
 run():Promise<unknown>;
}
interface DB{prepare(sql:string):Statement}
const allowed=new Set(['paperback','hardback','ebook','audiobook','unknown']);
export async function ensureMemberCatalogueReference(
 appDB:DB,catalogueDB:DB|undefined,workId:string,editionId:string|null
):Promise<{ok:boolean;error?:string;status?:number}>{
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(workId)||editionId&&!/^[A-Za-z0-9_-]{1,100}$/.test(editionId))
  return {ok:false,error:'Invalid book or edition identifier',status:400};
 const appWork=await appDB.prepare('SELECT id FROM works WHERE id=?').bind(workId).first();
 if(!appWork){
  if(!catalogueDB)return {ok:false,error:'Book not found',status:404};
  const work=await catalogueDB.prepare("SELECT id,canonical_title AS title,status FROM works WHERE id=? AND status IN ('verified','published')")
   .bind(workId).first<{id:string;title:string;status:string}>();
  if(!work)return {ok:false,error:'Book not found',status:404};
  await appDB.prepare("INSERT OR IGNORE INTO works(id,title,verification_status) VALUES(?,?,'unverified')")
   .bind(workId,work.title).run();
  // Detect a collision rather than relating a member review to a different work.
  const created=await appDB.prepare('SELECT title FROM works WHERE id=?').bind(workId).first<{title:string}>();
  if(!created||created.title!==work.title)return {ok:false,error:'Book ID conflict; contact site administration',status:409};
 }
 if(editionId){
  const current=await appDB.prepare('SELECT id,work_id AS workId FROM editions WHERE id=?').bind(editionId)
   .first<{id:string;workId:string}>();
  if(current&&current.workId!==workId)return {ok:false,error:'Edition identity conflict',status:409};
  if(!current){
   if(!catalogueDB)return {ok:false,error:'Book edition not found',status:404};
   const edition=await catalogueDB.prepare("SELECT id,format FROM editions WHERE id=? AND work_id=? AND publication_status NOT IN ('withdrawn')")
    .bind(editionId,workId).first<{id:string;format:string}>();
   if(!edition)return {ok:false,error:'Edition does not belong to this book',status:400};
   const format=allowed.has(edition.format)?edition.format:edition.format==='audio_cd'?'audiobook':'unknown';
   await appDB.prepare("INSERT OR IGNORE INTO editions(id,work_id,format,verification_status) VALUES(?,?,?,'unverified')")
    .bind(editionId,workId,format).run();
   const created=await appDB.prepare('SELECT work_id AS workId FROM editions WHERE id=?').bind(editionId)
    .first<{workId:string}>();
   if(!created||created.workId!==workId)return {ok:false,error:'Edition identity conflict',status:409};
  }
 }
 return {ok:true};
}
