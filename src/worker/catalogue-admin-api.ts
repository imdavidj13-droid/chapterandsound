import {catalogueUploadImage} from './catalogue-media-api.js';
import type {CatalogueImageBucket} from './catalogue-media-api.js';
import {manualCatalogueAPI} from './catalogue-manual-api.js';
import {authConfigured,createAuth} from './auth.js';
import {isVerifiedSiteOwner} from './admin-role.js';

/**
 * Dedicated BOOK_DB catalogue access.
 * All routes remain behind the existing verified-site-owner session and persisted
 * admin role. Do not read or write the legacy application's catalogue tables here.
 */
interface Statement {
  bind(...params:(string|number|null)[]):Statement;
  first<T>():Promise<T|null>;
  all<T>():Promise<{results:T[]}>;
  run():Promise<{meta?:{changes?:number}}>;
}
interface Database {
  prepare(sql:string):Statement;
  batch(statements:Statement[]):Promise<unknown[]>;
}
interface Env {
  DB?:Database;
  BOOK_DB?:Database;
  CATALOGUE_MEDIA?:CatalogueImageBucket;
  BETTER_AUTH_SECRET?:string;
  PUBLIC_ORIGIN?:string;
  MAIL_API_KEY?:string;
  MAIL_FROM?:string;
  ADMIN_EMAIL?:string;
  SIGNUP_MODE?:string;
}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400)=>json({error:message},status);
const str=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const fields=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const uuid=()=>crypto.randomUUID();
const workTypes=new Set(['book','short_story','collection','graphic_novel','comic','poetry','play','reference','other']);
const formats=new Set(['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown']);
const performances=new Set(['single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice','unknown']);
const abridgements=new Set(['unabridged','abridged','adapted','unknown']);
const roles=new Set(['author','coauthor','narrator','cast','translator','editor','illustrator','cover_artist','foreword','afterword','adapter','producer','director','audio_engineer','other']);
const statuses=new Set(['draft','needs_review','verified','published','withdrawn','suppressed']);
const validPartialDate=(s:string)=>!s||/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(s);
const validLanguage=(s:string)=>!s||/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(s);
const safeId=(s:string)=>s.length>=1&&s.length<=100&&/^[A-Za-z0-9_-]+$/.test(s);
const limit=(u:URL)=>Math.min(Math.max(Number(u.searchParams.get('limit'))||40,1),100);
const offset=(u:URL)=>Math.min(Math.max(Number(u.searchParams.get('offset'))||0,0),100000);
function audit(db:Database,actor:string,action:string,type:string,id:string,details:unknown){
 return db.prepare('INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,?,?,?,?)')
  .bind(uuid(),actor,action,type,id,JSON.stringify(details));
}
function revision(db:Database,actor:string,type:string,id:string,value:unknown){
 return db.prepare('INSERT INTO record_revisions(id,entity_kind,entity_id,revision,after_json,actor_external_id) VALUES(?,?,?,?,?,?)')
  .bind(uuid(),type,id,1,JSON.stringify(value),actor);
}
async function recordExists(db:Database,table:'works'|'editions'|'people'|'audio_recordings',id:string){
 return !!await db.prepare('SELECT id FROM '+table+' WHERE id=?').bind(id).first();
}
async function catalogueReady(db:Database):Promise<boolean>{
 try{
  const r=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalogue_audit_log'").first<{name:string}>();
  return r?.name==='catalogue_audit_log';
 }catch{return false}
}
export async function catalogueAdminAPI(request:Request,env:Env):Promise<Response>{
 if(!env.DB||!authConfigured(env as Parameters<typeof authConfigured>[0]))return fail('Site administration is not configured',503);
 const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
 const session=await auth.api.getSession({headers:request.headers}).catch(()=>null);
 if(!session?.user.emailVerified)return fail('A verified administrator session is required',401);
 if(!isVerifiedSiteOwner(session.user,env.ADMIN_EMAIL))return fail('Owner-only catalogue administration',403);
 const role=await env.DB.prepare("SELECT role FROM site_roles WHERE member_id=? AND role='admin'").bind(session.user.id).first<{role:string}>();
 if(!role)return fail('An administrator role is required',403);
 const url=new URL(request.url);
 if(!['GET','POST','PATCH'].includes(request.method))return fail('Method not supported',405);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return fail('Cross-origin writes are forbidden',403);
 const db=env.BOOK_DB;
 const path=url.pathname.slice('/api/catalogue-admin/'.length);
 const segments=path.split('/').filter(Boolean);
 if(!db)return fail('The BOOK_DB catalogue binding is not configured yet',503);
 if(!await catalogueReady(db))return fail('The catalogue database has not had its dedicated migrations applied yet',503);
 if(path==='health'&&request.method==='GET')return json({ready:true,catalogue:'BOOK_DB',schema:'installed',imageStorage:!!env.CATALOGUE_MEDIA});
 if(path==='upload-image'&&request.method==='POST')return catalogueUploadImage(request,db,env.CATALOGUE_MEDIA,session.user.id);
 if(segments[0]==='manual')return manualCatalogueAPI(request,db,session.user.id,path);
 try{
  if(request.method==='GET'){
   const q=str(url.searchParams.get('q'),150),l=limit(url),o=offset(url);
   if(path==='summary'){
    const counts=await db.prepare(`SELECT (SELECT count(*) FROM works) AS works,
      (SELECT count(*) FROM editions) AS editions,
      (SELECT count(*) FROM audio_recordings) AS recordings,
      (SELECT count(*) FROM people) AS contributors,
      (SELECT count(*) FROM works WHERE status='published') AS catalogueBooks`).first();
    return json({counts});
   }
   if(path==='works'){
    const {results}=await db.prepare(`SELECT w.id,w.canonical_title AS title,w.work_type AS type,w.status,w.revision,
    w.original_language AS language,w.first_publication_date AS firstPublicationDate,
    (SELECT group_concat(p.preferred_name,', ') FROM contributions c JOIN people p ON p.id=c.person_id
      WHERE c.work_id=w.id AND c.role_code IN ('author','coauthor')) AS authors,
    (SELECT count(*) FROM editions e WHERE e.work_id=w.id) AS editions
    FROM works w WHERE (?='' OR instr(lower(w.canonical_title),lower(?))>0)
    ORDER BY w.created_at DESC,w.id DESC LIMIT ? OFFSET ?`).bind(q,q,l,o).all();
    return json({items:results});
   }
   if(segments.length===3&&segments[0]==='works'&&segments[2]==='linked'){
    const workId=segments[1]||'';
    if(!safeId(workId))return fail('Invalid book ID');
    if(!await recordExists(db,'works',workId))return fail('Book not found',404);
    const [{results:editions},{results:recordings}]=await Promise.all([
     db.prepare("SELECT id,work_id AS workId,format,title_override AS title,edition_statement AS statement,language,page_count AS pages,revision,publication_status AS publicationStatus FROM editions WHERE work_id=? ORDER BY created_at,id")
      .bind(workId).all(),
     db.prepare("SELECT id,work_id AS workId,recording_title AS title,language,abridgement,performance_type AS performance,duration_seconds AS seconds,recorded_date AS recordedDate,revision FROM audio_recordings WHERE work_id=? ORDER BY created_at,id")
      .bind(workId).all()
    ]);
    return json({editions,recordings});
   }
   if(segments.length===2&&segments[0]==='works'){
    const workId=segments[1]??'';
    if(!safeId(workId))return fail('Invalid catalogue ID');
    const work=await db.prepare(`SELECT id,canonical_title AS title,work_type AS type,status,revision,
     original_language AS language,first_publication_date AS firstPublicationDate,
     updated_at AS updatedAt FROM works WHERE id=?`).bind(workId).first();
    if(!work)return fail('Book not found',404);
    const synopsis=await db.prepare(`SELECT id,body FROM text_content
      WHERE entity_kind='work' AND entity_id=? AND content_type='synopsis'
      AND source_claim_id IS NULL ORDER BY rowid DESC LIMIT 1`).bind(workId).first<{id:string;body:string}>();
    const {results:credits}=await db.prepare(`SELECT c.id,c.role_code AS role,p.id AS personId,
      p.preferred_name AS name FROM contributions c JOIN people p ON p.id=c.person_id
      WHERE c.work_id=? ORDER BY c.credit_order,c.id`).bind(workId).all();
    return json({work:{...work,synopsis:synopsis?.body??''},credits});
   }
   if(path==='author-suggestions'){
    const name=q.toLocaleLowerCase('en-GB');
    const [{results:catalogue},{results:existing}]=await Promise.all([
     db.prepare("SELECT id,preferred_name AS name FROM people WHERE identity_status NOT IN ('merged','suppressed') AND (?='' OR instr(lower(preferred_name),lower(?))>0) ORDER BY preferred_name LIMIT ?").bind(q,q,l).all<{id:string;name:string}>(),
     env.DB.prepare("SELECT id,display_name AS name FROM people WHERE (?='' OR instr(lower(display_name),lower(?))>0) ORDER BY display_name LIMIT ?").bind(q,q,l).all<{id:string;name:string}>()
    ]);
    // Do not merge distinct people simply because their display names match.
    const unique=new Map<string,{id:string;name:string}>();
    for(const row of [...catalogue,...existing])if(row.id&&!unique.has(row.id))unique.set(row.id,row);
    const items=[...unique.values()].filter(v=>!name||v.name.toLocaleLowerCase('en-GB').includes(name))
     .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,l);
    return json({items});
   }
   if(path==='legacy-people'){
    // Read-only lookup: offer an explicit reuse of existing website author IDs
    // instead of creating another contributor with the same name.
    const {results}=await env.DB.prepare(
      "SELECT id,display_name AS name,biography FROM people WHERE (?='' OR instr(lower(display_name),lower(?))>0) ORDER BY display_name LIMIT ?"
    ).bind(q,q,l).all();
    return json({items:results});
   }
   if(path==='people'){
    const {results}=await db.prepare(`SELECT id,preferred_name AS name,identity_status AS status
      FROM people WHERE (?='' OR instr(lower(preferred_name),lower(?))>0)
      ORDER BY preferred_name,id LIMIT ? OFFSET ?`).bind(q,q,l,o).all();
    return json({items:results});
   }
   if(path==='editions'){
    const {results}=await db.prepare(`SELECT e.id,e.work_id AS workId,w.canonical_title AS title,e.format,
      e.page_count AS pageCount,e.verification_status AS status,
      e.publication_status AS publicationStatus FROM editions e
      JOIN works w ON w.id=e.work_id ORDER BY e.created_at DESC LIMIT ? OFFSET ?`).bind(l,o).all();
    return json({items:results});
   }
   if(path==='recordings'){
    const {results}=await db.prepare(`SELECT r.id,r.work_id AS workId,w.canonical_title AS title,
     r.duration_seconds AS durationSeconds,r.performance_type AS performanceType,
     r.abridgement,r.verification_status AS status FROM audio_recordings r
     JOIN works w ON w.id=r.work_id ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(l,o).all();
    return json({items:results});
   }
   return fail('Unknown catalogue route',404);
  }
  if(Number(request.headers.get('Content-Length')||0)>20000)return fail('Request too large',413);
  const body=fields(await request.json().catch(()=>null));
  if(!body)return fail('Provide a JSON object');
  const actor=session.user.id;
  if(request.method==='PATCH'&&segments.length===3&&segments[0]==='works'&&segments[2]==='publication'){
   const workId=segments[1]||'',expected=body.expectedRevision;
   if(!safeId(workId))return fail('Invalid book identifier');
   if(!Number.isInteger(expected)||Number(expected)<1)return fail('A valid expectedRevision is required');
   const target=str(body.status,30);
   if(!['draft','published'].includes(target))return fail('Status must be draft or published');
   const old=await db.prepare('SELECT id,canonical_title AS title,status,revision FROM works WHERE id=?')
    .bind(workId).first<{id:string;title:string;status:string;revision:number}>();
   if(!old)return fail('Book not found',404);
   if(old.revision!==expected)return fail('This book changed elsewhere. Reload before changing its status.',409);
   if(!['draft','published'].includes(old.status))return fail('This book has a protected status requiring separate review',409);
   if(old.status===target)return json({saved:true,id:workId,status:target,revision:old.revision});
   if(target==='published'){
    const contributor=await db.prepare("SELECT id FROM contributions WHERE work_id=? AND role_code IN ('author','coauthor') LIMIT 1").bind(workId).first();
    const edition=await db.prepare('SELECT id FROM editions WHERE work_id=? LIMIT 1').bind(workId).first();
    if(!contributor||!edition)return fail('Before publishing, link an author and at least one edition.',409);
   }
   const nextRev=old.revision+1,after={...old,status:target,revision:nextRev};
   const batch=await db.batch([
    db.prepare("UPDATE works SET status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status=?")
     .bind(target,workId,expected,old.status),
    db.prepare("UPDATE text_content SET visibility=? WHERE entity_kind='work' AND entity_id=? AND content_type='synopsis' AND source_claim_id IS NULL")
     .bind(target==='published'?'public':'private',workId),
    db.prepare("INSERT INTO record_revisions(id,entity_kind,entity_id,revision,before_json,after_json,actor_external_id,reason) VALUES(?,'work',?,?,?,?,?,?)")
     .bind(uuid(),workId,nextRev,JSON.stringify(old),JSON.stringify(after),actor,'Publication status change'),
    audit(db,actor,'publication_status','work',workId,{before:old.status,after:target})
   ]) as {meta?:{changes?:number}}[];
   if(batch[0]?.meta?.changes===0)return fail('This book changed elsewhere. Reload and try again.',409);
   return json({saved:true,id:workId,status:target,revision:nextRev});
  }
  if(request.method==='PATCH'&&segments.length===2&&segments[0]==='works'){
   const workId=segments[1]??'',expected=body.expectedRevision;
   if(!safeId(workId))return fail('Invalid catalogue ID');
   if(!Number.isInteger(expected)||Number(expected)<1)return fail('A valid expectedRevision is required');
   const old=await db.prepare(`SELECT id,canonical_title AS title,work_type AS type,
    original_language AS language,first_publication_date AS firstPublicationDate,
    status,revision FROM works WHERE id=?`).bind(workId).first<{id:string;title:string;type:string;language:string|null;firstPublicationDate:string|null;status:string;revision:number}>();
   if(!old)return fail('Book not found',404);
   if(['withdrawn','suppressed'].includes(old.status))return fail('Withdrawn or suppressed records cannot be edited from this form',409);
   if(old.revision!==expected)return json({error:'This book was changed elsewhere. Reload before saving.',currentRevision:old.revision},409);
   const title=str(body.title,500),type=str(body.type,40),language=str(body.language,40)||null;
   const date=str(body.firstPublicationDate,10)||null;
   if(!title)return fail('Book title is required');
   if(!workTypes.has(type))return fail('Invalid work type');
   if(!validPartialDate(date||''))return fail('Publication date must be YYYY, YYYY-MM or YYYY-MM-DD');
   if(!validLanguage(language||''))return fail('Invalid BCP 47 language tag');
   if(typeof body.synopsis!=='string'||body.synopsis.length>12000)return fail('Synopsis must be text of no more than 12,000 characters');
   const synopsis=body.synopsis.trim(),nextRev=old.revision+1;
   const priorSyn=await db.prepare(`SELECT id,body FROM text_content WHERE entity_kind='work' AND entity_id=? AND
    content_type='synopsis' AND source_claim_id IS NULL
    ORDER BY rowid DESC LIMIT 1`).bind(workId).first<{id:string;body:string}>();
   const before={...old,synopsis:priorSyn?.body??''};
   const after={...old,title,type,language,firstPublicationDate:date,synopsis,revision:nextRev};
   const statements:Statement[]=[
    db.prepare(`UPDATE works SET canonical_title=?,work_type=?,original_language=?,
      first_publication_date=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND revision=? AND status NOT IN ('withdrawn','suppressed')`)
     .bind(title,type,language,date,workId,expected)
   ];
   if(priorSyn){
    if(synopsis)statements.push(db.prepare('UPDATE text_content SET body=?,visibility=? WHERE id=?').bind(synopsis,old.status==='published'?'public':'private',priorSyn.id));
    else statements.push(db.prepare('DELETE FROM text_content WHERE id=?').bind(priorSyn.id));
   }else if(synopsis){
    statements.push(db.prepare(`INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility)
       VALUES(?,'work',?,'synopsis',?)`).bind(uuid(),workId,synopsis,old.status==='published'?'public':'private'));
   }
   statements.push(db.prepare(`INSERT INTO record_revisions(id,entity_kind,entity_id,revision,before_json,after_json,actor_external_id,reason)
    VALUES(?,'work',?,?,?,?,?,?)`).bind(uuid(),workId,nextRev,JSON.stringify(before),JSON.stringify(after),actor,'Metadata edit'));
   statements.push(audit(db,actor,'update','work',workId,{before,after}));
   const result=await db.batch(statements) as {meta?:{changes?:number}}[];
   if(result[0]?.meta?.changes===0)return json({error:'This book was changed elsewhere. Reload before saving.'},409);
   return json({saved:true,id:workId,revision:nextRev});
  }
  if(path==='consolidate-people'){
   // Idempotent, non-destructive bridge: copy existing website author/narrator
   // profiles into the canonical BOOK_DB using the original IDs.
   // Member reviews and their foreign keys in DB are never altered.
   const {results:legacy}=await env.DB.prepare('SELECT id,display_name AS name,biography AS bio FROM people ORDER BY id LIMIT 5000')
     .all<{id:string;name:string;bio:string|null}>();
   const {results:current}=await db.prepare('SELECT id,preferred_name AS name FROM people LIMIT 5000')
     .all<{id:string;name:string}>();
   const ids=new Set(current.map(p=>p.id));
   const names=new Map(current.map(p=>[p.name.trim().toLocaleLowerCase('en'),p.id]));
   let copied=0,conflicts=0,skipped=0;
   const pending:Statement[]=[];
   for(const person of legacy){
    const id=person.id,name=person.name.trim();
    if(!safeId(id)||!name){conflicts++;continue;}
    if(ids.has(id)){skipped++;continue;}
    const other=names.get(name.toLocaleLowerCase('en'));
    if(other&&other!==id){conflicts++;continue;}
    const details={id,name,bio:person.bio,origin:'existing-website-profile'};
    pending.push(
      db.prepare('INSERT INTO people(id,preferred_name,bio) VALUES(?,?,?)').bind(id,name,person.bio||null),
      revision(db,actor,'person',id,details),
      audit(db,actor,'preserve_existing_profile','person',id,details)
    );
    ids.add(id);names.set(name.toLocaleLowerCase('en'),id);copied++;
   }
   // Bounded transactional batches avoid oversized D1 batch calls.
   for(let index=0;index<pending.length;index+=45)await db.batch(pending.slice(index,index+45));
   return json({saved:true,copied,skipped,conflicts,moreMayExist:legacy.length===5000});
  }
  if(path==='works'){
   const title=str(body.title,500),type=str(body.type,40)||'book';
   const language=str(body.language,40)||null,date=str(body.firstPublicationDate,10)||null;
   if(!title)return fail('A work title is required');
   if(!workTypes.has(type))return fail('Invalid work type');
   if(!validPartialDate(date||''))return fail('Publication date must be a year, year-month or date');
   if(!validLanguage(language||''))return fail('Invalid BCP 47 language tag');
   const synopsis=body.synopsis===undefined?'':typeof body.synopsis==='string'?body.synopsis.trim():null;
   if(synopsis===null||synopsis.length>12000)return fail('Synopsis must be text of no more than 12,000 characters');
   // A single author field: resolve canonical BOOK_DB identities first, then
   // existing website identities, and create only when no exact name exists.
   const requestedAuthorName=str(body.authorName,500);
   const requestedAuthorId=str(body.authorId,100);
   let selectedAuthorId='',authorName='';
   const statements:Statement[]=[];
   if(requestedAuthorId){
    if(!safeId(requestedAuthorId))return fail('Invalid author identity');
    const selected=await db.prepare("SELECT id,preferred_name AS name FROM people WHERE id=? AND identity_status NOT IN ('merged','suppressed')")
     .bind(requestedAuthorId).first<{id:string;name:string}>();
    if(selected){selectedAuthorId=selected.id;authorName=selected.name;}
    else{
     const legacy=await env.DB.prepare("SELECT id,display_name AS name,biography AS bio FROM people WHERE id=?")
      .bind(requestedAuthorId).first<{id:string;name:string;bio:string|null}>();
     if(!legacy)return fail('Selected author no longer exists. Search again.',409);
     const conflict=await db.prepare("SELECT id FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 1")
      .bind(legacy.name).first<{id:string}>();
     if(conflict)return fail('This author also exists in the catalogue. Select its existing catalogue identity.',409);
     selectedAuthorId=legacy.id;authorName=legacy.name;
     statements.push(db.prepare('INSERT INTO people(id,preferred_name,bio) VALUES(?,?,?)').bind(legacy.id,legacy.name,legacy.bio||null));
    }
    if(requestedAuthorName&&requestedAuthorName.toLocaleLowerCase()!==authorName.toLocaleLowerCase())
     return fail('Selected author and submitted name do not match. Search again.',409);
   }else if(requestedAuthorName){
    const {results:canonical}=await db.prepare(`SELECT id,preferred_name AS name FROM people
      WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 3`)
      .bind(requestedAuthorName).all<{id:string;name:string}>();
    if(canonical.length>1)return fail('More than one author has that name. Resolve the duplicate author profiles before linking.',409);
    if(canonical.length===1){
     selectedAuthorId=canonical[0]!.id;authorName=canonical[0]!.name;
    }else{
     const {results:legacy}=await env.DB.prepare(`SELECT id,display_name AS name,biography AS bio FROM people
       WHERE lower(trim(display_name))=lower(?) LIMIT 3`)
       .bind(requestedAuthorName).all<{id:string;name:string;bio:string|null}>();
     if(legacy.length>1)return fail('More than one existing author has that name. Review the matching profiles before linking.',409);
     if(legacy.length===1){
      const existing=legacy[0]!;
      // Preserve the original contributor identity so historical links survive.
      const collidingId=await db.prepare('SELECT id,preferred_name FROM people WHERE id=?').bind(existing.id).first<{id:string;preferred_name:string}>();
      if(collidingId&&collidingId.preferred_name.toLocaleLowerCase()!==existing.name.toLocaleLowerCase())
       return fail('An author identity conflict needs review before saving.',409);
      selectedAuthorId=existing.id;authorName=existing.name;
      if(!collidingId)statements.push(db.prepare('INSERT INTO people(id,preferred_name,bio) VALUES(?,?,?)').bind(existing.id,existing.name,existing.bio||null));
     }else{
      selectedAuthorId=uuid();authorName=requestedAuthorName;
      statements.push(db.prepare('INSERT INTO people(id,preferred_name) VALUES(?,?)').bind(selectedAuthorId,requestedAuthorName));
     }
    }
   }
   if(selectedAuthorId){
    const dup=await db.prepare(`SELECT w.id FROM works w JOIN contributions c ON c.work_id=w.id
      WHERE lower(w.canonical_title)=lower(?) AND c.person_id=? AND c.role_code IN ('author','coauthor') LIMIT 1`)
      .bind(title,selectedAuthorId).first<{id:string}>();
    if(dup)return json({error:'This author already has a catalogue book with the same title. Open the existing book instead.',existingId:dup.id},409);
   }
   const id=uuid(),details={id,title,type,language,firstPublicationDate:date,synopsis,authorId:selectedAuthorId||null,authorName:authorName||null,status:'draft'};
   // Batch creates the optional author, work, credit, synopsis and audit together.
   statements.push(db.prepare("INSERT INTO works(id,canonical_title,work_type,original_language,first_publication_date,status) VALUES(?,?,?,?,?,'draft')").bind(id,title,type,language,date));
   if(selectedAuthorId)statements.push(db.prepare("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES(?,?,?,'author')").bind(uuid(),selectedAuthorId,id));
   if(synopsis)statements.push(db.prepare("INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility) VALUES(?,'work',?,'synopsis',?,'private')").bind(uuid(),id,synopsis));
   // The first edition and its audiobook recording are created with the
   // book in one atomic D1 batch. This is the standard manual-entry workflow.
   const edition=fields(body.edition);
   let newEditionId:string|null=null,recordingId:string|null=null;
   if(edition){
    const fmt=str(edition.format,40),editionLanguage=str(edition.language,40)||null;
    const pages=edition.pageCount===null||edition.pageCount===undefined||edition.pageCount===''?null:Number(edition.pageCount);
    const released=str(edition.releaseDate,10)||null;
    if(!formats.has(fmt))return fail('Choose a valid first edition format');
    if(!validLanguage(editionLanguage||''))return fail('Invalid edition language');
    if(pages!==null&&(!Number.isInteger(pages)||pages<=0||pages>100000))return fail('Page count must be a positive whole number');
    if(!validPartialDate(released||''))return fail('Invalid release date');
    const publisherName=str(edition.publisherName,500);
    let publisherId:string|null=null;
    if(publisherName){
     const {results:publishers}=await db.prepare("SELECT o.id FROM organisations o JOIN publishers p ON p.organisation_id=o.id WHERE lower(trim(o.name))=lower(?) LIMIT 3")
      .bind(publisherName).all<{id:string}>();
     if(publishers.length>1)return fail('Publisher name is ambiguous; use the existing publisher editor first',409);
     if(publishers.length===1)publisherId=publishers[0]!.id;
     else{
      publisherId=uuid();
      statements.push(db.prepare("INSERT INTO organisations(id,name,organisation_type) VALUES(? ,?,'publisher')").bind(publisherId,publisherName));
      statements.push(db.prepare("INSERT INTO publishers(organisation_id) VALUES(?)").bind(publisherId));
     }
    }
    newEditionId=uuid();
    statements.push(db.prepare("INSERT INTO editions(id,work_id,format,language,page_count,publication_status,verification_status) VALUES(?,?,?,?,?,'published','published')")
      .bind(newEditionId,id,fmt,editionLanguage,pages));
    const identifiers=[['ISBN13',str(edition.isbn13,40)],['ISBN10',str(edition.isbn10,40)],['ASIN',str(edition.asin,40)]] as const;
    for(const [schemeCode,raw] of identifiers){
     if(!raw)continue;
     const normalized=raw.replace(/[\\s-]/g,'').toUpperCase();
     if(schemeCode==='ISBN13'&&(!/^(978|979)\\d{10}$/.test(normalized)||([...normalized].slice(0,12).reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)+Number(normalized[12]))%10!==0))
      return fail('Enter a valid ISBN-13 with its correct checksum');
     if(schemeCode==='ISBN10'&&(!/^\\d{9}[\\dX]$/.test(normalized)||[...normalized].reduce((sum,char,index)=>sum+(char==='X'?10:Number(char))*(10-index),0)%11!==0))
      return fail('Enter a valid ISBN-10 with its correct checksum');
     if(schemeCode==='ASIN'&&!/^[A-Z0-9]{10}$/.test(normalized))return fail('ASIN must contain exactly 10 letters or numbers');
     const duplicate=await db.prepare("SELECT id FROM entity_identifiers WHERE normalized_value=? AND scheme_id IN (SELECT id FROM identifier_schemes WHERE code=?) LIMIT 1")
      .bind(normalized,schemeCode).first<{id:string}>();
     if(duplicate)return json({error:schemeCode+' is already assigned to a catalogue edition. Open the existing record instead.',existingId:duplicate.id},409);
     let scheme=await db.prepare('SELECT id FROM identifier_schemes WHERE code=?').bind(schemeCode).first<{id:string}>();
     if(!scheme){
      scheme={id:uuid()};
      statements.push(db.prepare("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES(? ,?,'edition','global')").bind(scheme.id,schemeCode));
     }
     statements.push(db.prepare("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES(?,?,'edition',?, ?,?)")
       .bind(uuid(),scheme.id,newEditionId,raw,normalized));
    }
    if(released||publisherId)statements.push(db.prepare("INSERT INTO publication_events(id,edition_id,event_type,date_value,publisher_id) VALUES(? ,?,'released',?,?)")
      .bind(uuid(),newEditionId,released,publisherId));
    if(fmt==='audiobook'||fmt==='audio_cd'){
     const audio=fields(edition.audio)||{};
     const performance=str(audio.performance,40)||'unknown',abridgement=str(audio.abridgement,40)||'unknown';
     const duration=audio.durationMinutes===null||audio.durationMinutes===undefined||audio.durationMinutes===''?null:Number(audio.durationMinutes);
     if(!performances.has(performance)||!abridgements.has(abridgement))return fail('Invalid audiobook performance or abridgement');
     if(duration!==null&&(!Number.isInteger(duration)||duration<=0||duration>1000000))return fail('Audiobook duration must be a positive whole number of minutes');
     recordingId=uuid();
     statements.push(db.prepare("INSERT INTO audio_recordings(id,work_id,language,performance_type,abridgement,duration_seconds,verification_status) VALUES(?,?,?,?,?,?,'published')")
      .bind(recordingId,id,editionLanguage,performance,abridgement,duration===null?null:duration*60));
     statements.push(db.prepare("INSERT INTO edition_recordings(edition_id,recording_id,primary_recording) VALUES(?,?,1)").bind(newEditionId,recordingId));
     const narratorName=str(audio.narratorName,500);
     const narratorId=str(audio.narratorId,100);
     if(narratorId){
      if(!safeId(narratorId))return fail('Invalid narrator identity');
      const selected=await db.prepare("SELECT id,preferred_name AS name FROM people WHERE id=? AND identity_status NOT IN ('merged','suppressed')")
       .bind(narratorId).first<{id:string;name:string}>();
      if(!selected)return fail('Selected narrator is unavailable. Choose an existing catalogue contributor.',409);
      if(narratorName&&selected.name.toLocaleLowerCase()!==narratorName.toLocaleLowerCase())
       return fail('Selected narrator and submitted name do not match. Search again.',409);
      statements.push(db.prepare("INSERT INTO contributions(id,person_id,recording_id,role_code) VALUES(?,?,?,'narrator')").bind(uuid(),selected.id,recordingId));
     }else if(narratorName){
      let narrator=await db.prepare("SELECT id FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 1")
       .bind(narratorName).first<{id:string}>();
      if(!narrator&&narratorName.toLocaleLowerCase()===authorName.toLocaleLowerCase()&&selectedAuthorId)narrator={id:selectedAuthorId};
      if(!narrator){
       const {results:oldNarrators}=await env.DB.prepare("SELECT id,display_name AS name,biography AS bio FROM people WHERE lower(trim(display_name))=lower(?) LIMIT 2")
        .bind(narratorName).all<{id:string;name:string;bio:string|null}>();
       if(oldNarrators.length>1)return fail('Narrator name is ambiguous; review the existing contributors first',409);
       if(oldNarrators.length===1){
        narrator={id:oldNarrators[0]!.id};
        const exists=await db.prepare('SELECT id FROM people WHERE id=?').bind(narrator.id).first();
        if(!exists)statements.push(db.prepare('INSERT INTO people(id,preferred_name,bio) VALUES(?,?,?)').bind(narrator.id,narratorName,oldNarrators[0]!.bio||null));
       }else{
        narrator={id:uuid()};
        statements.push(db.prepare('INSERT INTO people(id,preferred_name) VALUES(?,?)').bind(narrator.id,narratorName));
       }
      }
      statements.push(db.prepare("INSERT INTO contributions(id,person_id,recording_id,role_code) VALUES(?,?,?,'narrator')").bind(uuid(),narrator.id,recordingId));
     }
    }
   }
   statements.push(revision(db,actor,'work',id,details),audit(db,actor,'create','work',id,details));
   await db.batch(statements);
   return json({id,saved:true,editionId:newEditionId,recordingId,status:'draft'},201);
  }
  if(path==='people'){
   const name=str(body.name,500);if(!name)return fail('Contributor name is required');
   const match=await db.prepare("SELECT id FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 1")
    .bind(name).first<{id:string}>();
   if(match)return json({error:'This contributor already exists. Open their profile instead.',existingId:match.id},409);
   const id=uuid(),details={id,name,status:'provisional'};
   await db.batch([
    db.prepare('INSERT INTO people(id,preferred_name) VALUES(?,?)').bind(id,name),
    revision(db,actor,'person',id,details),audit(db,actor,'create','person',id,details)
   ]);
   return json({id,saved:true},201);
  }
  if(path==='editions'){
   const workId=str(body.workId,100),format=str(body.format,40);
   if(!workId||!await recordExists(db,'works',workId))return fail('Choose an existing catalogue book',404);
   if(!formats.has(format))return fail('Choose a valid edition format');
   const pageCount=body.pageCount===null||body.pageCount===undefined||body.pageCount===''?null:Number(body.pageCount);
   if(pageCount!==null&&(!Number.isInteger(pageCount)||pageCount<=0))return fail('Page count must be a positive whole number');
   const id=uuid(),details={id,workId,format,pageCount,status:'published'};
   await db.batch([
    db.prepare("INSERT INTO editions(id,work_id,format,page_count,publication_status,verification_status) VALUES(?,?,? ,?,'published','published')").bind(id,workId,format,pageCount),
    revision(db,actor,'edition',id,details),audit(db,actor,'create','edition',id,details)
   ]);
   return json({id,saved:true},201);
  }
  if(path==='recordings'){
   const workId=str(body.workId,100),performanceType=str(body.performanceType,40)||'unknown';
   const abridgement=str(body.abridgement,40)||'unknown';
   if(!workId||!await recordExists(db,'works',workId))return fail('Choose an existing catalogue book',404);
   if(!performances.has(performanceType)||!abridgements.has(abridgement))return fail('Invalid recording details');
   const duration=body.durationSeconds===null||body.durationSeconds===undefined||body.durationSeconds===''?null:Number(body.durationSeconds);
   if(duration!==null&&(!Number.isInteger(duration)||duration<=0))return fail('Recording duration must be positive whole seconds');
   const id=uuid(),details={id,workId,performanceType,abridgement,durationSeconds:duration,status:'published'};
   await db.batch([
    db.prepare("INSERT INTO audio_recordings(id,work_id,performance_type,abridgement,duration_seconds,verification_status) VALUES(?,?,?,?,?,'published')").bind(id,workId,performanceType,abridgement,duration),
    revision(db,actor,'recording',id,details),audit(db,actor,'create','recording',id,details)
   ]);
   return json({id,saved:true},201);
  }
  if(path==='contributions'){
   const personId=str(body.personId,100),workId=str(body.workId,100),recordingId=str(body.recordingId,100);
   const role=str(body.role,40);
   if(!personId||!await recordExists(db,'people',personId))return fail('Choose an existing contributor',404);
   if(!roles.has(role))return fail('Invalid contributor role');
   if(Boolean(workId)===Boolean(recordingId))return fail('Select exactly one work or recording');
   if(role==='narrator'&&(!recordingId||!await recordExists(db,'audio_recordings',recordingId)))return fail('Narrators must be attached to a recording',400);
   if(workId&&!await recordExists(db,'works',workId))return fail('Book not found',404);
   if(recordingId&&!await recordExists(db,'audio_recordings',recordingId))return fail('Recording not found',404);
   const id=uuid(),details={id,personId,workId:workId||null,recordingId:recordingId||null,role};
   await db.batch([
    db.prepare('INSERT INTO contributions(id,person_id,work_id,recording_id,role_code) VALUES(?,?,?,?,?)')
     .bind(id,personId,workId||null,recordingId||null,role),
    audit(db,actor,'credit','contribution',id,details)
   ]);
   return json({id,saved:true},201);
  }
  return fail('Unknown catalogue operation',404);
 }catch(error){
  console.error('Dedicated catalogue admin request failed',error);
  return fail('The catalogue operation could not be completed',503);
 }
}
