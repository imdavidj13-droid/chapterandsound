import {authConfigured,createAuth} from './auth.js';
import {isVerifiedSiteOwner} from './admin-role.js';

interface Statement{
 bind(...values:(string|number|null)[]):Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<unknown>;
}
interface DB{prepare(sql:string):Statement}
export interface AdminEnv{
 DB?:DB;BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;
 MAIL_FROM?:string;ADMIN_EMAIL?:string;SIGNUP_MODE?:string;
}
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(error:string,status=400)=>respond({error},status);
const list=async<T>(db:DB,sql:string,...args:(string|number|null)[])=>{
 const {results}=await db.prepare(sql).bind(...args).all<T>();return results;
};
const value=(x:unknown,max=5000)=>typeof x==='string'?x.trim().slice(0,max):'';
const id=()=>crypto.randomUUID();
function pageSize(url:URL){return Math.min(Math.max(Number(url.searchParams.get('limit')||40)||40,1),100)}
function pageOffset(url:URL){return Math.min(Math.max(Number(url.searchParams.get('offset')||0)||0,0),100000)}
function acceptedBody(raw:unknown):Record<string,unknown>|null{
 return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
}
async function audit(db:DB,actor:string,action:string,entityType:string,entityId:string,before:unknown,after:unknown,reason=''){
 await db.prepare('INSERT INTO admin_audit_log(id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id(),actor,action,entityType,entityId,before==null?null:JSON.stringify(before),after==null?null:JSON.stringify(after),reason||null).run();
}
export async function adminAPI(request:Request,env:AdminEnv):Promise<Response>{
 if(!env.DB||!authConfigured(env as Parameters<typeof authConfigured>[0]))return fail('Administration backend is unavailable',503);
 const url=new URL(request.url),db=env.DB;
 const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
 const session=await auth.api.getSession({headers:request.headers}).catch(()=>null);
 if(!session?.user.emailVerified)return fail('Verified administrator sign-in required',401);
 if(!isVerifiedSiteOwner(session.user,env.ADMIN_EMAIL))return fail('Site administrator permission required',403);
 const assigned=await db.prepare("SELECT role FROM site_roles WHERE member_id=? AND role='admin'").bind(session.user.id).first<{role:string}>();
 if(!assigned)return fail('Site administrator role has not been granted',403);
 if(!['GET','POST','PATCH'].includes(request.method))return fail('Method not permitted',405);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return fail('Cross-origin admin write rejected',403);
 const part=url.pathname.slice('/api/admin/'.length).split('/').filter(Boolean);
 const section=part[0]||'',recordId=part[1]||'';
 const limit=pageSize(url),offset=pageOffset(url);
 try{
  if(request.method==='GET'){
   if(section==='overview'){
    const sql=`SELECT
      (SELECT COUNT(*) FROM members WHERE deleted_at IS NULL) AS members,
      (SELECT COUNT(*) FROM "user" WHERE emailVerified=1) AS verifiedMembers,
      (SELECT COUNT(*) FROM works) AS books,
      (SELECT COUNT(*) FROM editions) AS editions,
      (SELECT COUNT(*) FROM people) AS contributors,
      (SELECT COUNT(*) FROM reviews WHERE status='published' AND visibility='public') AS publishedReviews,
      (SELECT COUNT(*) FROM content_reports WHERE state='open') AS openReports,
      (SELECT COUNT(*) FROM discussions WHERE state='open') AS discussions,
      (SELECT COUNT(*) FROM clubs) AS clubs,
      (SELECT COUNT(*) FROM challenges) AS challenges,
      (SELECT COUNT(*) FROM missing_book_requests WHERE state='pending') AS missingRequests`;
    const counts=await db.prepare(sql).first();
    return respond({counts,environment:{signupMode:env.SIGNUP_MODE==='public'?'public':'owner_only',mailConfigured:Boolean(env.MAIL_API_KEY),origin:env.PUBLIC_ORIGIN}});
   }
   if(section==='members'){
    const query=value(url.searchParams.get('q'),100);
    const items=await list(db,`SELECT m.id,m.handle,m.display_name AS displayName,
      m.created_at AS joinedAt,m.deleted_at AS deletedAt,
      CASE WHEN u.emailVerified=1 THEN 1 ELSE 0 END AS verified,
      COALESCE(sr.role,'member') AS role,
      (SELECT COUNT(*) FROM reading_experiences re WHERE re.member_id=m.id) AS shelfCount,
      (SELECT COUNT(*) FROM reviews r WHERE r.member_id=m.id AND r.status='published' AND r.visibility='public') AS publicReviews
      FROM members m LEFT JOIN "user" u ON u.id=m.id
      LEFT JOIN site_roles sr ON sr.member_id=m.id
      WHERE (?='' OR m.handle LIKE ? OR m.display_name LIKE ?)
      ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`,query,'%'+query+'%','%'+query+'%',limit,offset);
    return respond({items});
   }
   if(section==='books'){
    const q=value(url.searchParams.get('q'),100);
    const items=await list(db,`SELECT w.id,w.title,w.subtitle,w.first_published AS firstPublished,
      w.verification_status AS verificationStatus,w.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM editions e WHERE e.work_id=w.id) AS editionCount,
      (SELECT GROUP_CONCAT(p.display_name,', ') FROM work_contributors wc JOIN people p ON p.id=wc.person_id WHERE wc.work_id=w.id AND wc.role='author') AS authors
      FROM works w WHERE (?='' OR w.title LIKE ?) ORDER BY w.updated_at DESC,w.title LIMIT ? OFFSET ?`,q,'%'+q+'%',limit,offset);
    return respond({items});
   }
   if(section==='editions'){
    const q=value(url.searchParams.get('q'),100);
    const items=await list(db,`SELECT e.id,e.work_id AS workId,w.title AS bookTitle,e.format,e.publisher,e.isbn13,e.language,e.page_count AS pageCount,
      e.duration_minutes AS durationMinutes,e.verification_status AS verificationStatus
      FROM editions e JOIN works w ON w.id=e.work_id
      WHERE (?='' OR w.title LIKE ? OR e.isbn13 LIKE ?) ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,q,'%'+q+'%','%'+q+'%',limit,offset);
    return respond({items});
   }
   if(section==='people'){
    const q=value(url.searchParams.get('q'),100);
    const items=await list(db,`SELECT p.id,p.display_name AS name,p.biography,
      (SELECT COUNT(*) FROM work_contributors w WHERE w.person_id=p.id AND w.role='author') AS authored,
      (SELECT COUNT(*) FROM edition_contributors e WHERE e.person_id=p.id AND e.role='narrator') AS narrated
      FROM people p WHERE (?='' OR p.display_name LIKE ?) ORDER BY p.display_name LIMIT ? OFFSET ?`,q,'%'+q+'%',limit,offset);
    return respond({items});
   }
   if(section==='reviews'){
    const items=await list(db,`SELECT r.id,r.title,r.status,r.visibility,r.story_rating AS storyRating,
      r.spoilers,r.published_at AS publishedAt,w.title AS bookTitle,m.handle AS authorHandle
      FROM reviews r JOIN works w ON w.id=r.book_id JOIN members m ON m.id=r.member_id
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   if(section==='community'){
    const items=await list(db,`SELECT 'discussion' AS kind,d.id,d.title,d.state AS status,d.created_at AS createdAt,m.handle AS authorHandle
      FROM discussions d JOIN members m ON m.id=d.owner_id
      UNION ALL SELECT 'club',c.id,c.name,'active',c.created_at,m.handle
      FROM clubs c JOIN members m ON m.id=c.host_id
      UNION ALL SELECT 'challenge',ch.id,ch.title,ch.visibility,COALESCE(ch.starts_at,''),m.handle
      FROM challenges ch LEFT JOIN members m ON m.id=ch.owner_id
      ORDER BY createdAt DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   if(section==='requests'){
    const items=await list(db,`SELECT id,requested_title AS title,requested_author AS author,requested_format AS format,
      notes,state,created_at AS createdAt FROM missing_book_requests ORDER BY created_at DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   if(section==='notices'){
    const items=await list(db,`SELECT id,title,body,visibility,updated_at AS updatedAt FROM admin_site_notices ORDER BY updated_at DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   if(section==='settings'){
    const saved=await list<{key:string;json:string;updatedAt:string}>(db,'SELECT setting_key AS key,setting_json AS json,updated_at AS updatedAt FROM site_settings ORDER BY setting_key');
    const values=new Map(saved.map(x=>[x.key,x]));
    const defaults:Record<string,string>={homepage_heading:'',homepage_intro:'',guest_default_theme:'editorial'};
    const items=Object.keys(defaults).map(key=>values.get(key)??{key,json:JSON.stringify(defaults[key]),updatedAt:null});
    return respond({items,readOnlyRuntime:{signupMode:env.SIGNUP_MODE==='public'?'public':'owner_only',origin:env.PUBLIC_ORIGIN,mailConfigured:Boolean(env.MAIL_API_KEY)}});
   }
   if(section==='audit'){
    const items=await list(db,`SELECT a.id,a.actor_id AS actorId,a.action,a.entity_type AS entityType,a.entity_id AS entityId,
       a.reason,a.created_at AS createdAt,m.handle AS actorHandle
       FROM admin_audit_log a LEFT JOIN members m ON m.id=a.actor_id
       ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   if(section==='reports'){
    const items=await list(db,`SELECT r.id,r.content_type AS contentType,r.content_id AS contentId,
      r.reason,r.state,r.created_at AS createdAt,m.handle AS reporterHandle
      FROM content_reports r JOIN members m ON m.id=r.reporter_id ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,limit,offset);
    return respond({items});
   }
   return fail('Unknown admin section',404);
  }
  const data=acceptedBody(await request.json().catch(()=>null));
  if(!data)return fail('Invalid JSON request',400);
  const reason=value(data.reason,500);
  if(section==='books'&&request.method==='POST'&&!recordId){
   const title=value(data.title,250);
   if(title.length<2)return fail('A genuine book title is required');
   const workId=id();
   await db.prepare("INSERT INTO works(id,title,verification_status) VALUES(?,?,'unverified')").bind(workId,title).run();
   await audit(db,session.user.id,'create','work',workId,null,{title,verificationStatus:'unverified'},reason);
   return respond({id:workId,saved:true},201);
  }
  if(section==='people'&&request.method==='POST'&&!recordId){
   const name=value(data.name,250);if(name.length<2)return fail('Contributor name is required');
   const personId=id();
   await db.prepare('INSERT INTO people(id,display_name,biography) VALUES(?,?,?)').bind(personId,name,value(data.biography,5000)||null).run();
   await audit(db,session.user.id,'create','person',personId,null,{name},reason);
   return respond({id:personId,saved:true},201);
  }
  if(section==='notices'&&request.method==='POST'&&!recordId){
   const title=value(data.title,150),body=value(data.body,4000);
   if(title.length<3||body.length<3)return fail('Title and body are required');
   const noticeId=id();
   await db.prepare("INSERT INTO admin_site_notices(id,title,body,visibility,updated_by) VALUES(?,?,?,'draft',?)").bind(noticeId,title,body,session.user.id).run();
   await audit(db,session.user.id,'create','notice',noticeId,null,{title,body,visibility:'draft'},reason);
   return respond({id:noticeId,saved:true},201);
  }
  if(section==='books'&&request.method==='PATCH'&&recordId){
   const status=value(data.verificationStatus,30);
   if(!['verified','unverified','needs_review'].includes(status))return fail('Invalid verification status');
   const prior=await db.prepare('SELECT id,title,verification_status AS status FROM works WHERE id=?').bind(recordId).first<{id:string;title:string;status:string}>();
   if(!prior)return fail('Book not found',404);
   await db.prepare('UPDATE works SET verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,recordId).run();
   await audit(db,session.user.id,'verification_status','work',recordId,prior,{...prior,status},reason);
   return respond({saved:true});
  }
  if(section==='editions'&&request.method==='PATCH'&&recordId){
   const status=value(data.verificationStatus,30);
   if(!['verified','unverified','needs_review'].includes(status))return fail('Invalid edition verification status');
   const prior=await db.prepare('SELECT id,work_id AS workId,verification_status AS status FROM editions WHERE id=?').bind(recordId).first<{id:string;workId:string;status:string}>();
   if(!prior)return fail('Edition not found',404);
   await db.prepare('UPDATE editions SET verification_status=? WHERE id=?').bind(status,recordId).run();
   await audit(db,session.user.id,'verification_status','edition',recordId,prior,{...prior,status},reason);
   return respond({saved:true});
  }
  if(section==='people'&&request.method==='PATCH'&&recordId){
   const biography=value(data.biography,5000);
   const prior=await db.prepare('SELECT id,biography FROM people WHERE id=?').bind(recordId).first<{id:string;biography:string|null}>();
   if(!prior)return fail('Contributor not found',404);
   await db.prepare('UPDATE people SET biography=? WHERE id=?').bind(biography||null,recordId).run();
   await audit(db,session.user.id,'edit_biography','person',recordId,prior,{...prior,biography},reason);
   return respond({saved:true});
  }
  if(section==='requests'&&request.method==='PATCH'&&recordId){
   const state=value(data.state,20);
   if(!['pending','reviewing','resolved','dismissed'].includes(state))return fail('Invalid request state');
   const prior=await db.prepare('SELECT id,state FROM missing_book_requests WHERE id=?').bind(recordId).first<{id:string;state:string}>();
   if(!prior)return fail('Request not found',404);
   await db.prepare('UPDATE missing_book_requests SET state=? WHERE id=?').bind(state,recordId).run();
   await audit(db,session.user.id,'change_state','missing_book_request',recordId,prior,{id:recordId,state},reason);
   return respond({saved:true});
  }
  if(section==='reviews'&&request.method==='PATCH'&&recordId){
   const action=value(data.action,30);
   if(action!=='remove')return fail('Unsupported review action');
   if(reason.length<10)return fail('Provide a moderation reason of at least ten characters');
   const prior=await db.prepare('SELECT id,status,visibility FROM reviews WHERE id=?').bind(recordId).first<{id:string;status:string;visibility:string}>();
   if(!prior)return fail('Review not found',404);
   if(prior.status!=='published')return fail('Only published reviews can be removed',409);
   await db.prepare("UPDATE reviews SET status='removed',visibility='private',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(recordId).run();
   await audit(db,session.user.id,'remove','review',recordId,prior,{id:recordId,status:'removed',visibility:'private'},reason);
   return respond({saved:true});
  }
  if(section==='notices'&&request.method==='PATCH'&&recordId){
   const status=value(data.visibility,20),title=value(data.title,150),body=value(data.body,4000);
   if(!['draft','published','archived'].includes(status)||title.length<3||body.length<3)return fail('Invalid editorial notice');
   const prior=await db.prepare('SELECT id,title,body,visibility FROM admin_site_notices WHERE id=?').bind(recordId).first();
   if(!prior)return fail('Notice not found',404);
   const after={id:recordId,title,body,visibility:status};
   await db.prepare('UPDATE admin_site_notices SET title=?,body=?,visibility=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(title,body,status,session.user.id,recordId).run();
   await audit(db,session.user.id,'edit','notice',recordId,prior,after,reason);
   return respond({saved:true});
  }
  if(section==='settings'&&request.method==='PATCH'&&recordId){
   // Allow only editorial/experience settings; never change account permissions or
   // production secrets through this endpoint.
   if(!['homepage_heading','homepage_intro','guest_default_theme'].includes(recordId))return fail('This setting is protected',403);
   const next=value(data.value,300);
   if(!next||recordId==='guest_default_theme'&&!['editorial','reading-room'].includes(next))return fail('Invalid setting value');
   const prior=await db.prepare('SELECT setting_json AS json FROM site_settings WHERE setting_key=?').bind(recordId).first<{json:string}>();
   await db.prepare(`INSERT INTO site_settings(setting_key,setting_json,updated_by,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET
    setting_json=excluded.setting_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(recordId,JSON.stringify(next),session.user.id).run();
   await audit(db,session.user.id,'edit','site_setting',recordId,prior,{value:next},reason);
   return respond({saved:true});
  }
  return fail('Unsupported admin operation',404);
 }catch(error){
  console.error('Administrator operation failed',error);
  return fail('Administrator operation failed; no further action was confirmed',503);
 }
}
