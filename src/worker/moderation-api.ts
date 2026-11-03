import {authConfigured,createAuth} from './auth.js';

interface Statement{bind(...values:(string|number|null)[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}
interface Database{prepare(sql:string):Statement}
export interface ModerationEnv{DB?:Database;BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string}
const send=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(error:string,status=400)=>send({error},status);
export async function moderationAPI(request:Request,env:ModerationEnv):Promise<Response>{
 if(!env.DB||!authConfigured(env as Parameters<typeof authConfigured>[0]))return fail('Moderation service is not configured',503);
 const db=env.DB;const url=new URL(request.url);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return fail('Cross-origin change denied',403);
 const session=await createAuth(env as unknown as Parameters<typeof createAuth>[0]).api.getSession({headers:request.headers});
 if(!session?.user.emailVerified)return fail('Verified sign-in required',401);
 const moderator=await db.prepare("SELECT role FROM site_roles WHERE member_id=? AND role IN ('admin','moderator')").bind(session.user.id).first<{role:string}>();
 if(!moderator)return fail('Administrator or moderator permission required',403);
 const parts=url.pathname.split('/').filter(Boolean);const reportId=parts[2];
 try{
  if(url.pathname==='/api/moderation/reports'&&request.method==='GET'){
   const {results}=await db.prepare(`SELECT r.id,r.content_type AS contentType,r.content_id AS contentId,
     r.reason,r.state,r.created_at AS createdAt,reporter.display_name AS reporterName,
     rev.title AS reviewTitle,w.title AS bookTitle
     FROM content_reports r JOIN members reporter ON reporter.id=r.reporter_id
     LEFT JOIN reviews rev ON r.content_type='review' AND rev.id=r.content_id
     LEFT JOIN works w ON w.id=rev.book_id
     WHERE r.state='open' ORDER BY r.created_at ASC LIMIT 100`).all();
   return send({items:results});
  }
  if(parts.length===4&&parts[0]==='api'&&parts[1]==='moderation'&&parts[2]==='reports'&&request.method==='PATCH'){
   const id=parts[3]!;
   if(id.length>100)return fail('Invalid report');
   const body:unknown=await request.json();
   if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid request');
   const action=(body as {action?:unknown}).action;
   if(action!=='dismiss'&&action!=='hide_review')return fail('Unsupported moderation action');
   const reason=(body as {reason?:unknown}).reason;
   if(reason!==undefined&&(typeof reason!=='string'||reason.length>1000))return fail('Invalid moderation note');
   const report=await db.prepare("SELECT id,content_type AS contentType,content_id AS contentId,state FROM content_reports WHERE id=?")
     .bind(id).first<{id:string;contentType:string;contentId:string;state:string}>();
   if(!report)return fail('Report not found',404);
   if(report.state!=='open')return fail('This report has already been handled',409);
   if(action==='hide_review'){
     if(report.contentType!=='review')return fail('Only reported reviews can be hidden by this action');
     const review=await db.prepare("SELECT id FROM reviews WHERE id=? AND status='published'").bind(report.contentId).first();
     if(!review)return fail('Review is no longer published',409);
     await db.prepare("UPDATE reviews SET status='removed',visibility='private',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='published'")
       .bind(report.contentId).run();
   }
   await db.prepare("UPDATE content_reports SET state=? WHERE id=? AND state='open'")
     .bind(action==='dismiss'?'dismissed':'resolved',id).run();
   await db.prepare('INSERT INTO moderation_actions(id,actor_id,report_id,content_type,content_id,action,reason) VALUES(?,?,?,?,?,?,?)')
     .bind(crypto.randomUUID(),session.user.id,id,report.contentType,report.contentId,action,typeof reason==='string'?reason.trim():null).run();
   return send({handled:true,action});
  }
  return fail('Moderation route not found',404);
 }catch(e){console.error('Moderation failure',e);return fail('Moderation operation failed',503)}
}
