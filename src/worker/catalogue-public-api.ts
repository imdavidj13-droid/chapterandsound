/** Public, read-only adapter for the dedicated BOOK_DB catalogue.
 * It never joins the application member DB. Existing member book IDs and
 * review relationships remain valid until a separately audited ID crosswalk.
 */
type Param=string|number|null;
interface Statement{bind(...values:Param[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface Database{prepare(sql:string):Statement}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'public,max-age=20','X-Content-Type-Options':'nosniff'}});
const str=(v:string|null,max=120)=>(v||'').trim().slice(0,max);
const limit=(s:string|null)=>Math.min(Math.max(Number(s)||30,1),60);
const idOk=(s:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(s);
function image(kind:'work'|'edition'|'person',idColumn:string,role:string){
 return `(SELECT '/api/catalogue-media/'||l.asset_id FROM media_links l
 WHERE l.entity_kind='${kind}' AND l.entity_id=${idColumn} AND l.role='${role}' AND l.is_primary=1 LIMIT 1)`;
}
function synopsis(){return `(SELECT t.body FROM text_content t
 WHERE t.entity_kind='work' AND t.entity_id=w.id AND t.content_type='synopsis'
 AND t.visibility='public' ORDER BY t.rowid DESC LIMIT 1)`}
export async function publicCatalogueAPI(request:Request,db:Database|undefined):Promise<Response>{
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!db)return json({error:'Catalogue is not connected'},503);
 const u=new URL(request.url),path=u.pathname.slice('/api/catalogue-public/'.length);
 const q=str(u.searchParams.get('q')),l=limit(u.searchParams.get('limit'));
 try{
 if(path==='books'){
   const format=str(u.searchParams.get('format'))||'all';
   if(!['all','paperback','hardback','ebook','audiobook'].includes(format))return json({error:'Invalid format'},400);
   const {results}=await db.prepare(`SELECT w.id,w.canonical_title AS title,NULL AS subtitle,
    ${image('work','w.id','representative_cover')} AS coverUrl,
    ${synopsis()} AS summary,w.first_publication_date AS year,
    (SELECT p.preferred_name FROM contributions c JOIN people p ON p.id=c.person_id
      WHERE c.work_id=w.id AND c.role_code IN ('author','coauthor') ORDER BY c.credit_order,c.id LIMIT 1) AS author,
    (SELECT GROUP_CONCAT(DISTINCT e.format) FROM editions e WHERE e.work_id=w.id) AS editions
    FROM works w WHERE w.status IN ('published','verified')
    AND (?='' OR instr(lower(w.canonical_title),lower(?))>0 OR EXISTS(
      SELECT 1 FROM contributions c JOIN people p ON p.id=c.person_id
      WHERE c.work_id=w.id AND c.role_code IN ('author','coauthor')
      AND instr(lower(p.preferred_name),lower(?))>0))
    AND (?='all' OR EXISTS(SELECT 1 FROM editions e WHERE e.work_id=w.id AND e.format=?))
    ORDER BY w.canonical_title,w.id LIMIT ?`).bind(q,q,q,format,format,l).all<{
     id:string;title:string;subtitle:null;summary:string|null;year:string|null;author:string|null;editions:string|null
    }>();
   return json({items:results.map(x=>({...x,year:x.year?Number(x.year.slice(0,4)):null,formats:x.editions?x.editions.split(','):[],catalogueSource:'BOOK_DB'}))});
 }
 if(path==='people'){
  const role=str(u.searchParams.get('role'));
  if(role&&!['author','narrator'].includes(role))return json({error:'Unknown role'},400);
  const {results}=await db.prepare(`SELECT p.id,p.preferred_name AS name,p.bio AS biography,
   ${image('person','p.id','portrait')} AS portraitUrl,
   CASE WHEN EXISTS(SELECT 1 FROM contributions c WHERE c.person_id=p.id AND c.role_code IN ('author','coauthor')) THEN 1 ELSE 0 END AS isAuthor,
   CASE WHEN EXISTS(SELECT 1 FROM contributions c WHERE c.person_id=p.id AND c.role_code='narrator') THEN 1 ELSE 0 END AS isNarrator
   FROM people p WHERE p.identity_status NOT IN ('merged','suppressed')
   AND (?='' OR instr(lower(p.preferred_name),lower(?))>0)
   AND (?='' OR (?='author' AND (
      EXISTS(SELECT 1 FROM contributions c WHERE c.person_id=p.id AND c.role_code IN ('author','coauthor'))
      OR NOT EXISTS(SELECT 1 FROM contributions c WHERE c.person_id=p.id AND c.role_code IN ('narrator','cast'))
     ))
                  OR (?='narrator' AND EXISTS(SELECT 1 FROM contributions c WHERE c.person_id=p.id AND c.role_code='narrator')))
   ORDER BY p.preferred_name LIMIT ?`).bind(q,q,role,role,role,l).all();
  return json({items:results});
 }
 if(path.startsWith('person/')){
  const id=path.slice(7);if(!idOk(id))return json({error:'Invalid ID'},400);
  const person=await db.prepare(`SELECT p.id,p.preferred_name AS name,p.bio AS biography,
     ${image('person','p.id','portrait')} AS portraitUrl FROM people p WHERE p.id=? AND p.identity_status NOT IN ('merged','suppressed')`).bind(id).first();
  if(!person)return json({error:'Person not found'},404);
  const {results:works}=await db.prepare(`SELECT w.id,w.canonical_title AS title,'author' AS contribution FROM works w
   JOIN contributions c ON c.work_id=w.id WHERE c.person_id=? AND c.role_code IN ('author','coauthor')
   AND w.status IN ('published','verified') ORDER BY w.canonical_title`).bind(id).all();
  const {results:recordings}=await db.prepare(`SELECT r.id,r.work_id AS workId,w.canonical_title AS title,'narrator' AS contribution
   FROM audio_recordings r JOIN contributions c ON c.recording_id=r.id JOIN works w ON w.id=r.work_id
   WHERE c.person_id=? AND c.role_code='narrator' AND w.status IN ('published','verified')
   ORDER BY w.canonical_title`).bind(id).all();
  return json({person,works,recordings});
 }
 if(path==='series'){
  const {results}=await db.prepare(`SELECT s.id,s.title,s.description,
   (SELECT COUNT(*) FROM series_memberships sm WHERE sm.series_id=s.id) AS bookCount
   FROM series s ORDER BY s.title LIMIT ?`).bind(l).all();
  return json({items:results});
 }
 if(path.startsWith('series/')){
  const id=path.slice(7);if(!idOk(id))return json({error:'Invalid ID'},400);
  const series=await db.prepare('SELECT id,title,description FROM series WHERE id=?').bind(id).first();
  if(!series)return json({error:'Series not found'},404);
  const {results:books}=await db.prepare(`SELECT w.id,w.canonical_title AS title,sm.sequence_decimal AS sequenceNumber,
    sm.display_number AS label FROM series_memberships sm JOIN works w ON w.id=sm.work_id
    WHERE sm.series_id=? AND w.status IN ('published','verified') ORDER BY sm.sequence_decimal,w.canonical_title`).bind(id).all();
  return json({series,books});
 }
 if(path.startsWith('book/')){
  const id=path.slice(5);if(!idOk(id))return json({error:'Invalid ID'},400);
  const book=await db.prepare(`SELECT w.id,w.canonical_title AS title,NULL AS subtitle,
    ${image('work','w.id','representative_cover')} AS coverUrl,
    ${synopsis()} AS summary,w.first_publication_date AS year,w.status AS verificationStatus,
    (SELECT p.preferred_name FROM contributions c JOIN people p ON p.id=c.person_id
     WHERE c.work_id=w.id AND c.role_code IN ('author','coauthor') ORDER BY c.credit_order LIMIT 1) AS author
    FROM works w WHERE w.id=? AND w.status IN ('published','verified')`).bind(id).first();
  if(!book)return json({error:'Book not found'},404);
  const {results:editions}=await db.prepare(`SELECT e.id,e.format,
    ${image('edition','e.id','front_cover')} AS coverUrl,
    (SELECT o.name FROM publication_events p JOIN organisations o ON o.id=p.publisher_id WHERE p.edition_id=e.id ORDER BY p.rowid DESC LIMIT 1) AS publisher,
    (SELECT p.date_value FROM publication_events p WHERE p.edition_id=e.id AND p.event_type='released' ORDER BY p.rowid DESC LIMIT 1) AS publishedAt,
    e.language,e.page_count AS pageCount,
    (SELECT r.duration_seconds/60 FROM edition_recordings er JOIN audio_recordings r ON r.id=er.recording_id WHERE er.edition_id=e.id ORDER BY er.sequence LIMIT 1) AS durationMinutes,
    NULL AS abridged,
    (SELECT i.normalized_value FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id WHERE i.entity_kind='edition' AND i.entity_id=e.id AND s.code='ISBN13' LIMIT 1) AS isbn13,
    (SELECT i.normalized_value FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id WHERE i.entity_kind='edition' AND i.entity_id=e.id AND s.code='ASIN' LIMIT 1) AS asin,
    e.verification_status AS verificationStatus
    FROM editions e WHERE e.work_id=? ORDER BY e.created_at LIMIT 200`).bind(id).all<Record<string,unknown>>();
  return json({book,editions:editions.map(x=>({...x,contributors:[]})),reviews:[],ratings:{story:{count:0,average:null},narrationByEdition:[]},catalogueSource:'BOOK_DB'});
 }
 return json({error:'Unknown catalogue route'},404);
 }catch(error){console.error('Public BOOK_DB catalogue read failed',error);return json({error:'Catalogue read unavailable'},503)}
}
