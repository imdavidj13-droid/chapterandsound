import {cataloguePublicImage} from './catalogue-media-api.js';
import type {CatalogueImageBucket} from './catalogue-media-api.js';
import {publicCatalogueAPI} from './catalogue-public-api.js';
import {catalogueAdminAPI} from './catalogue-admin-api.js';
import {adminAPI} from './admin-api.js';
import {isVerificationDocumentNavigation,verifyEmailDocument,verificationResultPage} from './email-verification-flow.js';
import {readerAPI} from './reader-api.js';
import {syncSiteRole} from './admin-role.js';
import {bookDetailsAPI} from './book-details-api.js';
import {moderationAPI} from './moderation-api.js';
import {publicReviewAPI} from './public-review-api.js';
import {authConfigured,createAuth} from './auth.js';
import {memberAPI} from './member-api.js';
import {communityAPI} from './community-api.js';
interface D1Statement {bind(...values:(string|number|null)[]):D1Statement;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>;}
interface D1Database {prepare(query:string):D1Statement;batch(statements:D1Statement[]):Promise<unknown[]>;}
interface Env {DB?:D1Database; BOOK_DB?:D1Database; CATALOGUE_MEDIA?:CatalogueImageBucket; BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string;ADMIN_EMAIL?:string;SIGNUP_MODE?:string;}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>json({error:'Cloud database is not configured',code:'DB_NOT_CONFIGURED'},503);
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return new Response('Not found',{status:404});
    if(url.pathname==='/api/auth/sign-up/email'&&request.method==='POST'){
      const data:unknown=await request.clone().json().catch(()=>null);
      const fields=data&&typeof data==='object'&&!Array.isArray(data)?data as {email?:unknown;name?:unknown;username?:unknown}:null;
      const email=fields?.email;
      if(env.SIGNUP_MODE!=='public'&&(typeof email!=='string'||!env.ADMIN_EMAIL||email.trim().toLowerCase()!==env.ADMIN_EMAIL.trim().toLowerCase())){
        return json({error:'Public signup is not open yet. The administrator is completing verification.'},403);
      }
      const handle=fields?.username;
      if(typeof handle!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(handle)||fields?.name!==handle){
        return json({error:'Choose a username of 3–30 letters, numbers or underscores, starting with a letter.'},400);
      }
    }
    if(url.pathname==='/api/auth/verification-result'&&request.method==='GET'){
      let verified=false;
      if(authConfigured(env as Parameters<typeof authConfigured>[0])){
        try{
          const session=await createAuth(env as unknown as Parameters<typeof createAuth>[0]).api.getSession({headers:request.headers});
          verified=session?.user.emailVerified===true;
        }catch{verified=false;}
      }
      return verificationResultPage(request,verified);
    }
    if(isVerificationDocumentNavigation(request)){
      if(!authConfigured(env as Parameters<typeof authConfigured>[0]))return json({error:'Authentication unavailable'},503);
      return verifyEmailDocument(request,req=>createAuth(env as unknown as Parameters<typeof createAuth>[0]).handler(req));
    }
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
      const handle=(user as typeof user & {username?:string|null}).username?.toLowerCase()??null;
      await env.DB!.prepare('INSERT OR IGNORE INTO members(id,email_normalized,display_name,handle,email_verified_at) VALUES(?,?,?,?,?)')
       .bind(user.id,user.email.toLowerCase(),handle?'@'+handle:user.name,handle,user.emailVerified?new Date().toISOString():null).run();
      if(handle)await env.DB!.prepare("UPDATE members SET handle=?,display_name=? WHERE id=? AND (handle IS NULL OR handle=?)")
        .bind(handle,'@'+handle,user.id,handle).run();
      const role=await syncSiteRole(env.DB!,{id:user.id,email:user.email,emailVerified:user.emailVerified},env.ADMIN_EMAIL);
      return json({member:{id:user.id,displayName:handle?'@'+handle:user.name,handle,verified:user.emailVerified,role}});
    }
    if(url.pathname.startsWith('/api/member/'))return memberAPI(request,env);
    if(url.pathname.startsWith('/api/book/')){
      // BOOK_DB owns catalogue metadata; DB continues to own reader reviews.
      // Both use the unchanged work ID, so no review or shelf is relinked here.
      const legacy=await bookDetailsAPI(request,env);
      if(!env.BOOK_DB)return legacy;
      const id=decodeURIComponent(url.pathname.slice('/api/book/'.length));
      const canonical=await publicCatalogueAPI(
        new Request(new URL('/api/catalogue-public/book/'+encodeURIComponent(id),url.origin)),env.BOOK_DB);
      if(!canonical.ok)return legacy;
      if(!legacy.ok)return canonical;
      const canonicalData=await canonical.json() as {
       book:Record<string,unknown>;editions:Array<{id:string}&Record<string,unknown>>;
       reviews:unknown[];ratings:unknown;
      };
      const legacyData=await legacy.json() as {
       book:Record<string,unknown>;editions:Array<{id:string}&Record<string,unknown>>;
       reviews:unknown[];ratings:unknown;
      };
      // Canonical attributes win; legacy reviews and their ratings are retained.
      const oldEditions=new Map(legacyData.editions.map(e=>[e.id,e]));
      const editions=canonicalData.editions.map(e=>({...oldEditions.get(e.id),...e}));
      return json({...canonicalData,book:{...legacyData.book,...canonicalData.book},
       editions,reviews:legacyData.reviews,ratings:legacyData.ratings});
    }
    if(url.pathname.startsWith('/api/reader/'))return readerAPI(request,env);
    if(url.pathname.startsWith('/api/moderation/'))return moderationAPI(request,env);
    if(url.pathname.startsWith('/api/catalogue-admin/'))return catalogueAdminAPI(request,env);
    if(url.pathname.startsWith('/api/catalogue-public/'))return publicCatalogueAPI(request,env.BOOK_DB);
    if(url.pathname.startsWith('/api/catalogue-media/'))return cataloguePublicImage(request,env.BOOK_DB,env.CATALOGUE_MEDIA);
    if(url.pathname.startsWith('/api/admin/'))return adminAPI(request,env);
    if(url.pathname.startsWith('/api/public-reviews/'))return publicReviewAPI(request,env);
    if(['/api/discussions','/api/recommendations','/api/clubs','/api/challenges','/api/lists'].some(p=>url.pathname===p||url.pathname.startsWith(p+'/')))return communityAPI(request,env);
    if(url.pathname==='/api/site-presentation'&&request.method==='GET'){
      if(!env.DB)return missing();
      try{
        const {results}=await env.DB.prepare("SELECT setting_key AS key, setting_json AS json FROM site_settings WHERE setting_key IN ('homepage_heading','homepage_intro','guest_default_theme')").all<{key:string;json:string}>();
        const parsed=new Map<string,string>();
        for(const item of results){
          try{
            const value:unknown=JSON.parse(item.json);
            if(typeof value==='string')parsed.set(item.key,value);
          }catch{/* Keep safe defaults for malformed existing settings. */}
        }
        return json({heading:parsed.get('homepage_heading')||'',intro:parsed.get('homepage_intro')||'',guestTheme:parsed.get('guest_default_theme')==='reading-room'?'reading-room':'editorial'});
      }catch(error){console.error('Public site presentation unavailable',error);return json({error:'Site settings unavailable'},503);}
    }
    if(request.method!=='GET') return json({error:'Write operations require verified member permissions and are not yet enabled'},503);
    if(url.pathname==='/api/health'){
      let schema:'ready'|'missing'|'unavailable'='missing';
      if(env.DB){
        try{
          const {results}=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user','members','site_roles')").all<{name:string}>();
          schema=['user','members','site_roles'].every(name=>results.some(r=>r.name===name))?'ready':'missing';
        }catch{schema='unavailable'}
      }
      return json({ok:true,database:env.DB?'bound':'not_configured',schema,authentication:authConfigured(env as Parameters<typeof authConfigured>[0])?'configured':'not_configured'});
    }
    if(!env.DB)return missing();
    try{
      const limit=Math.min(Math.max(Number(url.searchParams.get('limit')??30)||30,1),60);
      if(url.pathname==='/api/series'){
        const {results}=await env.DB.prepare(`SELECT s.id,s.title,s.description,
        (SELECT count(*) FROM series_works sw WHERE sw.series_id=s.id) AS bookCount
        FROM series s ORDER BY s.title LIMIT ?`).bind(limit).all();
        if(!env.BOOK_DB)return json({items:results});
        const more=await publicCatalogueAPI(new Request(new URL('/api/catalogue-public/series',url.origin)),env.BOOK_DB);
        if(!more.ok)return json({items:results});
        const extra=await more.json() as {items:unknown[]};
        const seen=new Set(results.map((x:unknown)=>(x as {id:string}).id));
        return json({items:[...results,...extra.items.filter((x:unknown)=>!seen.has((x as {id:string}).id))].slice(0,limit)});
      }
      if(url.pathname.startsWith('/api/series/')){
        const id=decodeURIComponent(url.pathname.slice('/api/series/'.length));
        const series=await env.DB.prepare('SELECT id,title,description FROM series WHERE id=?').bind(id).first();
        if(!series&&env.BOOK_DB)return publicCatalogueAPI(
          new Request(new URL('/api/catalogue-public/series/'+encodeURIComponent(id),url.origin)),env.BOOK_DB);
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
        if(!env.BOOK_DB)return json({items:results});
        const extraUrl=new URL('/api/catalogue-public/people',url.origin);
        extraUrl.searchParams.set('q',q);if(role)extraUrl.searchParams.set('role',role);
        extraUrl.searchParams.set('limit',String(limit));
        const extraResponse=await publicCatalogueAPI(new Request(extraUrl),env.BOOK_DB);
        if(!extraResponse.ok)return json({items:results});
        const extra=await extraResponse.json() as {items:({id:string;name:string})[]};
        // Do not hide distinct identities sharing a name: identical-name
        // cross-database identities need explicit resolution during migration.
        const ids=new Set(results.map((x:unknown)=>(x as {id:string}).id));
        return json({items:[...results,...extra.items.filter(x=>!ids.has(x.id))].slice(0,limit)});
      }
      if(url.pathname.startsWith('/api/person/')){
        const id=decodeURIComponent(url.pathname.slice('/api/person/'.length));
        const person=await env.DB.prepare('SELECT id,display_name AS name,biography FROM people WHERE id=?').bind(id).first();
        if(!person&&env.BOOK_DB)return publicCatalogueAPI(
          new Request(new URL('/api/catalogue-public/person/'+encodeURIComponent(id),url.origin)),env.BOOK_DB);
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
           e.duration_minutes AS durationMinutes,e.abridged,e.verification_status AS verificationState
           FROM editions e WHERE e.work_id=? ORDER BY e.format,e.published_at`).bind(workId).all();
        return json({items:results});
      }
      if(url.pathname==='/api/books'){
        const search=(url.searchParams.get('q')??'').trim().slice(0,120);
        const format=(url.searchParams.get('format')??'all').trim();
        const offset=Math.min(Math.max(Number(url.searchParams.get('offset')??0)||0,0),100000);
        if(!['all','paperback','hardback','ebook','audiobook'].includes(format))return json({error:'Invalid format filter'},400);
        const combinedLimit=env.BOOK_DB?Math.min(offset+limit,500):limit;
        const {results}=await env.DB.prepare(`SELECT w.id,w.title,w.subtitle,w.synopsis AS summary,w.first_published AS year,
          (SELECT p.display_name FROM work_contributors wc JOIN people p ON p.id=wc.person_id WHERE wc.work_id=w.id AND wc.role='author' ORDER BY wc.ordinal LIMIT 1) AS author,
          (SELECT GROUP_CONCAT(DISTINCT e.format) FROM editions e WHERE e.work_id=w.id) AS editionFormats
          FROM works w
          WHERE (?='' OR instr(lower(w.title),lower(?))>0 OR EXISTS(
            SELECT 1 FROM work_contributors wa JOIN people pa ON pa.id=wa.person_id
            WHERE wa.work_id=w.id AND wa.role='author' AND instr(lower(pa.display_name),lower(?))>0))
          AND (?='all' OR EXISTS(SELECT 1 FROM editions ef WHERE ef.work_id=w.id AND ef.format=?))
          ORDER BY w.title,w.id LIMIT ? OFFSET ?`)
          .bind(search,search,search,format,format,combinedLimit,env.BOOK_DB?0:offset).all<{
            id:string;title:string;subtitle:string|null;summary:string|null;year:number|null;author:string|null;editionFormats:string|null
          }>();
        const legacyItems=results.map(row=>({
          id:row.id,title:row.title,subtitle:row.subtitle,summary:row.summary,year:row.year,author:row.author,
          formats:row.editionFormats?row.editionFormats.split(','):[]
        }));
        if(!env.BOOK_DB)return json({items:legacyItems});
        const newUrl=new URL('/api/catalogue-public/books',url.origin);
        newUrl.searchParams.set('q',search);newUrl.searchParams.set('format',format);
        newUrl.searchParams.set('limit',String(combinedLimit));
        const newResponse=await publicCatalogueAPI(new Request(newUrl),env.BOOK_DB);
        if(!newResponse.ok)return json({items:legacyItems});
        const newBooks=await newResponse.json() as {items:{id:string}[]};
        const combined=new Map<string,(typeof legacyItems)[number]>();
        for(const item of legacyItems)combined.set(item.id,item);
        for(const item of newBooks.items){
         if(!combined.has(item.id))combined.set(item.id,item as (typeof legacyItems)[number]);
        }
        const sorted=[...combined.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
        return json({items:sorted.slice(offset,offset+limit)});
      }
      if(url.pathname==='/api/reviews'){
        const search=(url.searchParams.get('q')??'').trim().slice(0,120);
        const format=(url.searchParams.get('format')??'all').trim();
        const offset=Math.min(Math.max(Number(url.searchParams.get('offset')??0)||0,0),100000);
        if(!['all','paperback','hardback','ebook','audiobook'].includes(format))return json({error:'Invalid format filter'},400);
        const {results}=await env.DB.prepare(`SELECT r.id,r.title,r.body,r.story_rating AS storyRating,
          r.narration_rating AS audioRating,r.spoilers,r.created_at AS createdAt,r.book_id AS bookId,
          w.title AS bookTitle,m.display_name AS authorName,m.handle AS authorHandle,e.format
          FROM reviews r JOIN works w ON w.id=r.book_id JOIN members m ON m.id=r.member_id
          LEFT JOIN editions e ON e.id=r.edition_id
          WHERE r.status='published' AND r.visibility='public'
          AND (?='' OR instr(lower(COALESCE(r.title,'')),lower(?))>0
             OR instr(lower(w.title),lower(?))>0 OR instr(lower(COALESCE(m.handle,m.display_name)),lower(?))>0)
          AND (?='all' OR e.format=?)
          ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`)
          .bind(search,search,search,search,format,format,limit,offset).all();
        return json({items:results});
      }
      return json({error:'Unknown API route'},404);
    }catch(e){console.error('API error',e);return json({error:'The catalogue service is temporarily unavailable'},503);}
  }
};
