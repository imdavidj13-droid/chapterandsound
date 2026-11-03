import {authConfigured,createAuth} from './auth.js';
type Value=string|number|null;
interface Statement{bind(...v:Value[]):Statement;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>;run():Promise<unknown>;}
interface DB{prepare(sql:string):Statement;}
export interface CommunityEnv {DB?:DB;BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string;}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const err=(message:string,status=400)=>json({error:message},status);
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const parse=async(request:Request):Promise<Record<string,unknown>>=>{
  if(Number(request.headers.get('Content-Length')??0)>20000)throw Error('Request too large');
  const body:unknown=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid JSON body');
  return body as Record<string,unknown>;
};
async function readerId(request:Request,env:CommunityEnv):Promise<string|null>{
  if(!authConfigured(env as unknown as Parameters<typeof authConfigured>[0]))return null;
  const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
  const session=await auth.api.getSession({headers:request.headers});
  if(!session?.user.emailVerified)return null;
  const id=session.user.id;
  await env.DB!.prepare('INSERT OR IGNORE INTO members(id,email_normalized,display_name,email_verified_at) VALUES(?,?,?,?)')
    .bind(id,session.user.email.toLowerCase(),session.user.name,new Date().toISOString()).run();
  return id;
}
export async function communityAPI(request:Request,env:CommunityEnv):Promise<Response>{
  const db=env.DB;
  if(!db)return err('Cloud database not configured',503);
  const url=new URL(request.url);
  const path=url.pathname;
  const method=request.method;
  const ids=path.split('/').filter(Boolean);
  if(!['GET','POST','DELETE'].includes(method))return err('Method not allowed',405);
  const userId=method==='GET'?null:await readerId(request,env);
  if(method!=='GET'){
    if(request.headers.get('Origin')!==url.origin)return err('Cross-origin mutation denied',403);
    if(!userId)return err('Verified member sign-in required',401);
  }
  try{
    if(path==='/api/discussions'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT d.id,d.title,d.body,d.spoilers,d.created_at AS createdAt,m.display_name AS authorName,
         (SELECT count(*) FROM discussion_replies r WHERE r.discussion_id=d.id AND r.deleted_at IS NULL) AS replyCount
         FROM discussions d JOIN members m ON m.id=d.owner_id
         WHERE d.state='open' ORDER BY d.created_at DESC LIMIT 80`).all();
        return json({items:results});
      }
      const b=await parse(request),title=text(b.title,160),body=text(b.body,8000);
      if(title.length<5||body.length<10)return err('A title and discussion text are required');
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO discussions(id,owner_id,title,body,spoilers) VALUES(?,?,?,?,?)')
        .bind(id,userId!,title,body,b.spoilers===true?1:0).run();
      return json({id,created:true},201);
    }
    if(ids[1]==='discussions'&&ids.length===3&&method==='GET'){
      const id=ids[2]!;
      const discussion=await db.prepare(`SELECT d.id,d.title,d.body,d.spoilers,d.created_at AS createdAt,
        m.display_name AS authorName,d.owner_id AS ownerId FROM discussions d JOIN members m ON m.id=d.owner_id
        WHERE d.id=? AND d.state='open'`).bind(id).first();
      if(!discussion)return err('Discussion not found',404);
      const {results}=await db.prepare(`SELECT r.id,r.body,r.spoilers,r.created_at AS createdAt,
        m.display_name AS authorName FROM discussion_replies r JOIN members m ON m.id=r.member_id
        WHERE r.discussion_id=? AND r.deleted_at IS NULL ORDER BY r.created_at ASC LIMIT 200`).bind(id).all();
      return json({discussion,replies:results});
    }
    if(ids[1]==='discussions'&&ids.length===4&&ids[3]==='replies'&&method==='POST'){
      const discussion=await db.prepare("SELECT id FROM discussions WHERE id=? AND state='open'").bind(ids[2]!).first();
      if(!discussion)return err('Discussion not found',404);
      const b=await parse(request),body=text(b.body,5000);
      if(body.length<2)return err('Write a reply first');
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO discussion_replies(id,discussion_id,member_id,body,spoilers) VALUES(?,?,?,?,?)')
        .bind(id,ids[2]!,userId!,body,b.spoilers===true?1:0).run();
      return json({created:true,id},201);
    }
    if(path==='/api/recommendations'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT q.id,q.title,q.description,q.created_at AS createdAt,m.display_name AS authorName,
        (SELECT count(*) FROM recommendations r WHERE r.request_id=q.id) AS replyCount
        FROM recommendation_requests q JOIN members m ON m.id=q.member_id ORDER BY q.created_at DESC LIMIT 80`).all();
        return json({items:results});
      }
      const b=await parse(request),title=text(b.title,150),description=text(b.description,6000);
      if(title.length<5||description.length<10)return err('Title and reading preferences are required');
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO recommendation_requests(id,member_id,title,description) VALUES(?,?,?,?)')
        .bind(id,userId!,title,description).run();
      return json({created:true,id},201);
    }
    if(ids[1]==='recommendations'&&ids.length===3&&method==='GET'){
      const item=await db.prepare(`SELECT q.id,q.title,q.description,m.display_name AS authorName
      FROM recommendation_requests q JOIN members m ON m.id=q.member_id WHERE q.id=?`).bind(ids[2]!).first();
      if(!item)return err('Request not found',404);
      const {results}=await db.prepare(`SELECT r.id,r.reason,w.id AS bookId,w.title AS bookTitle,m.display_name AS authorName
      FROM recommendations r JOIN works w ON w.id=r.work_id JOIN members m ON m.id=r.member_id
      WHERE r.request_id=? ORDER BY r.created_at`).bind(ids[2]!).all();
      return json({item,replies:results});
    }
    if(ids[1]==='recommendations'&&ids.length===4&&ids[3]==='replies'&&method==='POST'){
      const b=await parse(request);const reason=text(b.reason,3000),workId=text(b.workId,80);
      if(reason.length<4||!workId)return err('Select a verified book and explain why');
      const book=await db.prepare('SELECT id FROM works WHERE id=?').bind(workId).first();
      const topic=await db.prepare('SELECT id FROM recommendation_requests WHERE id=?').bind(ids[2]!).first();
      if(!book||!topic)return err('Request or book was not found',404);
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO recommendations(id,request_id,member_id,work_id,reason) VALUES(?,?,?,?,?)')
        .bind(id,ids[2]!,userId!,workId,reason).run();
      return json({created:true,id},201);
    }
    if(path==='/api/clubs'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT c.id,c.name,c.description,m.display_name AS hostName,
        (SELECT count(*) FROM club_members cm WHERE cm.club_id=c.id) AS members
        FROM clubs c JOIN members m ON m.id=c.host_id ORDER BY c.created_at DESC LIMIT 60`).all();
        return json({items:results});
      }
      const b=await parse(request),name=text(b.name,120),description=text(b.description,5000);
      if(name.length<4)return err('Club name is too short');
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO clubs(id,host_id,name,description) VALUES(?,?,?,?)')
        .bind(id,userId!,name,description||null).run();
      await db.prepare("INSERT INTO club_members(club_id,member_id,role) VALUES(?,?,'host')").bind(id,userId!).run();
      return json({created:true,id},201);
    }
    if(ids[1]==='clubs'&&ids.length===3&&method==='GET'){
      const club=await db.prepare(`SELECT c.id,c.name,c.description,m.display_name AS hostName
      FROM clubs c JOIN members m ON m.id=c.host_id WHERE c.id=?`).bind(ids[2]!).first();
      if(!club)return err('Club not found',404);
      const {results}=await db.prepare(`SELECT r.id,r.started_at AS startsAt,r.ends_at AS endsAt,w.title AS bookTitle,
      w.id AS bookId FROM club_reads r JOIN works w ON w.id=r.work_id WHERE r.club_id=? ORDER BY r.started_at DESC`).bind(ids[2]!).all();
      return json({club,reads:results});
    }
    if(ids[1]==='clubs'&&ids.length===4&&ids[3]==='join'&&method==='POST'){
      const club=await db.prepare('SELECT id FROM clubs WHERE id=?').bind(ids[2]!).first();
      if(!club)return err('Club not found',404);
      await db.prepare("INSERT OR IGNORE INTO club_members(club_id,member_id,role) VALUES(?,?,'member')")
        .bind(ids[2]!,userId!).run();
      return json({joined:true});
    }
    if(path==='/api/challenges'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT c.id,c.title,c.description,c.rule_json AS rules,
        c.starts_at AS startsAt,c.ends_at AS endsAt,
        (SELECT count(*) FROM challenge_members cm WHERE cm.challenge_id=c.id) AS participants
        FROM challenges c WHERE c.visibility='public' ORDER BY c.title LIMIT 80`).all();
        return json({items:results});
      }
      return err('Challenge publishing requires moderation approval',403);
    }
    if(ids[1]==='challenges'&&ids.length===3&&method==='GET'){
      const item=await db.prepare("SELECT * FROM challenges WHERE id=? AND visibility='public'").bind(ids[2]!).first();
      return item?json({item}):err('Challenge not found',404);
    }
    if(ids[1]==='challenges'&&ids.length===4&&ids[3]==='join'&&method==='POST'){
      const item=await db.prepare("SELECT id FROM challenges WHERE id=? AND visibility='public'").bind(ids[2]!).first();
      if(!item)return err('Challenge not found',404);
      await db.prepare("INSERT OR IGNORE INTO challenge_members(challenge_id,member_id,privacy) VALUES(?,?,'private')")
        .bind(ids[2]!,userId!).run();
      return json({joined:true});
    }
    if(path==='/api/lists'&&method==='GET'){
      const {results}=await db.prepare(`SELECT l.id,l.title,l.description,m.display_name AS authorName,
       (SELECT count(*) FROM curated_list_books b WHERE b.list_id=l.id) AS bookCount
       FROM curated_lists l JOIN members m ON m.id=l.owner_id
       WHERE l.visibility='public' ORDER BY l.created_at DESC LIMIT 80`).all();
      return json({items:results});
    }
    return err('Unknown community route',404);
  }catch(e){
    if(e instanceof SyntaxError)return err('Malformed request body');
    if(e instanceof Error&&/Invalid|too large/.test(e.message))return err(e.message);
    console.error('Community API error',e);
    return err('Community service temporarily unavailable',503);
  }
}
