import {syncSiteRole} from './admin-role.js';
import {bookDetailsAPI} from './book-details-api.js';
import {moderationAPI} from './moderation-api.js';
import {publicReviewAPI} from './public-review-api.js';
import {authConfigured,createAuth} from './auth.js';
import {memberAPI} from './member-api.js';
import {communityAPI} from './community-api.js';
interface D1Statement {bind(...values:(string|number|null)[]):D1Statement;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;run():Promise<unknown>;}
interface D1Database {prepare(query:string):D1Statement;}
interface Env {DB?:D1Database; BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string;ADMIN_EMAIL?:string;}
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
      const role=await syncSiteRole(env.DB!,{id:user.id,email:user.email,emailVerified:user.emailVerified},env.ADMIN_EMAIL);
      return json({member:{id:user.id,displayName:user.name,verified:user.emailVerified,role}});
    }
    if(url.pathname.startsWith('/api/member/'))return memberAPI(request,env);
    if(url.pathname.startsWith('/api/book/'))return bookDetailsAPI(request,env);
    if(url.pathname.startsWith('/api/moderation/'))return moderationAPI(request,env);
    if(url.pathname.startsWith('/api/public-reviews/'))return publicReviewAPI(request,env);
    if(['/api/discussions','/api/recommendations','/api/clubs','/api/challenges','/api/lists'].some(p=>url.pathname===p||url.pathname.startsWith(p+'/')))return communityAPI(request,env);
    if(request.method!=='GET') return json({error:'Write operations require verified member permissions and are not yet enabled'},503);
    if(url.pathname==='/api/health')return json({ok:true,database:env.DB?'bound':'not_configured',authentication:authConfigured(env as Parameters<typeof authConfigured>[0])?'configured':'not_configured'});
    if(!env.DB)return missing();
    try{
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')??30)||30,1),60);
      if(url.pathname==='/api/series'){
        const {results}=await env.DB.prepare(`SELECT s.id,s.title,s.description,
        (SELECT count(*) FROM series_works sw WHERE sw.series_id=s.id) AS bookCount
        FROM series s ORDER BY s.title LIMIT ?`).bind(limit).all();
        return json({items:results});
      }
      if(url.pathname.startsWith('/api/series/')){
        const id=decodeURIComponent(url.pathname.slice('/api/series/'.length));
        const series=await env.DB.prepare('SELECT id,title,description FROM series WHERE id=?').bind(id).first();
        if(!series)return json({error:'Series not found'},404);
        const {results}=await env.DB.prepare(`SELECT w.id,w.title,sw.sequence_number AS sequenceNumber,sw.label
        FROM series_works sw JOIN works w ON w.id=sw.work_id
        WHERE sw.series_id=? ORDER BY sw.sequence_number,w.title`).bind(id).all();
        return json({series,books:results});
      }
      if(url.pathname==='/api/people'){
        const q=(url.searchParams.get('q')??'').trim().slice(0,100);
        const role=url.searchParams.get('role');
        if(role&&!['author','narrator'].includes(role))return json({error:'Unknown contributor role'},400);
        const {results}=await env.DB.prepare(`SELECT p.id,p.display_name AS name,p.biography,
        CASE WHEN EXISTS(SELECT 1 FROM work_contributors wc WHERE wc.person_id=p.id AND wc.role='author') THEN 1 ELSE 0 END AS isAuthor,
        CASE WHEN EXISTS(SELECT 1 FROM edition_contributors ec WHERE ec.person_id=p.id AND ec.role='narrator') THEN 1 ELSE 0 END AS isNarrator
        FROM people p WHERE p.display_name LIKE ? ESCAPE '\\'
        AND (? IS NULL OR (?='author' AND EXISTS(SELECT 1 FROM work_contributors wc WHERE wc.person_id=p.id AND wc.role='author'))
        OR (?='narrator' AND EXISTS(SELECT 1 FROM edition_contributors ec WHERE ec.person_id=p.id AND ec.role='narrator')))
        ORDER BY p.display_name LIMIT ?`)
          .bind('%'+q.replace(/[\\%_]/g, '\\$&')+'%',role,role,role,limit).all();
        return json({items:results});
      }
      if(url.pathname.startsWith('/api/person/')){
        const id=decodeURIComponent(url.pathname.slice('/api/person/'.length));
        const person=await env.DB.prepare('SELECT id,display_name AS name,biography FROM people WHERE id=?').bind(id).first();
        if(!person)return json({error:'Person not found'},404);
        const {results:works}=await env.DB.prepare(`SELECT w.id,w.title,'author' AS contribution
         FROM works w JOIN work_contributors wc ON wc.work_id=w.id
         WHERE wc.person_id=? AND wc.role='author' ORDER BY w.title`).bind(id).all();
        const {results:recordings}=await env.DB.prepare(`SELECT e.id,e.format,w.id AS workId,w.title,'narrator' AS contribution
         FROM editions e JOIN edition_contributors ec ON ec.edition_id=e.id
         JOIN works w ON w.id=e.work_id WHERE ec.person_id=? AND ec.role='narrator' ORDER BY w.title`).bind(id).all();
        return json({person,works,recordings});
      }
      if(url.pathname==='/api/editions'){
        const workId=(url.searchParams.get('workId')??'').slice(0,80);
        if(!workId)return json({error:'workId required'},400);
        const {results}=await env.DB.prepare(`SELECT e.id,e.work_id AS workId,e.format,e.publisher,e.published_at AS publishedAt,
           e.language,e.isbn13,e.asin,e.page_count AS pageCount,
           e.duration_minutes AS durationMinutes,e.abridged,e.verification_state AS verificationState
           FROM editions e WHERE e.work_id=? ORDER BY e.format,e.published_at`).bind(workId).all();
        return json({items:results});
      }
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
