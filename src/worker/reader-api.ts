/**
 * Public reader profile lookup. Only explicitly published reviews are visible.
 * Private books, notes, reading progress, email and preferences are never selected.
 */
interface Statement{bind(...values:(string|number|null)[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
interface DB{prepare(sql:string):Statement}
export interface ReaderEnv{DB?:DB}
const response=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'public,max-age=30','X-Content-Type-Options':'nosniff'}});
export async function readerAPI(request:Request,env:ReaderEnv):Promise<Response>{
 if(request.method!=='GET')return response({error:'Method not allowed'},405);
 if(!env.DB)return response({error:'Member database unavailable'},503);
 const raw=decodeURIComponent(new URL(request.url).pathname.slice('/api/reader/'.length));
 const handle=raw.replace(/^@/,'').toLowerCase();
 if(!/^[a-z][a-z0-9_]{2,29}$/.test(handle))return response({error:'Invalid username'},400);
 try{
  const reader=await env.DB.prepare("SELECT id,handle,display_name AS displayName,bio FROM members WHERE handle=? COLLATE NOCASE AND deleted_at IS NULL")
    .bind(handle).first<{id:string;handle:string;displayName:string;bio:string|null}>();
  if(!reader)return response({error:'Reader not found'},404);
  const {results}=await env.DB.prepare(`SELECT r.id,r.title,r.body,r.story_rating AS storyRating,
    r.narration_rating AS audioRating,r.spoilers,r.published_at AS publishedAt,
    w.id AS bookId,w.title AS bookTitle,e.format
    FROM reviews r JOIN works w ON w.id=r.book_id
    LEFT JOIN editions e ON e.id=r.edition_id
    WHERE r.member_id=? AND r.status='published' AND r.visibility='public'
    ORDER BY r.published_at DESC,r.id DESC LIMIT 60`).bind(reader.id).all();
  return response({reader:{handle:reader.handle,displayName:'@'+reader.handle,bio:reader.bio},reviews:results});
 }catch(e){console.error('Reader profile unavailable',e);return response({error:'Reader profile unavailable'},503)}
}
