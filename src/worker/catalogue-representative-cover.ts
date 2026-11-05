/** Owner-only curated representative artwork, independent of ISBN edition covers. */
interface Stmt{bind(...v:(string|number|null)[]):Stmt;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}
export interface CoverDB{prepare(sql:string):Stmt;batch(statements:Stmt[]):Promise<unknown[]>}
const clean=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gi,' ').trim();
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(msg:string,status=400)=>json({error:msg},status);
type Candidate={workKey:string;coverId:number;title:string;author:string;url:string};
type Work={id:string;title:string;author:string|null};
async function workFor(db:CoverDB,workId:string):Promise<Work|null>{
 return db.prepare(`SELECT w.id,w.canonical_title AS title,
  (SELECT p.preferred_name FROM contributions c JOIN people p ON p.id=c.person_id
    WHERE c.work_id=w.id AND c.role_code IN ('author','coauthor')
    ORDER BY c.credit_order,c.id LIMIT 1) AS author
  FROM works w WHERE w.id=?`).bind(workId).first<Work>();
}
async function candidatesFor(work:Work,contact:string):Promise<Candidate[]>{
 if(!work.author)return [];
 const url=new URL('https://openlibrary.org/search.json');
 url.searchParams.set('title',work.title);
 url.searchParams.set('author',work.author);
 url.searchParams.set('fields','key,title,author_name,cover_i');
 url.searchParams.set('limit','15');
 const response=await fetch(url,{headers:{Accept:'application/json',
  'User-Agent':'ChapterAndSoundCatalogue/0.2 ('+contact+')'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Open Library cover lookup unavailable');
 const data=await response.json() as {docs?:{key?:string;title?:string;author_name?:string[];cover_i?:number}[]};
 return (data.docs||[]).filter(x=>/^\/works\/OL\d+W$/.test(x.key||'')&&
  clean(x.title||'')===clean(work.title)&&
  x.author_name?.some(a=>clean(a)===clean(work.author||''))&&
  Number.isSafeInteger(x.cover_i)&&Number(x.cover_i)>0)
 .map(x=>({workKey:x.key!,coverId:x.cover_i!,title:x.title!,author:work.author!,
  url:'https://covers.openlibrary.org/b/id/'+x.cover_i+'-L.jpg?default=false'}))
 .filter((x,i,all)=>all.findIndex(y=>y.workKey===x.workKey&&y.coverId===x.coverId)===i);
}
export async function representativeCoverAPI(request:Request,db:CoverDB,actor:string,workId:string,contact:string){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(workId))return fail('Invalid book');
 const work=await workFor(db,workId);
 if(!work)return fail('Book not found',404);
 if(request.method==='GET'){
  try{
   const current=await db.prepare('SELECT openlibrary_work_key AS workKey,openlibrary_cover_id AS coverId FROM work_representative_covers WHERE work_id=?')
    .bind(workId).first<{workKey:string;coverId:number}>();
   return json({current,candidates:await candidatesFor(work,contact)});
  }catch(e){return fail(e instanceof Error?e.message:'Cover discovery failed',502)}
 }
 if(request.method!=='POST')return fail('Method not supported',405);
 const body=await request.json().catch(()=>null) as {workKey?:unknown;coverId?:unknown;confirmed?:unknown}|null;
 const key=typeof body?.workKey==='string'?body.workKey:'';
 const coverId=body?.coverId;
 if(body?.confirmed!==true||!/^\/works\/OL\d+W$/.test(key)||!Number.isSafeInteger(coverId)||Number(coverId)<=0)
  return fail('Choose a valid representative cover');
 try{
  // Reconfirm the selected work, author and cover against the source on every write.
  const choices=await candidatesFor(work,contact);
  if(!choices.some(c=>c.workKey===key&&c.coverId===coverId))
   return fail('Cover source no longer matches the book and author; no change made',409);
  await db.batch([
   db.prepare(`INSERT INTO work_representative_covers(work_id,openlibrary_work_key,openlibrary_cover_id,chosen_by)
    VALUES(?,?,?,?)
    ON CONFLICT(work_id) DO UPDATE SET openlibrary_work_key=excluded.openlibrary_work_key,
    openlibrary_cover_id=excluded.openlibrary_cover_id,chosen_by=excluded.chosen_by,chosen_at=CURRENT_TIMESTAMP`)
    .bind(workId,key,Number(coverId),actor),
   db.prepare(`INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json)
    VALUES(?,?, 'representative_cover_selected','work',?,?)`).bind(crypto.randomUUID(),actor,workId,JSON.stringify({key,coverId}))
  ]);
  return json({saved:true,coverId,workKey:key});
 }catch(e){return fail(e instanceof Error?e.message:'Cover selection unavailable',502)}
}
