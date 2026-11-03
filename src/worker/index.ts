interface D1Statement {bind(...values:(string|number|null)[]):D1Statement;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;}
interface D1Database {prepare(query:string):D1Statement;}
interface Env {DB?:D1Database;}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>json({error:'Cloud database is not configured',code:'DB_NOT_CONFIGURED'},503);
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return new Response('Not found',{status:404});
    if(request.method!=='GET') return json({error:'Write operations require verified member authentication. They are not enabled.'},503);
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
