/**
 * Public review endpoints. Only deliberately published, public reviews are readable.
 * Helpful votes and reports require verified Better Auth sessions.
 */
import {authConfigured,createAuth} from './auth.js';

interface Statement {bind(...values:(string|number|null)[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}
interface Database {prepare(sql:string):Statement}
export interface PublicReviewEnv {DB?:Database;BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string}
const answer=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const error=(message:string,status=400)=>answer({error:message},status);
async function viewerId(request:Request,env:PublicReviewEnv):Promise<string|null>{
  if(!authConfigured(env as Parameters<typeof authConfigured>[0]))return null;
  const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
  const session=await auth.api.getSession({headers:request.headers});
  if(!session?.user.emailVerified)return null;
  return session.user.id;
}
async function reviewExists(db:Database,id:string):Promise<boolean>{
  const item=await db.prepare("SELECT id FROM reviews WHERE id=? AND status='published' AND visibility='public'").bind(id).first();
  return Boolean(item);
}
export async function publicReviewAPI(request:Request,env:PublicReviewEnv):Promise<Response>{
  if(!env.DB)return error('Review database is not configured',503);
  const db=env.DB;
  const url=new URL(request.url);
  const pieces=url.pathname.split('/').filter(Boolean);
  if(pieces.length<3||pieces[0]!=='api'||pieces[1]!=='public-reviews')return error('Not found',404);
  const id=pieces[2]!;
  if(id.length>100)return error('Invalid review ID');
  const action=pieces[3];
  const method=request.method;
  if(!['GET','POST','DELETE'].includes(method))return error('Method not allowed',405);
  if(method!=='GET'&&request.headers.get('Origin')!==url.origin)return error('Cross-origin operation denied',403);
  const viewer=await viewerId(request,env);
  if(method!=='GET'&&!viewer)return error('A verified member account is required',401);
  try{
    if(!action&&method==='GET'){
      const item=await db.prepare(`SELECT r.id,r.title,r.body,r.story_rating AS storyRating,
        r.narration_rating AS audioRating,r.spoilers,r.published_at AS publishedAt,
        r.book_id AS bookId,r.edition_id AS editionId,w.title AS bookTitle,
        e.format,m.id AS authorId,m.handle AS authorHandle,m.display_name AS authorName,
        (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id=r.id) AS helpfulCount
        FROM reviews r JOIN works w ON w.id=r.book_id
        JOIN members m ON m.id=r.member_id LEFT JOIN editions e ON e.id=r.edition_id
        WHERE r.id=? AND r.status='published' AND r.visibility='public'`).bind(id).first();
      if(!item)return error('Review not found',404);
      let viewerHelpful=false;
      if(viewer){
        viewerHelpful=Boolean(await db.prepare('SELECT 1 FROM review_helpful WHERE review_id=? AND member_id=?').bind(id,viewer).first());
      }
      return answer({item,viewerHelpful});
    }
    if(action==='helpful'){
      if(method!=='POST'&&method!=='DELETE')return error('Method not allowed',405);
      if(!await reviewExists(db,id))return error('Review not found',404);
      if(method==='POST'){
        await db.prepare('INSERT OR IGNORE INTO review_helpful(review_id,member_id) VALUES(?,?)').bind(id,viewer!).run();
      }else{
        await db.prepare('DELETE FROM review_helpful WHERE review_id=? AND member_id=?').bind(id,viewer!).run();
      }
      const result=await db.prepare('SELECT COUNT(*) AS count FROM review_helpful WHERE review_id=?').bind(id).first<{count:number}>();
      return answer({helpful:method==='POST',helpfulCount:result?.count??0});
    }
    if(action==='report'&&method==='POST'){
      if(!await reviewExists(db,id))return error('Review not found',404);
      const length=Number(request.headers.get('Content-Length')??0);
      if(length>4000)return error('Report exceeds size limit',413);
      const data:unknown=await request.json();
      if(!data||typeof data!=='object'||Array.isArray(data))return error('Invalid report');
      const reason=(data as {reason?:unknown}).reason;
      if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)return error('Provide a reason between 10 and 1000 characters');
      await db.prepare(`INSERT OR IGNORE INTO content_reports(id,reporter_id,content_type,content_id,reason)
        VALUES(?,?,'review',?,?)`).bind(crypto.randomUUID(),viewer!,id,reason.trim()).run();
      return answer({reported:true});
    }
    return error('Not found',404);
  }catch(e){
    console.error('Public review interaction failed',e);
    if(e instanceof SyntaxError)return error('Invalid JSON');
    return error('Review operation could not be completed',503);
  }
}
