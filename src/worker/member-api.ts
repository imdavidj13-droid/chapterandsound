import {authConfigured,createAuth} from './auth.js';

type BindValue=string|number|null;
interface Statement {bind(...values:BindValue[]):Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>;}
interface DB {prepare(sql:string):Statement;}
export interface MemberEnv {DB?:DB;BETTER_AUTH_SECRET?:string;PUBLIC_ORIGIN?:string;MAIL_API_KEY?:string;MAIL_FROM?:string;}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const bad=(message:string,status=400)=>reply({error:message},status);
const asString=(value:unknown,max=250)=>typeof value==='string'?value.trim().slice(0,max):'';
const jsonField=(v:unknown,max=24):string=>{
  if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||x.length>100))throw Error('Invalid list');
  return JSON.stringify([...new Set(v)]);
};
const rating=(v:unknown):number|null=>{
  if(v===null||v===undefined||v==='')return null;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>5||Math.round(v*2)!==v*2)throw Error('Ratings must be in half-star steps from 0 to 5');
  return v;
};
async function input(request:Request){
  if(Number(request.headers.get('Content-Length')??0)>30000)throw Error('Request too large');
  const v:unknown=await request.json();
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid JSON object');
  return v as Record<string,unknown>;
}
export async function memberAPI(request:Request,env:MemberEnv):Promise<Response>{
  if(!authConfigured(env as unknown as Parameters<typeof authConfigured>[0]))return bad('Secure member service is not configured',503);
  const origin=new URL(request.url).origin;
  const method=request.method;
  if(!['GET','POST','PATCH','DELETE','PUT'].includes(method))return bad('Method not allowed',405);
  if(method!=='GET'&&request.headers.get('Origin')!==origin)return bad('Cross-origin mutation denied',403);
  const db=env.DB!;
  const auth=createAuth(env as unknown as Parameters<typeof createAuth>[0]);
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return bad('Sign in required',401);
  if(!session.user.emailVerified)return bad('Verify your email before continuing',403);
  const userId=session.user.id;
  const url=new URL(request.url);const path=url.pathname;
  // Prevent empty user FK rows if a session is used before the /api/me bootstrap call.
  await db.prepare('INSERT OR IGNORE INTO members(id,email_normalized,display_name,email_verified_at) VALUES(?,?,?,?)')
    .bind(userId,session.user.email.toLowerCase(),session.user.name,new Date().toISOString()).run();
  try {
    if(path==='/api/member/favourites'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT f.person_id AS id,p.display_name AS name,f.role
        FROM favourite_people f JOIN people p ON p.id=f.person_id
        WHERE f.member_id=? ORDER BY p.display_name LIMIT 300`).bind(userId).all();
        return reply({items:results});
      }
      if(method==='POST'){
        const v=await input(request);const id=asString(v.personId,80),role=asString(v.role,20);
        if(!['author','narrator'].includes(role)||!id)return bad('Choose a valid person and role');
        const table=role==='author'?'work_contributors':'edition_contributors';
        const found=await db.prepare('SELECT person_id FROM '+table+' WHERE person_id=? AND role=? LIMIT 1')
          .bind(id,role).first();
        if(!found)return bad('This identity is not confirmed for that role',404);
        await db.prepare('INSERT OR IGNORE INTO favourite_people(member_id,person_id,role) VALUES(?,?,?)')
          .bind(userId,id,role).run();
        return reply({saved:true});
      }
    }
    if(path.startsWith('/api/member/favourites/')&&method==='DELETE'){
      const [, , , ,role,id]=path.split('/');
      if(!['author','narrator'].includes(role??'')||!id)return bad('Invalid selection');
      await db.prepare('DELETE FROM favourite_people WHERE member_id=? AND person_id=? AND role=?')
        .bind(userId,id,role!).run();
      return reply({removed:true});
    }
    if(path==='/api/member/preferences'){
      if(method==='GET'){
        const row=await db.prepare('SELECT format_json,genre_json,mood_json,onboarding_step,onboarding_completed_at FROM preferences WHERE member_id=?').bind(userId).first();
        return reply({item:row??null});
      }
      if(method==='PUT'){
        const v=await input(request);
        const formats=jsonField(v.formats??[]);
        const genres=jsonField(v.genres??[]);
        const moods=jsonField(v.moods??[]);
        const step=Number(v.onboardingStep??0);
        if(!Number.isInteger(step)||step<0||step>7)return bad('Invalid onboarding step');
        const completed=v.completed===true?new Date().toISOString():null;
        await db.prepare(`INSERT INTO preferences(member_id,format_json,genre_json,mood_json,onboarding_step,onboarding_completed_at,updated_at)
        VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(member_id) DO UPDATE SET format_json=excluded.format_json,genre_json=excluded.genre_json,
        mood_json=excluded.mood_json,onboarding_step=excluded.onboarding_step,
        onboarding_completed_at=COALESCE(excluded.onboarding_completed_at,preferences.onboarding_completed_at),
        updated_at=CURRENT_TIMESTAMP`).bind(userId,formats,genres,moods,step,completed).run();
        return reply({saved:true});
      }
    }
    if(path==='/api/member/shelf'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT x.id,x.work_id AS workId,x.edition_id AS editionId,x.status,
          x.started_at AS startedAt,x.finished_at AS finishedAt,x.progress_unit AS progressUnit,
          x.progress_value AS progressValue,x.private_note AS privateNote,x.private_rating AS privateRating,
          w.title AS bookTitle,e.format
          FROM reading_experiences x JOIN works w ON w.id=x.work_id
          LEFT JOIN editions e ON e.id=x.edition_id WHERE x.member_id=? ORDER BY x.updated_at DESC LIMIT 300`).bind(userId).all();
        return reply({items:results});
      }
      if(method==='POST'){
        const v=await input(request);
        const workId=asString(v.workId,80);const editionId=asString(v.editionId,80)||null;
        const status=asString(v.status,25);
        if(!['want_to_read','in_progress','paused','finished','dnf'].includes(status))return bad('Invalid reading status');
        if(!workId)return bad('Choose a book');
        const work=await db.prepare('SELECT id FROM works WHERE id=?').bind(workId).first();
        if(!work)return bad('The selected book is not in the catalogue',404);
        if(editionId){
          const edition=await db.prepare('SELECT id FROM editions WHERE id=? AND work_id=?').bind(editionId,workId).first();
          if(!edition)return bad('Edition does not belong to this book',400);
        }
        if(v.reread!==true){
          const exists=await db.prepare(`SELECT id FROM reading_experiences WHERE member_id=? AND work_id=?
            AND (edition_id=? OR (edition_id IS NULL AND ? IS NULL))
            ORDER BY created_at DESC LIMIT 1`).bind(userId,workId,editionId,editionId).first<{id:string}>();
          if(exists)return reply({error:'This book is already on your shelf',existingId:exists.id},409);
        }
        const id=crypto.randomUUID();
        await db.prepare('INSERT INTO reading_experiences(id,member_id,work_id,edition_id,status,private_note) VALUES(?,?,?,?,?,?)')
          .bind(id,userId,workId,editionId,status,asString(v.privateNote,5000)||null).run();
        return reply({id,saved:true},201);
      }
    }
    if(path.startsWith('/api/member/shelf/')&&method==='PATCH'){
      const id=decodeURIComponent(path.slice('/api/member/shelf/'.length));
      const exists=await db.prepare('SELECT id FROM reading_experiences WHERE id=? AND member_id=?').bind(id,userId).first();
      if(!exists)return bad('Shelf entry not found',404);
      const v=await input(request);
      const status=asString(v.status,25);
      if(status&&!['want_to_read','in_progress','paused','finished','dnf'].includes(status))return bad('Invalid status');
      const unit=asString(v.progressUnit,20);
      if(unit&&!['pages','percent','audio_minutes'].includes(unit))return bad('Invalid progress unit');
      const progress=v.progressValue===undefined?null:Number(v.progressValue);
      if(progress!==null&&(!Number.isFinite(progress)||progress<0||(unit==='percent'&&progress>100)))return bad('Invalid progress value');
      const started=v.startedAt===null?null:asString(v.startedAt,12)||null;
      const finished=v.finishedAt===null?null:asString(v.finishedAt,12)||null;
      for(const d of [started,finished])if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))return bad('Use ISO dates');
      await db.prepare(`UPDATE reading_experiences SET
       status=COALESCE(?,status),progress_unit=COALESCE(?,progress_unit),
       progress_value=COALESCE(?,progress_value),private_note=COALESCE(?,private_note),
       started_at=COALESCE(?,started_at),finished_at=COALESCE(?,finished_at),
       updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=?`)
       .bind(status||null,unit||null,progress,v.privateNote===undefined?null:asString(v.privateNote,5000),started,finished,id,userId).run();
      if(unit&&progress!==null)await db.prepare('INSERT INTO progress_entries(id,experience_id,progress_unit,progress_value) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),id,unit,progress).run();
      return reply({saved:true,id});
    }
    if(path==='/api/member/reviews'){
      if(method==='GET'){
        const {results}=await db.prepare(`SELECT r.id,r.title,r.body,r.story_rating AS storyRating,
          r.narration_rating AS audioRating,r.status,r.visibility,r.spoilers,r.book_id AS bookId,
          r.edition_id AS editionId,w.title AS bookTitle
          FROM reviews r JOIN works w ON w.id=r.book_id
          WHERE r.member_id=? AND r.status!='removed' ORDER BY r.updated_at DESC LIMIT 250`)
          .bind(userId).all();
        return reply({items:results});
      }
      if(method==='POST'){
        const v=await input(request);const bookId=asString(v.bookId,80);
        const editionId=asString(v.editionId,80)||null;
        if(!bookId)return bad('Choose a book');
        const work=await db.prepare('SELECT id FROM works WHERE id=?').bind(bookId).first();
        if(!work)return bad('Book not found',404);
        const format=editionId?await db.prepare('SELECT format FROM editions WHERE id=? AND work_id=?').bind(editionId,bookId).first<{format:string}>():null;
        if(editionId&&!format)return bad('Incorrect book edition',400);
        const story=rating(v.storyRating),narration=rating(v.audioRating);
        if(narration!==null&&format?.format!=='audiobook')return bad('Narration scores are for audiobooks only');
        const id=crypto.randomUUID();const title=asString(v.title,200)||null;
        const body=asString(v.body,20000)||null;
        await db.prepare(`INSERT INTO reviews(id,member_id,book_id,edition_id,title,body,story_rating,narration_rating,spoilers,status,visibility)
         VALUES(?,?,?,?,?,?,?,?,?,'draft','private')`)
          .bind(id,userId,bookId,editionId,title,body,story,narration,v.spoilers===true?1:0).run();
        return reply({saved:true,id,status:'draft'},201);
      }
    }
    if(path.startsWith('/api/member/reviews/')){
      const id=decodeURIComponent(path.slice('/api/member/reviews/'.length));
      const own=await db.prepare("SELECT id,status,book_id AS bookId,edition_id AS editionId FROM reviews WHERE id=? AND member_id=? AND status!='removed'")
        .bind(id,userId).first<{id:string;status:string;bookId:string;editionId:string|null}>();
      if(!own)return bad('Review not found',404);
      if(method==='DELETE'){
        await db.prepare("UPDATE reviews SET status='removed',visibility='private',updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=?").bind(id,userId).run();
        return reply({removed:true});
      }
      if(method==='PATCH'){
        const v=await input(request);
        if(v.action==='publish'){
          const check=await db.prepare('SELECT title,body,story_rating,narration_rating FROM reviews WHERE id=? AND member_id=?')
            .bind(id,userId).first<{title:string|null;body:string|null;story_rating:number|null;narration_rating:number|null}>();
          if(!check||(!check.body&&check.story_rating==null&&check.narration_rating==null))return bad('Add review text or a rating before publishing');
          await db.prepare(`UPDATE reviews SET status='published',visibility='public',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),
            updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=?`).bind(id,userId).run();
          return reply({published:true,id});
        }
        if(own.status==='published'&&v.action==='draft')return bad('A published review cannot be silently made private; explicitly remove it');
        const story=v.storyRating===undefined?undefined:rating(v.storyRating);
        const narration=v.audioRating===undefined?undefined:rating(v.audioRating);
        const format=own.editionId?await db.prepare('SELECT format FROM editions WHERE id=?').bind(own.editionId).first<{format:string}>():null;
        if(narration!=null&&format?.format!=='audiobook')return bad('Narration scores are for audiobooks only');
        await db.prepare(`UPDATE reviews SET title=COALESCE(?,title),body=COALESCE(?,body),
           story_rating=COALESCE(?,story_rating),narration_rating=COALESCE(?,narration_rating),
           spoilers=COALESCE(?,spoilers),updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=?`)
           .bind(v.title===undefined?null:asString(v.title,200),
             v.body===undefined?null:asString(v.body,20000),
             story===undefined?null:story,narration===undefined?null:narration,
             typeof v.spoilers==='boolean'?(v.spoilers?1:0):null,id,userId).run();
        return reply({saved:true,id,status:own.status});
      }
    }
    if(path==='/api/member/reading-year'&&method==='GET'){
      const year=Number(url.searchParams.get('year')??new Date().getUTCFullYear());
      if(!Number.isInteger(year)||year<1900||year>2100)return bad('Invalid year');
      const {results}=await db.prepare(`SELECT x.id,x.work_id AS workId,x.edition_id AS editionId,
      x.finished_at AS finishedAt,e.format,e.page_count AS pageCount,e.duration_minutes AS publishedAudioMinutes
      FROM reading_experiences x LEFT JOIN editions e ON e.id=x.edition_id
      WHERE x.member_id=? AND x.status='finished' AND x.finished_at >= ? AND x.finished_at < ?`)
        .bind(userId,year+'-01-01',(year+1)+'-01-01').all<{id:string;workId:string;format?:string;pageCount?:number;publishedAudioMinutes?:number}>();
      const uniqueBooks=new Set(results.map(x=>x.workId)).size;
      return reply({year,uniqueBooks,finishedExperiences:results.length,
        pageTotalKnown:results.every(x=>x.format==='audiobook'||x.pageCount!=null),
        publishedAudioMinutesKnown:results.filter(x=>x.format==='audiobook').every(x=>x.publishedAudioMinutes!=null),
        items:results});
    }
    return bad('Unknown member route',404);
  }catch(e){
    if(e instanceof SyntaxError)return bad('Malformed JSON');
    if(e instanceof Error&&(/Invalid|Request too large|Ratings/.test(e.message)))return bad(e.message);
    console.error('Member API failed',e);
    return bad('Unable to save or retrieve your information',503);
  }
}
