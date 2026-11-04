import {validIsbn10,validIsbn13} from './catalogue-manual-api.js';

/** Owner-only scoped metadata editing. Auth and same-origin checks run in catalogueAdminAPI first. */
interface Statement {
 bind(...values:(string|number|null)[]):Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<{meta?:{changes?:number}}>;
}
export interface MetadataDB {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(error:string,status=400)=>json({error},status);
const uuid=()=>crypto.randomUUID();
const clean=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const safe=(v:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(v);
const partialDate=(v:string)=>!v||/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(v);
const identifierCodes=new Set(['ISBN13','ISBN10','ASIN']);
const publicationTypes=new Set(['announced','preorder','released','reprinted','revised','withdrawn','out_of_print']);
const details=(db:MetadataDB,actor:string,action:string,targetId:string,info:unknown)=>
 db.prepare('INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,?,?,?,?)')
 .bind(uuid(),actor,action,'work',targetId,JSON.stringify(info));
async function ownership(db:MetadataDB,workId:string,table:'editions'|'audio_recordings',id:string){
 if(!safe(id))return false;
 return !!await db.prepare('SELECT id FROM '+table+' WHERE id=? AND work_id=?').bind(id,workId).first();
}
async function changed(db:MetadataDB,statements:Statement[]){
 await db.batch(statements);
 return json({saved:true});
}
export async function catalogueBookMetadataAPI(request:Request,db:MetadataDB,actor:string,workId:string):Promise<Response>{
 if(!safe(workId))return fail('Invalid book identifier');
 const work=await db.prepare('SELECT id,status FROM works WHERE id=?').bind(workId).first<{id:string;status:string}>();
 if(!work)return fail('Book not found',404);
 if(['withdrawn','suppressed'].includes(work.status))return fail('This record is protected from editing',409);
 try{
  if(request.method==='GET'){
   const [editions,identifiers,events,recordings,credits,genres,covers]=await Promise.all([
    db.prepare('SELECT id,format,revision FROM editions WHERE work_id=? ORDER BY created_at').bind(workId).all(),
    db.prepare("SELECT i.id,i.entity_id AS editionId,s.code,i.value FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id JOIN editions e ON e.id=i.entity_id WHERE i.entity_kind='edition' AND e.work_id=? ORDER BY s.code").bind(workId).all(),
    db.prepare('SELECT ev.id,ev.edition_id AS editionId,ev.event_type AS type,ev.date_value AS date,ev.publisher_id AS publisherId,o.name AS publisher FROM publication_events ev JOIN editions e ON e.id=ev.edition_id LEFT JOIN organisations o ON o.id=ev.publisher_id WHERE e.work_id=? ORDER BY ev.rowid DESC').bind(workId).all(),
    db.prepare('SELECT id,recording_title AS title FROM audio_recordings WHERE work_id=?').bind(workId).all(),
    db.prepare("SELECT c.id,c.recording_id AS recordingId,c.person_id AS personId,p.preferred_name AS name,c.role_code AS role FROM contributions c JOIN people p ON p.id=c.person_id JOIN audio_recordings r ON r.id=c.recording_id WHERE r.work_id=? AND c.role_code IN ('narrator','cast') ORDER BY c.credit_order").bind(workId).all(),
    db.prepare('SELECT ws.id,ws.subject_id AS subjectId,s.label AS name FROM work_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.work_id=? ORDER BY s.label').bind(workId).all(),
    db.prepare("SELECT l.entity_kind AS kind,l.entity_id AS entityId,l.asset_id AS assetId FROM media_links l WHERE l.is_primary=1 AND ((l.entity_kind='work' AND l.entity_id=?) OR (l.entity_kind='edition' AND l.entity_id IN (SELECT id FROM editions WHERE work_id=?))) ORDER BY l.rowid DESC")
     .bind(workId,workId).all()
   ]);
   return json({editions:editions.results,identifiers:identifiers.results,events:events.results,recordings:recordings.results,credits:credits.results,genres:genres.results,covers:covers.results});
  }
  if(request.method!=='POST')return fail('Method not supported',405);
  const raw:unknown=await request.json().catch(()=>null);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('Expected a JSON object');
  const body=raw as Record<string,unknown>;
  const action=clean(body.action,32);
  if(action==='identifier'){
   const editionId=clean(body.editionId,100),code=clean(body.code,10).toUpperCase(),value=clean(body.value,100);
   if(!await ownership(db,workId,'editions',editionId))return fail('Edition does not belong to this book',404);
   if(!identifierCodes.has(code)||!value)return fail('Choose an identifier type and enter its value');
   const normalized=value.replace(/[\s-]/g,'').toUpperCase();
   if(code==='ISBN13'&&!validIsbn13(value))return fail('ISBN-13 check digit is invalid');
   if(code==='ISBN10'&&!validIsbn10(value))return fail('ISBN-10 check digit is invalid');
   if(code==='ASIN'&&!/^[A-Z0-9]{10}$/.test(normalized))return fail('ASIN must have exactly ten letters or digits');
   const current=await db.prepare("SELECT i.id,i.value,i.scheme_id AS schemeId FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id WHERE i.entity_kind='edition' AND i.entity_id=? AND s.code=? LIMIT 2")
    .bind(editionId,code).all<{id:string;value:string;schemeId:string}>();
   if(current.results.length>1)return fail('Multiple identifiers of this type require manual review',409);
   const collision=await db.prepare("SELECT i.id FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id WHERE i.normalized_value=? AND s.code=? AND (i.entity_kind!='edition' OR i.entity_id!=?) LIMIT 1")
    .bind(normalized,code,editionId).first();
   if(collision)return fail('This identifier already belongs to a different catalogue record',409);
   if(current.results[0]?.value.replace(/[\s-]/g,'').toUpperCase()===normalized)return json({saved:true,unchanged:true});
   const edits:Statement[]=[];
   let schemeId=current.results[0]?.schemeId;
   if(!schemeId){
    const scheme=await db.prepare('SELECT id FROM identifier_schemes WHERE code=?').bind(code).first<{id:string}>();
    schemeId=scheme?.id||uuid();
    if(!scheme)edits.push(db.prepare("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES(? ,?,'edition','global')").bind(schemeId,code));
   }
   if(current.results[0])edits.push(db.prepare('UPDATE entity_identifiers SET value=?,normalized_value=? WHERE id=?').bind(value,normalized,current.results[0].id));
   else edits.push(db.prepare("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES(?,?,'edition',?,?,?)")
    .bind(uuid(),schemeId,editionId,value,normalized));
   edits.push(details(db,actor,'edit_edition_identifier',workId,{editionId,code,oldValue:current.results[0]?.value||null,newValue:value}));
   return changed(db,edits);
  }
  if(action==='publication'){
   const editionId=clean(body.editionId,100),eventId=clean(body.eventId,100),type=clean(body.type,32),date=clean(body.date,10),publisherId=clean(body.publisherId,100);
   if(!await ownership(db,workId,'editions',editionId))return fail('Edition does not belong to this book',404);
   if(!publicationTypes.has(type)||!partialDate(date))return fail('Choose a valid publication event and date');
   if(publisherId){
    if(!safe(publisherId)||!await db.prepare('SELECT organisation_id FROM publishers WHERE organisation_id=?').bind(publisherId).first())return fail('Choose an existing publisher');
   }
   if(eventId){
    if(!safe(eventId)||!await db.prepare('SELECT id FROM publication_events WHERE id=? AND edition_id=?').bind(eventId,editionId).first())return fail('Event does not belong to this edition',404);
    return changed(db,[db.prepare('UPDATE publication_events SET event_type=?,date_value=?,publisher_id=? WHERE id=? AND edition_id=?')
     .bind(type,date||null,publisherId||null,eventId,editionId),
     details(db,actor,'edit_publication_event',workId,{editionId,eventId,type,date,publisherId})]);
   }
   const duplicate=await db.prepare('SELECT id FROM publication_events WHERE edition_id=? AND event_type=? AND COALESCE(date_value,\'\')=? AND COALESCE(publisher_id,\'\')=? LIMIT 1')
    .bind(editionId,type,date,publisherId).first();
   if(duplicate)return fail('That publication event is already linked to this edition',409);
   return changed(db,[db.prepare('INSERT INTO publication_events(id,edition_id,event_type,date_value,publisher_id) VALUES(?,?,?,?,?)')
    .bind(uuid(),editionId,type,date||null,publisherId||null),details(db,actor,'add_publication_event',workId,{editionId,type,date,publisherId})]);
  }
  if(action==='credit'){
   const recordingId=clean(body.recordingId,100),personId=clean(body.personId,100),role=clean(body.role,20)||'narrator';
   if(!await ownership(db,workId,'audio_recordings',recordingId))return fail('Recording does not belong to this book',404);
   if(!['narrator','cast'].includes(role)||!safe(personId)||!await db.prepare("SELECT id FROM people WHERE id=? AND identity_status NOT IN ('merged','suppressed')").bind(personId).first())
    return fail('Choose an existing narrator or cast member');
   const duplicate=await db.prepare('SELECT id FROM contributions WHERE recording_id=? AND person_id=? AND role_code=? LIMIT 1').bind(recordingId,personId,role).first();
   if(duplicate)return fail('Contributor already credited on this recording',409);
   return changed(db,[db.prepare('INSERT INTO contributions(id,person_id,recording_id,role_code) VALUES(?,?,?,?)')
    .bind(uuid(),personId,recordingId,role),details(db,actor,'add_recording_credit',workId,{recordingId,personId,role})]);
  }
  if(action==='removeCredit'){
   const creditId=clean(body.creditId,100);
   if(!safe(creditId))return fail('Invalid credit ID');
   const credit=await db.prepare('SELECT c.id,c.person_id AS personId,c.recording_id AS recordingId FROM contributions c JOIN audio_recordings r ON r.id=c.recording_id WHERE c.id=? AND r.work_id=? AND c.role_code IN (\'narrator\',\'cast\')')
    .bind(creditId,workId).first();
   if(!credit)return fail('This credit is not linked to the book',404);
   return changed(db,[db.prepare('DELETE FROM contributions WHERE id=?').bind(creditId),details(db,actor,'remove_recording_credit',workId,credit)]);
  }
  if(action==='genre'){
   const genre=clean(body.genre,120);
   if(genre.length<2)return fail('Enter a genre of at least two characters');
   let scheme=await db.prepare("SELECT id FROM classification_schemes WHERE scheme_code='CAS_GENRE'").first<{id:string}>();
   const updates:Statement[]=[];
   if(!scheme){scheme={id:uuid()};updates.push(db.prepare("INSERT INTO classification_schemes(id,scheme_code) VALUES(?,'CAS_GENRE')").bind(scheme.id));}
   let subject=await db.prepare('SELECT id FROM subjects WHERE scheme_id=? AND lower(trim(label))=lower(?) LIMIT 1').bind(scheme.id,genre).first<{id:string}>();
   if(!subject){subject={id:uuid()};updates.push(db.prepare('INSERT INTO subjects(id,scheme_id,code,label) VALUES(?,?,?,?)').bind(subject.id,scheme.id,subject.id,genre));}
   const existing=await db.prepare('SELECT id FROM work_subjects WHERE work_id=? AND subject_id=?').bind(workId,subject.id).first();
   if(existing)return fail('This genre is already assigned to the book',409);
   updates.push(db.prepare('INSERT INTO work_subjects(id,work_id,subject_id,primary_flag) VALUES(?,?,?,0)').bind(uuid(),workId,subject.id));
   updates.push(details(db,actor,'add_work_genre',workId,{genre,subjectId:subject.id}));
   return changed(db,updates);
  }
  if(action==='removeGenre'){
   const linkId=clean(body.linkId,100);
   if(!safe(linkId)||!await db.prepare('SELECT id FROM work_subjects WHERE id=? AND work_id=?').bind(linkId,workId).first())return fail('Genre is not linked to this book',404);
   return changed(db,[db.prepare('DELETE FROM work_subjects WHERE id=? AND work_id=?').bind(linkId,workId),
    details(db,actor,'remove_work_genre',workId,{linkId})]);
  }
  return fail('Unknown metadata operation',404);
 }catch(error){
  console.error('Book metadata editor:',error);
  return fail('Unable to save catalogue metadata. The changes were not confirmed.',409);
 }
}
