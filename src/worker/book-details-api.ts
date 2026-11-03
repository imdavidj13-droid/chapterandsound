/**
 * Canonical public work page. No provider lookups are made here:
 * the page only reads verified/shared D1 catalogue and public member reviews.
 */
interface Statement{bind(...values:(string|number|null)[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface DB{prepare(sql:string):Statement}
export interface BookDetailsEnv{DB?:DB}
const send=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'public,max-age=30','X-Content-Type-Options':'nosniff'}});
type Edition={id:string;format:string;publisher:string|null;publishedAt:string|null;language:string|null;pageCount:number|null;durationMinutes:number|null;abridged:number|null;isbn13:string|null;asin:string|null;verificationStatus:string;contributors?:{id:string;name:string;role:string}[]}
export async function bookDetailsAPI(request:Request,env:BookDetailsEnv):Promise<Response>{
 if(request.method!=='GET')return send({error:'Method not allowed'},405);
 if(!env.DB)return send({error:'Catalogue database not configured'},503);
 const id=decodeURIComponent(new URL(request.url).pathname.slice('/api/book/'.length));
 if(!id||id.length>100)return send({error:'Invalid book ID'},400);
 try{
  const db=env.DB;
  const book=await db.prepare(`SELECT w.id,w.title,w.subtitle,w.synopsis AS summary,
    w.first_published AS year,w.verification_status AS verificationStatus,
    (SELECT p.display_name FROM work_contributors wc JOIN people p ON p.id=wc.person_id
      WHERE wc.work_id=w.id AND wc.role='author' ORDER BY wc.ordinal LIMIT 1) AS author
    FROM works w WHERE w.id=?`).bind(id).first();
  if(!book)return send({error:'Book not found'},404);
  const {results:editions}=await db.prepare(`SELECT id,format,publisher,published_at AS publishedAt,
    language,page_count AS pageCount,duration_minutes AS durationMinutes,
    abridged,isbn13,asin,verification_status AS verificationStatus
    FROM editions WHERE work_id=? ORDER BY format,published_at,id LIMIT 200`).bind(id).all<Edition>();
  const {results:people}=await db.prepare(`SELECT ec.edition_id AS editionId,ec.role,p.id,p.display_name AS name
    FROM edition_contributors ec JOIN people p ON p.id=ec.person_id
    JOIN editions e ON e.id=ec.edition_id WHERE e.work_id=? ORDER BY ec.ordinal`).bind(id).all<{editionId:string;role:string;id:string;name:string}>();
  const contributorsByEdition=new Map<string,{id:string;name:string;role:string}[]>();
  for(const person of people){
   const list=contributorsByEdition.get(person.editionId)??[];
   list.push({id:person.id,name:person.name,role:person.role});
   contributorsByEdition.set(person.editionId,list);
  }
  const annotated=editions.map(e=>({...e,contributors:contributorsByEdition.get(e.id)??[]}));
  const {results:reviews}=await db.prepare(`SELECT r.id,r.title,r.body,r.spoilers,
    r.story_rating AS storyRating,r.narration_rating AS audioRating,r.published_at AS publishedAt,
    r.edition_id AS editionId,e.format,m.display_name AS authorName,m.handle AS authorHandle
    FROM reviews r JOIN members m ON m.id=r.member_id
    LEFT JOIN editions e ON e.id=r.edition_id
    WHERE r.book_id=? AND r.status='published' AND r.visibility='public'
    ORDER BY r.published_at DESC,r.id DESC LIMIT 100`).bind(id).all();
  // Count only the latest eligible rating by each distinct member, not every reread or format.
  const story=await db.prepare(`WITH ranked AS (
    SELECT member_id,story_rating,ROW_NUMBER() OVER (
      PARTITION BY member_id ORDER BY published_at DESC,id DESC
    ) AS rank FROM reviews WHERE book_id=? AND status='published' AND visibility='public'
      AND story_rating IS NOT NULL)
    SELECT COUNT(*) AS count, AVG(story_rating) AS average FROM ranked WHERE rank=1`).bind(id)
   .first<{count:number;average:number|null}>();
  const audio=await db.prepare(`WITH ranked AS (
    SELECT r.member_id,r.narration_rating,ROW_NUMBER() OVER (
      PARTITION BY r.member_id,r.edition_id ORDER BY r.published_at DESC,r.id DESC
    ) AS rank FROM reviews r JOIN editions e ON e.id=r.edition_id
    WHERE r.book_id=? AND r.status='published' AND r.visibility='public'
    AND e.format='audiobook' AND r.narration_rating IS NOT NULL)
    SELECT COUNT(*) AS count,AVG(narration_rating) AS average FROM ranked WHERE rank=1`).bind(id)
   .first<{count:number;average:number|null}>();
  return send({book,editions:annotated,reviews,
   ratings:{story:{count:story?.count??0,average:story?.average??null},
            narration:{count:audio?.count??0,average:audio?.average??null}}});
 }catch(e){console.error('Book detail API unavailable',e);return send({error:'Unable to load book information'},503)}
}
