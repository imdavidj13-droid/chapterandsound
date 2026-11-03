/**
 * Manually curated catalogue metadata. Calls enter only after the verified-owner
 * session + admin role checks in catalogue-admin-api.ts.
 * No SQL table names, columns or foreign-key targets are supplied by the caller.
 */
type Scalar=string|number|null;
export interface ManualStatement{
 bind(...params:Scalar[]):ManualStatement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<{meta?:{changes?:number}}>;
}
export interface ManualDB{
 prepare(sql:string):ManualStatement;
 batch(statements:ManualStatement[]):Promise<unknown[]>;
}
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const reject=(error:string,status=400)=>reply({error},status);
const uuid=()=>crypto.randomUUID();
const object=(x:unknown):Record<string,unknown>|null=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:null;
const txt=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const validId=(x:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const partialDate=(x:string)=>!x||/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(x);
const lang=(x:string)=>!x||/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(x);
const status=new Set(['draft','needs_review','verified','published','withdrawn','suppressed']);
const formats=new Set(['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown']);
const performance=new Set(['single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice','unknown']);
const abridgement=new Set(['unabridged','abridged','adapted','unknown']);
const roles=new Set(['author','coauthor','narrator','cast','translator','editor','illustrator','cover_artist','foreword','afterword','adapter','producer','director','audio_engineer','other']);
function audit(db:ManualDB,actor:string,verb:string,kind:string,id:string,details:unknown){
 return db.prepare('INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,?,?,?,?)')
  .bind(uuid(),actor,verb,kind,id,JSON.stringify(details));
}
function rev(db:ManualDB,actor:string,kind:string,id:string,number:number,before:unknown,after:unknown){
 return db.prepare('INSERT INTO record_revisions(id,entity_kind,entity_id,revision,before_json,after_json,actor_external_id,reason) VALUES(?,?,?,?,?,?,?,?)')
  .bind(uuid(),kind,id,number,before?JSON.stringify(before):null,JSON.stringify(after),actor,'Manual catalogue editor');
}
async function exists(db:ManualDB,table:'works'|'people'|'editions'|'audio_recordings'|'organisations'|'publishers'|'imprints'|'series'|'subjects'|'classification_schemes'|'identifier_schemes',id:string){
 if(!validId(id))return false;
 const pk=table==='publishers'?'organisation_id':'id';
 return !!await db.prepare('SELECT '+pk+' FROM '+table+' WHERE '+pk+'=?').bind(id).first();
}
function required(v:unknown,max=500){const x=txt(v,max);if(!x)throw Error('A required field is empty');return x}
function positive(v:unknown,allowZero=false){
 if(v==null||v==='')return null;
 const x=Number(v);
 if(!Number.isInteger(x)||x<(allowZero?0:1)||x>1000000000)throw Error('Number must be a valid nonnegative whole number');
 return x;
}
function date(v:unknown){const x=txt(v,10);if(!partialDate(x))throw Error('Use a date in YYYY, YYYY-MM or YYYY-MM-DD format');return x||null;}
function language(v:unknown){const x=txt(v,40);if(!lang(x))throw Error('Invalid language code');return x||null;}
function enumValue(v:unknown,choices:Set<string>,field:string){const x=required(v,45);if(!choices.has(x))throw Error('Invalid '+field);return x;}
function auditError(e:unknown){
 const s=e instanceof Error?e.message:'Unable to save catalogue metadata';
 if(/UNIQUE constraint failed/.test(s))return 'A matching record already exists. Check the list before adding another.';
 if(/FOREIGN KEY constraint failed/.test(s))return 'A linked record no longer exists; reload the editor.';
 if(/CHECK constraint failed/.test(s))return 'One of the values is not valid for this field.';
 return s.startsWith('D1_')?'Database operation failed':s;
}
export function validIsbn13(raw:string):boolean{
 const isbn=raw.replace(/[\s-]/g,'');
 if(!/^(978|979)\d{10}$/.test(isbn))return false;
 const sum=[...isbn].slice(0,12).reduce((t,d,i)=>t+Number(d)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(isbn[12]);
}
export function validIsbn10(raw:string):boolean{
 const isbn=raw.replace(/[\s-]/g,'').toUpperCase();
 if(!/^\d{9}[\dX]$/.test(isbn))return false;
 const sum=[...isbn].reduce((t,c,i)=>t+(c==='X'?10:Number(c))*(10-i),0);
 return sum%11===0;
}
const identifierKinds=new Set(['edition','recording','work','person','series','organisation']);
const relationKinds=new Set(['author','coauthor','narrator','cast','translator','editor','illustrator','cover_artist','foreword','afterword','adapter','producer','director','audio_engineer','other']);
const targetTable:Record<string,'works'|'editions'|'audio_recordings'|'people'|'series'|'organisations'>={
 work:'works',edition:'editions',recording:'audio_recordings',person:'people',series:'series',organisation:'organisations'
};
async function recordList(db:ManualDB,name:string,q:string,limit:number,offset:number){
 switch(name){
 case 'people':return (await db.prepare("SELECT id,preferred_name AS name,sort_name AS sortName,identity_status AS status,revision FROM people WHERE (?='' OR instr(lower(preferred_name),lower(?))>0) ORDER BY preferred_name LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'editions':return (await db.prepare("SELECT e.id,w.canonical_title AS name,e.work_id AS workId,e.format,e.page_count AS pages,e.revision FROM editions e JOIN works w ON w.id=e.work_id ORDER BY e.created_at DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'recordings':return (await db.prepare("SELECT r.id,w.canonical_title AS name,r.work_id AS workId,r.performance_type AS performance,r.duration_seconds AS seconds,r.revision FROM audio_recordings r JOIN works w ON w.id=r.work_id ORDER BY r.created_at DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'imprints':return (await db.prepare("SELECT i.id,i.name,o.name AS publisher,i.publisher_id AS publisherId FROM imprints i LEFT JOIN organisations o ON o.id=i.publisher_id WHERE (?='' OR instr(lower(i.name),lower(?))>0) ORDER BY i.name LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'publishers':return (await db.prepare("SELECT o.id,o.name,o.country,o.website_url AS website, 'publisher' AS kind FROM organisations o JOIN publishers p ON p.organisation_id=o.id WHERE (?='' OR instr(lower(o.name),lower(?))>0) ORDER BY o.name LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'organisations':return (await db.prepare("SELECT id,name,organisation_type AS kind,country,website_url AS website FROM organisations WHERE (?='' OR instr(lower(name),lower(?))>0) ORDER BY name LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'series':return (await db.prepare("SELECT id,title AS name,description,series_type AS kind FROM series WHERE (?='' OR instr(lower(title),lower(?))>0) ORDER BY title LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'schemes':return (await db.prepare("SELECT id,scheme_code AS name,version FROM classification_schemes ORDER BY scheme_code LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'subjects':return (await db.prepare("SELECT s.id,s.label AS name,s.code,s.scheme_id AS schemeId,c.scheme_code AS scheme FROM subjects s JOIN classification_schemes c ON c.id=s.scheme_id WHERE (?='' OR instr(lower(s.label),lower(?))>0) ORDER BY s.label LIMIT ? OFFSET ?").bind(q,q,limit,offset).all()).results;
 case 'identifiers':return (await db.prepare("SELECT e.id,e.entity_kind AS entityKind,e.entity_id AS entityId,e.value,e.normalized_value AS normalized,e.market_scope AS market,s.code AS scheme FROM entity_identifiers e JOIN identifier_schemes s ON s.id=e.scheme_id ORDER BY e.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'identifier-schemes':return (await db.prepare('SELECT id,code AS name,entity_scope AS entityScope FROM identifier_schemes ORDER BY code LIMIT ? OFFSET ?').bind(limit,offset).all()).results;
 case 'work-titles':return (await db.prepare("SELECT id,work_id AS workId,title AS name,title_type AS kind,language FROM work_titles ORDER BY rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'series-memberships':return (await db.prepare("SELECT m.id,m.work_id AS workId,m.series_id AS seriesId,s.title AS series,w.canonical_title AS name,m.display_number AS number FROM series_memberships m JOIN series s ON s.id=m.series_id JOIN works w ON w.id=m.work_id ORDER BY m.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'work-subjects':return (await db.prepare("SELECT x.id,x.work_id AS workId,x.subject_id AS subjectId,s.label AS name,w.canonical_title AS book FROM work_subjects x JOIN subjects s ON s.id=x.subject_id JOIN works w ON w.id=x.work_id ORDER BY x.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'publication-events':return (await db.prepare("SELECT p.id,p.edition_id AS editionId,p.event_type AS kind,p.date_value AS date,w.canonical_title AS name FROM publication_events p JOIN editions e ON e.id=p.edition_id JOIN works w ON w.id=e.work_id ORDER BY p.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'recording-editions':return (await db.prepare("SELECT x.edition_id AS editionId,x.recording_id AS recordingId,w.canonical_title AS name,x.sequence FROM edition_recordings x JOIN editions e ON e.id=x.edition_id JOIN works w ON w.id=e.work_id ORDER BY x.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'tracks':return (await db.prepare("SELECT a.id,a.recording_id AS recordingId,a.sequence,a.title AS name,a.duration_seconds AS seconds FROM audio_tracks a ORDER BY a.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 case 'credits':return (await db.prepare("SELECT c.id,c.person_id AS personId,p.preferred_name AS name,c.role_code AS role,c.work_id AS workId,c.edition_id AS editionId,c.recording_id AS recordingId,c.credit_order AS creditOrder FROM contributions c LEFT JOIN people p ON p.id=c.person_id ORDER BY c.rowid DESC LIMIT ? OFFSET ?").bind(limit,offset).all()).results;
 default:throw Error('Unknown manual metadata list');
 }
}
export async function manualCatalogueAPI(request:Request,db:ManualDB,actor:string,path:string):Promise<Response>{
 const parts=path.split('/').filter(Boolean),kind=parts[1]||'';
 if(parts[0]!=='manual')return reject('Unknown catalogue route',404);
 try{
  if(request.method==='GET'){
   const url=new URL(request.url),q=txt(url.searchParams.get('q'),100);
   const limit=Math.min(Math.max(Number(url.searchParams.get('limit'))||100,1),200);
   const offset=Math.min(Math.max(Number(url.searchParams.get('offset'))||0,0),100000);
   if(parts.length===2)return reply({items:await recordList(db,kind,q,limit,offset)});
   if(parts.length===3&&validId(parts[2]||'')){
    const id=parts[2]||'';
    switch(kind){
    case 'people':return reply({item:await db.prepare('SELECT id,preferred_name AS name,sort_name AS sortName,bio,birth_date AS birthDate,death_date AS deathDate,revision FROM people WHERE id=?').bind(id).first()});
    case 'editions':return reply({item:await db.prepare('SELECT id,work_id AS workId,format,edition_statement AS statement,title_override AS title,language,page_count AS pages,revision FROM editions WHERE id=?').bind(id).first()});
    case 'recordings':return reply({item:await db.prepare('SELECT id,work_id AS workId,recording_title AS title,language,abridgement,performance_type AS performance,duration_seconds AS seconds,recorded_date AS recordedDate,revision FROM audio_recordings WHERE id=?').bind(id).first()});
    default:return reject('Detail route not supported',404);
    }
   }
   return reject('Unknown catalogue route',404);
  }
  if(request.method!=='POST'&&request.method!=='PATCH')return reject('Method not supported',405);
  if(Number(request.headers.get('Content-Length')||0)>50000)return reject('Request too large',413);
  const body=object(await request.json().catch(()=>null));
  if(!body)return reject('Expected JSON object');
  const edit=request.method==='PATCH';
  if(edit){
   const id=parts[2]||'';
   if(!validId(id)||parts.length!==3)return reject('Invalid record identifier');
   if(!['people','editions','recordings'].includes(kind))return reject('This editor does not modify that record type',405);
   const table=kind==='people'?'people':kind==='editions'?'editions':'audio_recordings';
   const old=await db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first<Record<string,unknown>>();
   if(!old)return reject('Record not found',404);
   if(old.revision!==body.expectedRevision)return reject('Record changed elsewhere; reload before editing',409);
   let columns:string[]=[];let params:Scalar[]=[];let statement='';
   if(kind==='people'){
    columns=['preferred_name=?','sort_name=?','bio=?','birth_date=?','death_date=?'];
    const birth=date(body.birthDate),death=date(body.deathDate);
    params=[required(body.name),txt(body.sortName)||null,txt(body.bio,12000)||null,birth,death];
   }else if(kind==='editions'){
    const format=enumValue(body.format,formats,'format'),pages=positive(body.pages);
    columns=['format=?','edition_statement=?','title_override=?','language=?','page_count=?'];
    params=[format,txt(body.statement)||null,txt(body.title)||null,language(body.language),pages];
   }else{
    const perf=enumValue(body.performance,performance,'performance type'),abr=enumValue(body.abridgement,abridgement,'abridgement');
    columns=['recording_title=?','language=?','abridgement=?','performance_type=?','duration_seconds=?','recorded_date=?'];
    params=[txt(body.title)||null,language(body.language),abr,perf,positive(body.seconds),date(body.recordedDate)];
   }
   statement='UPDATE '+table+' SET '+columns.join(',')+',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?';
   const result=await db.prepare(statement).bind(...params,id,Number(body.expectedRevision)).run();
   if(result.meta?.changes!==1)return reject('Record changed elsewhere; reload before editing',409);
   const after=await db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(id).first();
   await db.batch([rev(db,actor,kind==='people'?'person':kind==='editions'?'edition':'recording',id,Number(body.expectedRevision)+1,old,after),audit(db,actor,'update',kind,id,{before:old,after})]);
   return reply({saved:true,id,revision:Number(body.expectedRevision)+1});
  }
  if(parts.length!==2)return reject('Invalid path',404);
  const id=uuid();let inserts:ManualStatement[]=[];let info:Record<string,unknown>={};
  switch(kind){
  case 'people':{
   const name=required(body.name),sort=txt(body.sortName)||null,bio=txt(body.bio,12000)||null;
   const duplicates=await db.prepare("SELECT id FROM people WHERE lower(trim(preferred_name))=lower(?) AND identity_status NOT IN ('merged','suppressed') LIMIT 1")
    .bind(name).first<{id:string}>();
   if(duplicates)return reply({error:'This contributor already exists. Open their profile instead.',existingId:duplicates.id},409);
   const birth=date(body.birthDate),death=date(body.deathDate);
   inserts=[db.prepare('INSERT INTO people(id,preferred_name,sort_name,bio,birth_date,death_date) VALUES(?,?,?,?,?,?)').bind(id,name,sort,bio,birth,death)];
   info={name,sort,bio,birth,death};break;
  }
  case 'organisations':case 'publishers':{
   const name=required(body.name),country=txt(body.country,12)||null,website=txt(body.website,1500)||null;
   if(website&&!/^https:\/\//i.test(website))return reject('Organisation website must use HTTPS');
   const type=kind==='publishers'?'publisher':enumValue(body.type,new Set(['publisher','studio','rights_holder','agency','distributor','other']),'organisation type');
   inserts=[db.prepare('INSERT INTO organisations(id,name,organisation_type,country,website_url) VALUES(?,?,?,?,?)').bind(id,name,type,country,website)];
   if(type==='publisher')inserts.push(db.prepare('INSERT INTO publishers(organisation_id) VALUES(?)').bind(id));
   info={name,country,website,type};break;
  }
  case 'series':{
   const title=required(body.title),description=txt(body.description,12000)||null;
   const type=enumValue(body.type,new Set(['series','subseries','universe','collection']),'series type');
   inserts=[db.prepare('INSERT INTO series(id,title,description,series_type) VALUES(?,?,?,?)').bind(id,title,description,type)];
   info={title,description,type};break;
  }
  case 'editions':{
   const workId=required(body.workId,100),format=enumValue(body.format,formats,'edition format');
   if(!await exists(db,'works',workId))return reject('Choose an existing book');
   const pages=positive(body.pages);
   inserts=[db.prepare("INSERT INTO editions(id,work_id,format,title_override,edition_statement,language,page_count,publication_status,verification_status) VALUES(?,?,?,?,?,?,?,'published','published')").bind(id,workId,format,txt(body.title)||null,txt(body.statement)||null,language(body.language),pages)];
   info={workId,format,pages};break;
  }
  case 'recordings':{
   const workId=required(body.workId,100);
   if(!await exists(db,'works',workId))return reject('Choose an existing book');
   const abr=enumValue(body.abridgement,abridgement,'abridgement'),perf=enumValue(body.performance,performance,'performance');
   const seconds=positive(body.seconds);
   inserts=[db.prepare("INSERT INTO audio_recordings(id,work_id,recording_title,language,abridgement,performance_type,duration_seconds,recorded_date,verification_status) VALUES(?,?,?,?,?,?,?,?,'published')").bind(id,workId,txt(body.title)||null,language(body.language),abr,perf,seconds,date(body.recordedDate))];
   info={workId,abr,perf,seconds};break;
  }
  case 'imprints':{
   const name=required(body.name),publisherId=required(body.publisherId,100);
   if(!await exists(db,'publishers',publisherId))return reject('Select a publisher');
   inserts=[db.prepare('INSERT INTO imprints(id,name,publisher_id) VALUES(?,?,?)').bind(id,name,publisherId)];
   info={name,publisherId};break;
  }
  case 'identifier-schemes':{
   const code=required(body.code,50).toUpperCase(),scope=enumValue(body.scope,new Set(['work','version','edition','recording','person','series','organisation','multiple']),'identifier scope');
   const uniqueness=enumValue(body.uniqueness,new Set(['global','issuer','market','none']),'uniqueness scope');
   inserts=[db.prepare('INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES(?,?,?,?)').bind(id,code,scope,uniqueness)];
   info={code,scope,uniqueness};break;
  }
  case 'identifiers':{
   const schemeId=required(body.schemeId,100),entityKind=enumValue(body.entityKind,identifierKinds,'entity kind'),entityId=required(body.entityId,100);
   if(!await exists(db,'identifier_schemes',schemeId)||!await exists(db,targetTable[entityKind]!,entityId))return reject('Select existing identifier scheme and target');
   const scheme=await db.prepare('SELECT code,entity_scope AS scope,uniqueness_scope AS uniqueness FROM identifier_schemes WHERE id=?').bind(schemeId).first<{code:string;scope:string;uniqueness:string}>();
   if(scheme?.scope!=='multiple'&&scheme?.scope!==entityKind)return reject('Identifier scheme cannot be used for this target');
   const value=required(body.value,200),market=txt(body.market,12).toUpperCase(),issuer=txt(body.issuer,100);
   const code=(scheme?.code||'').toUpperCase();
   const normalized=value.replace(/[\s-]/g,'').toUpperCase();
   if(code==='ISBN13'&&!validIsbn13(value))return reject('Invalid ISBN-13 checksum');
   if(code==='ISBN10'&&!validIsbn10(value))return reject('Invalid ISBN-10 checksum');
   if(code==='ASIN'&&!/^[A-Z0-9]{10}$/.test(normalized))return reject('ASIN must be 10 letters/numbers');
   if(scheme?.uniqueness==='market'&&!market)return reject('Market code required for this identifier');
   inserts=[db.prepare('INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value,market_scope,issuer_scope) VALUES(?,?,?,?,?,?,?,?)').bind(id,schemeId,entityKind,entityId,value,normalized,market,issuer)];
   info={schemeId,entityKind,entityId,value,market};break;
  }
  case 'work-titles':{
   const workId=required(body.workId,100),title=required(body.title);
   if(!await exists(db,'works',workId))return reject('Select a book');
   const type=enumValue(body.type,new Set(['alternative','original','translated','regional','working','other']),'title type');
   inserts=[db.prepare('INSERT INTO work_titles(id,work_id,title,title_type,language) VALUES(?,?,?,?,?)').bind(id,workId,title,type,language(body.language))];
   info={workId,title,type};break;
  }
  case 'schemes':{
   const code=required(body.code,50).toUpperCase(),version=txt(body.version,30);
   inserts=[db.prepare('INSERT INTO classification_schemes(id,scheme_code,version) VALUES(?,?,?)').bind(id,code,version)];
   info={code,version};break;
  }
  case 'subjects':{
   const name=required(body.name),code=required(body.code,80),schemeId=required(body.schemeId,100);
   if(!await exists(db,'classification_schemes',schemeId))return reject('Select a classification scheme');
   inserts=[db.prepare('INSERT INTO subjects(id,scheme_id,code,label) VALUES(?,?,?,?)').bind(id,schemeId,code,name)];
   info={name,code,schemeId};break;
  }
  case 'work-subjects':{
   const workId=required(body.workId,100),subjectId=required(body.subjectId,100);
   if(!await exists(db,'works',workId)||!await exists(db,'subjects',subjectId))return reject('Select book and subject');
   inserts=[db.prepare('INSERT INTO work_subjects(id,work_id,subject_id,primary_flag) VALUES(?,?,?,?)').bind(id,workId,subjectId,body.primary===true?1:0)];
   info={workId,subjectId};break;
  }
  case 'series-memberships':{
   const workId=required(body.workId,100),seriesId=required(body.seriesId,100),position=txt(body.number,30)||null;
   if(!await exists(db,'works',workId)||!await exists(db,'series',seriesId))return reject('Select book and series');
   const ordinal=body.position==null||body.position===''?null:Number(body.position);
   if(ordinal!==null&&(!Number.isFinite(ordinal)||ordinal<0))return reject('Invalid series position');
   inserts=[db.prepare("INSERT INTO series_memberships(id,series_id,work_id,sequence_decimal,display_number,membership_type) VALUES(?,?,?,?,?,'primary')").bind(id,seriesId,workId,ordinal,position)];
   info={workId,seriesId,position};break;
  }
  case 'publication-events':{
   const editionId=required(body.editionId,100),event=enumValue(body.type,new Set(['announced','preorder','released','reprinted','revised','withdrawn','out_of_print']),'publication event'),when=date(body.date);
   if(!await exists(db,'editions',editionId))return reject('Choose an edition');
   const publisherId=txt(body.publisherId,100)||null;
   if(publisherId&&!await exists(db,'publishers',publisherId))return reject('Unknown publisher');
   inserts=[db.prepare('INSERT INTO publication_events(id,edition_id,event_type,date_value,publisher_id,territory) VALUES(?,?,?,?,?,?)').bind(id,editionId,event,when,publisherId,txt(body.territory,12)||null)];
   info={editionId,event,when,publisherId};break;
  }
  case 'recording-editions':{
   const editionId=required(body.editionId,100),recordingId=required(body.recordingId,100);
   if(!await exists(db,'editions',editionId)||!await exists(db,'audio_recordings',recordingId))return reject('Choose existing edition and recording');
   inserts=[db.prepare('INSERT INTO edition_recordings(edition_id,recording_id,sequence,primary_recording) VALUES(?,?,?,?)').bind(editionId,recordingId,positive(body.sequence)||1,body.primary===true?1:0)];
   info={editionId,recordingId};break;
  }
  case 'tracks':{
   const recordingId=required(body.recordingId,100),title=txt(body.title);
   if(!await exists(db,'audio_recordings',recordingId))return reject('Select recording');
   inserts=[db.prepare('INSERT INTO audio_tracks(id,recording_id,sequence,title,duration_seconds) VALUES(?,?,?,?,?)').bind(id,recordingId,positive(body.sequence)||1,title||null,positive(body.seconds))];
   info={recordingId,title};break;
  }
  case 'credits':{
   const personId=required(body.personId,100),role=enumValue(body.role,relationKinds,'contributor role');
   const target=enumValue(body.target,new Set(['work','edition','recording']),'credit target');
   const targetId=required(body.targetId,100);
   if(!await exists(db,'people',personId)||!await exists(db,targetTable[target]!,targetId))return reject('Select an existing person and target record');
   if(['narrator','cast','audio_engineer'].includes(role)&&target!=='recording')return reject('Narrator and cast credits belong to a recording');
   const column=target==='work'?'work_id':target==='edition'?'edition_id':'recording_id';
   inserts=[db.prepare('INSERT INTO contributions(id,person_id,'+column+',role_code,credit_name,credit_order) VALUES(?,?,?,?,?,?)').bind(id,personId,targetId,role,txt(body.creditName)||null,positive(body.order,true)||0)];
   info={personId,target,targetId,role};break;
  }
  default:return reject('Unknown catalogue operation',404);
  }
  if(!inserts.length)return reject('Nothing to save');
  const operations=[...inserts,rev(db,actor,kind,id,1,null,info),audit(db,actor,'create',kind,id,info)];
  await db.batch(operations);
  return reply({saved:true,id},201);
 }catch(e){
  console.error('Manual catalogue operation:',e);
  return reject(auditError(e),400);
 }
}
