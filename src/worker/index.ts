import {authConfigured,createAuth} from './auth.js';
interface D1Statement {bind(...values:(string|number|null)[]):D1Statement;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;run():Promise<unknown>;}
interface D1Database {prepare(query:string):D1Statement;}
interface Env {DB?:D1Database; BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string;}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>json({error:'Cloud database is not configured',code:'DB_NOT_CONFIGURED'},503);
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return new Response('Not found',{status:404});
    if(url.pathname.startsWith('/api/auth/')){
      if(!authConfigured(env as Parameters<typeof authConfigured>[0]))return json({error:'Secure authentication and mail delivery are not yet configured'},503);
      return createAuth(env as unknown as Parameters<typeof createAuth>[0]).handler(request);
    }
    if(url.pathname==='/api/me'){
      if(!authConfigured(env as Parameters<typeof authConfigured>[0]))return missing();
      const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
      const session=await auth.api.getSession({headers:request.headers});
      if(!session)return json({member:null});
      const user=session.user;
      // Only the authenticated Better Auth session may determine the member ID.
      await env.DB!.prepare('INSERT OR IGNORE INTO members(id,email_normalized,display_name,email_verified_at) VALUES(?,?,?,?)')
       .bind(user.id,user.email.toLowerCase(),user.name,user.emailVerified?new Date().toISOString():null).run();
      return json({member:{id:user.id,displayName:user.name,verified:user.emailVerified}});
    }
    if(request.method!=='GET') return json({error:'Write operations require verified member permissions and are not yet enabled'},503);
    if(url.pathname==='/api/health')return json({ok:true,database:env.DB?'bound':'not_configured'});
    if(!env.DB)return missing();
    try{
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')??30)||30,1),60);
      if(url.pathname==='/api/books'){
        const search=(url.searchParams.get('q')??'').trim().slice(0,120);
        const {results}=search
          ?await env.DB.prepare(`SELECT w.id,w.title,w.subtitle,w.synopsis AS summary,w.first_published AS year,
          (SELECT p.display_name FROM work_contributors wc JOIN people p ON p.id=wc.person_id WHERE wc.work_id=w.id AND wc.role='author' ORDER BY wc.ordinal LIMIT 1) AS author
          FROM works w WHERE w.title LIKE ? ESCAPE '\\' ORDER BY w.title LIMIT ?`)
            .bind('%'+search.replace(/[\\%_]/g,'\\$&')+'%',limit).all()
          :await env.DB.prepare(`SELECT w.id,w.title,w.subtitle,w.synopsis AS summary,w.first_published AS year,
          (SELECT p.display_name FROM work_contributors wc JOIN people p ON p.id=wc.person_id WHERE wc.work_id=w.id AND wc.role='author' ORDER BY wc.ordinal LIMIT 1) AS author
          FROM works w ORDER BY w.title LIMIT ?`).bind(limit).all();
        return json({items:results});
      }
      if(url.pathname==='/api/reviews'){
        const {results}=await env.DB.prepare(`SELECT r.id,r.title,r.body,r.story_rating AS storyRating,
          r.narration_rating AS audioRating,r.spoilers,r.created_at AS createdAt,r.book_id AS bookId,
          w.title AS bookTitle,m.display_name AS authorName,e.format
          FROM reviews r JOIN works w ON w.id=r.book_id JOIN members m ON m.id=r.member_id
          LEFT JOIN editions e ON e.id=r.edition_id
          WHERE r.status='published' AND r.visibility='public'
          ORDER BY r.created_at DESC LIMIT ?`).bind(limit).all();
        return json({items:results});
      }
      return json({error:'Unknown API route'},404);
    }catch(e){console.error('API error',e);return json({error:'The catalogue service is temporarily unavailable'},503);}
  }
};
