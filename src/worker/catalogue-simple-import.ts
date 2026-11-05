/**
 * Simple, owner-operated catalogue importer.
 * One work + one ISBN-linked edition per click. No public publishing,
 * no image persistence, no bulk harvesting and no duplicate catalogue.
 * Search results are never trusted for writes: import re-fetches the source.
 */
import {lookupISBNdbEdition,searchISBNdbBooks} from './catalogue-isbndb-resolver.js';
type Scalar=string|number|null;
interface Statement {
 bind(...args:Scalar[]):Statement;
 first<T>():Promise<T|null>;
 all<T>():Promise<{results:T[]}>;
 run():Promise<unknown>;
}
export interface SimpleCatalogueDB {
 prepare(sql:string):Statement;
 batch(statements:Statement[]):Promise<unknown[]>;
}
export type BookSuggestion={
 key:string;title:string;author:string;isbn13:string|null;publisher:string|null;
 publishedDate:string|null;pages:number|null;coverUrl:string|null;previewCoverUrl?:string|null;language:string|null;source:'Google Books'|'Open Library'|'ISBNdb';
};
export type BookDetail=BookSuggestion&{
 synopsis:string|null;synopsisSource:'Open Library'|'Google Books'|null;
 format:string;complete:boolean;missing:string[];sourceUrl:string;
 coverKind:'edition'|'work'|null;coverWorkKey:string|null;coverId:number|null;
 researchOnly?:boolean;
};
const str=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const isbn=(v:unknown)=>str(v,30).replace(/[\s-]/g,'');
const validIsbn=(v:string)=>/^\d{13}$/.test(v)&&[...v].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10===0;
const isbn13Of=(v:unknown)=>{
 const value=isbn(v);
 if(validIsbn(value))return value;
 if(!/^\d{9}[\dXx]$/.test(value))return null;
 const clean=value.toUpperCase();
 const sum=[...clean].reduce((total,d,i)=>total+(10-i)*(d==='X'?10:Number(d)),0);
 if(sum%11!==0)return null;
 const prefix='978'+clean.slice(0,9);
 const check=(10-([...prefix].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10))%10;
 return prefix+check;
};
const norm=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const date=(v:unknown)=>{const x=str(v,32);return /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(x)?x:null};
const pages=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=100000?v:null;
/** Leave unknown language unset; never infer language from a title, author or publisher. */
const language=(v:unknown)=>{
 const code=str(v,40).toLowerCase().replace(/^\/languages\//,'');
 if(code==='eng'||code==='en'||code==='en-gb'||code==='en-us')return 'en';
 if(code==='spa'||code==='es')return 'es';
 if(code==='fre'||code==='fra'||code==='fr')return 'fr';
 if(code==='ger'||code==='deu'||code==='de')return 'de';
 if(code==='ita'||code==='it')return 'it';
 if(code==='por'||code==='pt')return 'pt';
 return /^[a-z]{2,3}$/.test(code)?code:null;
};
const languageRank=(code:string|null)=>code==='en'?0:code===null?1:2;
const cleanDescription=(v:unknown)=>{
 const raw=typeof v==='string'?v:typeof v==='object'&&v!==null&&'value' in v?String((v as {value:unknown}).value??''):'';
 return raw.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,8000)||null;
};
const formatOf=(v:unknown)=>{
 const t=str(v,100).toLowerCase();
 return t.includes('paperback')?'paperback':t.includes('hardcover')||t.includes('hardback')?'hardback':
  t.includes('ebook')||t.includes('electronic')?'ebook':'unknown';
};
const uuid=()=>crypto.randomUUID();
const metadata=(d:BookDetail)=>{
 const missing=['title','author','isbn13','publisher','publishedDate','pages','synopsis','coverUrl']
  .filter(k=>!d[k as keyof BookDetail]);
 return {...d,missing,complete:missing.length===0};
};
type GVolume={id?:string;volumeInfo?:{
 title?:string;authors?:string[];publisher?:string;publishedDate?:string;description?:string;language?:string;
 pageCount?:number;industryIdentifiers?:{type?:string;identifier?:string}[];
 imageLinks?:{thumbnail?:string;smallThumbnail?:string};
}};
type OSearch={key?:string;title?:string;author_name?:string[];first_publish_year?:number;cover_i?:number;language?:string[]};
type OEdition={key?:string;title?:string;isbn_13?:string[];isbn_10?:string[];publishers?:string[];publish_date?:string;
 number_of_pages?:number;physical_format?:string;description?:unknown;covers?:number[];languages?:{key?:string}[]};
type OWork={title?:string;description?:unknown;authors?:{author?:{key?:string};key?:string}[]};
async function fetchJson<T>(address:string,userAgent:string):Promise<T>{
 const res=await fetch(address,{headers:{Accept:'application/json','User-Agent':userAgent},
  signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Book source returned HTTP '+res.status);
 return await res.json() as T;
}
const googleUrl=(q:string,key?:string)=>{
 const url=new URL('https://www.googleapis.com/books/v1/volumes');
 url.searchParams.set('q',q);url.searchParams.set('maxResults','20');url.searchParams.set('printType','books');
 if(key)url.searchParams.set('key',key);
 return url.toString();
};
const googleById=(id:string,key?:string)=>{
 const url=new URL('https://www.googleapis.com/books/v1/volumes/'+encodeURIComponent(id));
 if(key)url.searchParams.set('key',key);
 return url.toString();
};
/** Search-only thumbnail from the provider's volume listing.
 * A grouped Google volume may represent a different printing: NEVER save this
 * thumbnail as an ISBN-verified edition cover.
 */
export function googlePreviewCover(raw:unknown):string|null{
 const value=str(raw,2000);
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
  if(!['books.google.com','books.googleusercontent.com'].includes(url.hostname))return null;
  url.protocol='https:';
  return url.toString();
 }catch{return null}
}
function googleSuggestion(v:GVolume):BookSuggestion|null{
 const info=v.volumeInfo;
 if(!v.id||!info?.title||!info.authors?.[0])return null;
 const code=info.industryIdentifiers?.find(x=>x.type==='ISBN_13'&&validIsbn(isbn(x.identifier)))||
  info.industryIdentifiers?.find(x=>x.type==='ISBN_10'&&isbn13Of(x.identifier));
 return {key:'g:'+v.id,title:str(info.title),author:str(info.authors[0]),
  isbn13:code?isbn13Of(code.identifier):null,publisher:str(info.publisher)||null,
  publishedDate:date(info.publishedDate),pages:pages(info.pageCount),language:language(info.language),
  coverUrl:editionCover(code?isbn13Of(code.identifier):null),
  previewCoverUrl:googlePreviewCover(info.imageLinks?.thumbnail)||googlePreviewCover(info.imageLinks?.smallThumbnail),
  source:'Google Books'};
}
/** All edition previews use the same ISBN-backed cover URL as the public catalogue.
 * A work's representative artwork is not evidence for any individual edition.
 */
const editionCover=(code:string|null)=>code?'https://covers.openlibrary.org/b/isbn/'+code+'-L.jpg?default=false':null;
/** Verify the actual source-hosted image before offering it for import.
 * A plausible ISBN URL is not proof that the image exists.
 */
async function availableCover(url:string|null):Promise<boolean>{
 if(!url||!url.startsWith('https://covers.openlibrary.org/b/'))return false;
 try{
  const response=await fetch(url,{headers:{Accept:'image/jpeg,image/*'},
   signal:AbortSignal.timeout(9000),redirect:'follow'});
  const valid=response.ok&&(response.headers.get('content-type')||'').toLowerCase().startsWith('image/');
  if(response.body)await response.body.cancel();
  return valid;
 }catch{return false}
}
async function representativeFor(workKey:string,title:string,author:string,contact:string){
 if(!/^\/works\/OL\d+W$/.test(workKey)||!author)return null;
 try{
  const query=new URL('https://openlibrary.org/search.json');
  query.searchParams.set('title',title);query.searchParams.set('author',author);
  query.searchParams.set('fields','key,title,author_name,cover_i');query.searchParams.set('limit','20');
  const response=await fetchJson<{docs?:OSearch[]}>(query.toString(),olAgent(contact));
  const found=response.docs?.find(d=>d.key===workKey&&norm(d.title||'')===norm(title)&&
   d.author_name?.some(name=>norm(name)===norm(author))&&Number.isSafeInteger(d.cover_i)&&Number(d.cover_i)>0);
  if(!found?.cover_i)return null;
  const url='https://covers.openlibrary.org/b/id/'+found.cover_i+'-L.jpg?default=false';
  return await availableCover(url)?{coverUrl:url,coverWorkKey:workKey,coverId:found.cover_i}:null;
 }catch{return null}
}

const olAgent=(contact:string)=>'ChapterAndSoundCatalogue/0.2 ('+contact+')';
export async function findSimpleBooks(query:string,contact:string,googleKey?:string,isbnDbKey?:string){
 const q=str(query,120);
 if(q.length<2)throw Error('Enter an author, title or ISBN');
 const numeric=isbn(q);const byIsbn=/^(?:\d{9}[\dXx]|\d{13})$/.test(numeric);
 const expected=byIsbn?isbn13Of(numeric):null;
 const ol=new URL('https://openlibrary.org/search.json');
 if(byIsbn)ol.searchParams.set('isbn',numeric);
 else ol.searchParams.set('q',q);
 ol.searchParams.set('fields','key,title,author_name,first_publish_year,cover_i,language');
 ol.searchParams.set('limit','12');
 const sourceAgent=olAgent(contact);
 const [google,open,isbnDb]=await Promise.allSettled([
  fetchJson<{items?:GVolume[]}>(googleUrl(byIsbn?'isbn:'+numeric:q,googleKey),sourceAgent),
  fetchJson<{docs?:OSearch[]}>(ol.toString(),sourceAgent),
  // ISBNdb is an exact-ISBN source, never a bulk title-search source.
  isbnDbKey?(expected?lookupISBNdbEdition(expected,isbnDbKey):searchISBNdbBooks(q,isbnDbKey)):Promise.resolve(null)
 ]);
 if(google.status==='rejected'&&open.status==='rejected'&&!(isbnDb.status==='fulfilled'&&isbnDb.value?.status==='matched'))throw Error('Book search providers are temporarily unavailable');
 const found:BookSuggestion[]=[];
 if(google.status==='fulfilled')for(const item of google.value.items||[]){
  const candidate=googleSuggestion(item);if(candidate&&(!byIsbn||candidate.isbn13===expected))found.push(candidate);
 }
 if(open.status==='fulfilled')for(const item of open.value.docs||[]){
  if(!/^\/works\/OL\d+W$/.test(item.key||'')||!item.title||!item.author_name?.[0])continue;
  found.push({key:'o:'+item.key!.split('/').pop(),title:str(item.title),author:str(item.author_name[0]),
   isbn13:null,publisher:null,publishedDate:date(item.first_publish_year?String(item.first_publish_year):''),
   pages:null,language:item.language?.map(language).find(x=>x==='en')||language(item.language?.[0]),
   coverUrl:item.cover_i?'https://covers.openlibrary.org/b/id/'+item.cover_i+'-M.jpg':null,source:'Open Library'});
 }
 const isbnDbCandidates=isbnDb.status==='fulfilled'&&isbnDb.value?.status==='matched'?
  ('books' in isbnDb.value?isbnDb.value.books.length:1):0;
 const resultsBeforeIsbnDb=found.length;
 // ISBNdb search gives up to 20 matching editions in ONE provider request.
 // Do not duplicate another exact ISBN result, and never treat candidates as verified covers.
 if(isbnDb.status==='fulfilled'&&isbnDb.value){
  const response=isbnDb.value;
  const editions=response.status==='matched'?
   ('books' in response?response.books:[response.edition]):[];
  for(const d of editions){
   if(!d?.isbn13||found.some(item=>item.isbn13===d.isbn13))continue;
   found.push({key:'i:'+d.isbn13,title:d.title,author:d.authors[0]||'',isbn13:d.isbn13,
    publisher:d.publisher,publishedDate:d.publishedDate,pages:d.pageCount,
    coverUrl:null,language:d.language,source:'ISBNdb'});
  }
 }
 // Prefer explicitly identified English results for title/author searches; preserve exact-ISBN search ordering.
 if(!byIsbn)found.sort((a,b)=>languageRank(a.language)-languageRank(b.language));
 return {items:found.slice(0,60),sources:{
  google:google.status==='fulfilled'?'available':'unavailable',
  openLibrary:open.status==='fulfilled'?'available':'unavailable',
  isbnDb:isbnDb.status==='fulfilled'?(isbnDb.value?.status||'not_configured'):'unavailable'
 },diagnostics:{googleCandidates:google.status==='fulfilled'?(google.value.items||[]).length:0,
  openLibraryCandidates:open.status==='fulfilled'?(open.value.docs||[]).length:0,
  isbnDbCandidates,isbnDbNewEditions:found.length-resultsBeforeIsbnDb,
  isbnDbReason:isbnDb.status==='fulfilled'&&isbnDb.value&&'reason' in isbnDb.value?isbnDb.value.reason:null}};
}
async function olEditionByIsbn(code:string,contact:string):Promise<{edition:OEdition;work:OWork|null}|null>{
 if(!validIsbn(code))return null;
 const agent=olAgent(contact);
 try{
  const edition=await fetchJson<OEdition>('https://openlibrary.org/isbn/'+code+'.json',agent);
  const workKey=(edition as OEdition&{works?:{key?:string}[]}).works?.[0]?.key;
  let work:OWork|null=null;
  if(workKey&&/^\/works\/OL\d+W$/.test(workKey))
   try{work=await fetchJson<OWork>('https://openlibrary.org'+workKey+'.json',agent)}catch{}
  return {edition,work};
 }catch{return null}
}
export async function getSimpleBook(key:string,contact:string,googleKey?:string,isbnDbKey?:string):Promise<BookDetail>{
 const agent=olAgent(contact);
 if(/^i:97[89]\\d{10}$/.test(key)){
  const result=await lookupISBNdbEdition(key.slice(2),isbnDbKey);
  if(result.status!=='matched')throw Error('ISBNdb edition research is unavailable. Search again later.');
  const d=result.edition;
  return metadata({key,title:d.title,author:d.authors[0]||'',isbn13:d.isbn13,
   publisher:d.publisher,publishedDate:d.publishedDate,pages:d.pageCount,
   coverUrl:null,language:d.language,source:'ISBNdb',synopsis:null,synopsisSource:null,
   format:d.format||'unknown',complete:false,missing:[],sourceUrl:'https://isbndb.com',
   coverKind:null,coverWorkKey:null,coverId:null,researchOnly:true});
 }
 if(/^g:[a-zA-Z0-9_-]{1,100}$/.test(key)){
  const volume=await fetchJson<GVolume>(googleById(key.slice(2),googleKey),agent);
  const suggestion=googleSuggestion(volume);
  if(!suggestion)throw Error('This Google Books result has no title or author');
  const ol=suggestion.isbn13?await olEditionByIsbn(suggestion.isbn13,contact):null;
  const edition=ol?.edition;
  const desc=cleanDescription(edition?.description)||cleanDescription(ol?.work?.description);
  const googleDesc=cleanDescription(volume.volumeInfo?.description);
  const coverUrl=editionCover(suggestion.isbn13);
  const hasCover=await availableCover(coverUrl);
  return metadata({...suggestion,
   coverUrl:hasCover?coverUrl:null,coverKind:hasCover?'edition':null,coverWorkKey:null,coverId:null,
   publisher:suggestion.publisher||str(edition?.publishers?.[0])||null,
   publishedDate:suggestion.publishedDate||date(edition?.publish_date),
   pages:suggestion.pages||pages(edition?.number_of_pages),
   format:formatOf(edition?.physical_format),
   language:suggestion.language||language(edition?.languages?.[0]?.key),
   synopsis:desc||googleDesc,
   synopsisSource:desc?'Open Library':googleDesc?'Google Books':null,
   sourceUrl:'https://books.google.com/books?id='+encodeURIComponent(key.slice(2)),complete:false,missing:[]});
 }
 if(/^o:OL\d+W$/.test(key)){
  const wkey='/works/'+key.slice(2);
  const work=await fetchJson<OWork>('https://openlibrary.org'+wkey+'.json',agent);
  const data=await fetchJson<{entries?:OEdition[]}>('https://openlibrary.org'+wkey+'/editions.json?limit=20',agent);
  const entries=(data.entries||[]).filter(e=>[...(e.isbn_13||[]),...(e.isbn_10||[])].some(x=>isbn13Of(x)));
  const ranking=(e:OEdition)=>languageRank(language(e.languages?.[0]?.key))*10+
   (!str(e.publishers?.[0])?2:0)+(!date(e.publish_date)?2:0)+(!pages(e.number_of_pages)?1:0);
  const candidate=entries.sort((a,b)=>ranking(a)-ranking(b))[0];
  if(!candidate)throw Error('No identified edition found for this title. Search by ISBN instead.');
  const code=[...(candidate.isbn_13||[]),...(candidate.isbn_10||[])].map(isbn13Of).find(Boolean)||null;
  const desc=cleanDescription(work.description)||cleanDescription(candidate.description);
  const authorKey=work.authors?.[0]?.author?.key||work.authors?.[0]?.key;
  let author='';
  if(authorKey&&/^\/authors\/OL\d+A$/.test(authorKey)){
   try{const person=await fetchJson<{name?:string}>('https://openlibrary.org'+authorKey+'.json',agent);author=str(person.name)}
   catch{}
  }
  if(!author)throw Error('This Open Library work has no confirmed author. Search the title in Google Books.');
  const directCover=editionCover(code);
  const editionHasCover=await availableCover(directCover);
  const representative=editionHasCover?null:await representativeFor(wkey,str(work.title)||str(candidate.title),author,contact);
  return metadata({key,title:str(work.title)||str(candidate.title),author,isbn13:code,
   coverKind:editionHasCover?'edition':representative?'work':null,
   coverWorkKey:representative?.coverWorkKey||null,coverId:representative?.coverId||null,
   publisher:str(candidate.publishers?.[0])||null,publishedDate:date(candidate.publish_date),
   pages:pages(candidate.number_of_pages),language:language(candidate.languages?.[0]?.key),
   coverUrl:editionHasCover?directCover:representative?.coverUrl||null,
   source:'Open Library',format:formatOf(candidate.physical_format),synopsis:desc,
   synopsisSource:desc?'Open Library':null,sourceUrl:'https://openlibrary.org'+wkey,complete:false,missing:[]});
 }
 throw Error('Unknown book reference');
}
export async function importSimpleBook(db:SimpleCatalogueDB,key:string,expectedIsbn:string,contact:string,actor:string,
 googleKey?:string,originalSynopsis?:string,reviewedFormat?:string):Promise<{created:boolean;id:string;status:string;editionId?:string}>{
 if(key.startsWith('i:'))throw Error('ISBNdb matches are research-only until provider storage and cover rights have been reviewed. No catalogue records were written.');
 const book=await getSimpleBook(key,contact,googleKey);
 const permittedFormats=['paperback','hardback','ebook'] as const;
 if(reviewedFormat&&(!permittedFormats.includes(reviewedFormat as typeof permittedFormats[number])||book.format!=='unknown'&&reviewedFormat!==book.format))
  throw Error('Format selection conflicts with the verified edition information.');
 const selectedFormat=book.format==='unknown'?reviewedFormat:book.format;
 const ownSynopsis=str(originalSynopsis,8000);
 const selectedSynopsis=ownSynopsis||((book.synopsisSource==='Open Library')?book.synopsis:null);
 const code=isbn(expectedIsbn);
 if(!validIsbn(code)||book.isbn13!==code)throw Error('The ISBN changed since your search; refresh the result');
 if(!book.title||!book.author||!book.publisher||!book.publishedDate||!book.pages)
  throw Error('This edition is missing a title, author, publisher, release date or page count. Choose a more complete result.');
 if(!selectedFormat||!permittedFormats.includes(selectedFormat as typeof permittedFormats[number]))
  throw Error('Choose a verified paperback, hardback or ebook format before importing.');
 if(!selectedSynopsis)
  throw Error('An original or authorised synopsis is required to import this book. Google Books descriptions are preview only.');
 const match=await db.prepare("SELECT i.entity_id AS editionId,e.work_id AS workId FROM entity_identifiers i JOIN identifier_schemes s ON s.id=i.scheme_id JOIN editions e ON e.id=i.entity_id WHERE s.code='ISBN13' AND i.normalized_value=? AND i.entity_kind='edition' LIMIT 2").bind(code).all<{editionId:string;workId:string}>();
 if(match.results.length>1)throw Error('Multiple editions already use this ISBN. Resolve the catalogue identity first.');
 if(match.results.length===1)return {created:false,id:match.results[0]!.workId,status:'already_in_catalogue',editionId:match.results[0]!.editionId};
 const people=await db.prepare("SELECT id,preferred_name AS name FROM people WHERE identity_status NOT IN ('merged','suppressed') AND lower(preferred_name)=lower(?) LIMIT 3").bind(book.author).all<{id:string;name:string}>();
 if(people.results.length>1)throw Error('Multiple authors share this name; resolve the author identity before importing.');
 const authorId=people.results[0]?.id||uuid();
 const titles=await db.prepare("SELECT w.id,w.canonical_title AS title FROM works w JOIN contributions c ON c.work_id=w.id AND c.role_code IN ('author','coauthor') WHERE c.person_id=? LIMIT 500").bind(authorId).all<{id:string;title:string}>();
 if(titles.results.length>=500)throw Error('Author catalogue is too large for a safe duplicate check; use the existing book editor.');
 const existing=titles.results.filter(x=>norm(x.title)===norm(book.title));
 if(existing.length>1)throw Error('Multiple matching works already exist; resolve these before importing.');
 if(existing.length===1)return {created:false,id:existing[0]!.id,status:'already_in_catalogue'};
 if(!book.coverUrl||!book.coverKind||!await availableCover(book.coverUrl))
  throw Error('No verified cover image is available for this book. Nothing was imported. Choose another result with a cover.');

 const pub=await db.prepare("SELECT organisation_id AS id FROM publishers p JOIN organisations o ON o.id=p.organisation_id WHERE lower(o.name)=lower(?) LIMIT 2").bind(book.publisher).all<{id:string}>();
 if(pub.results.length>1)throw Error('Multiple publisher identities matched; review required.');
 const publisherId=pub.results[0]?.id||uuid(),workId=uuid(),editionId=uuid(),scheme=await db.prepare("SELECT id FROM identifier_schemes WHERE code='ISBN13'").first<{id:string}>();
 const schemeId=scheme?.id||uuid();
 const stmts:Statement[]=[];
 if(!people.results.length)stmts.push(db.prepare('INSERT INTO people(id,preferred_name) VALUES(?,?)').bind(authorId,book.author));
 if(!pub.results.length){
  stmts.push(db.prepare("INSERT INTO organisations(id,name,organisation_type) VALUES(?,?,'publisher')").bind(publisherId,book.publisher));
  stmts.push(db.prepare('INSERT INTO publishers(organisation_id) VALUES(?)').bind(publisherId));
 }
 if(!scheme)stmts.push(db.prepare("INSERT INTO identifier_schemes(id,code,entity_scope,uniqueness_scope) VALUES(?,'ISBN13','edition','global')").bind(schemeId));
 stmts.push(db.prepare("INSERT INTO works(id,canonical_title,status) VALUES(?,?,'draft')").bind(workId,book.title));
 if(book.coverKind==='work'){
  if(!book.coverWorkKey||!book.coverId)throw Error('Representative cover identity missing; nothing was imported.');
  // Idempotently provision only the additive cover table when an owner actually imports matching book art.
  // The canonical 0006 migration uses this exact schema, without modifying existing books.
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_representative_covers(
   work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE RESTRICT,
   openlibrary_work_key TEXT NOT NULL CHECK(openlibrary_work_key GLOB '/works/OL*W'),
   openlibrary_cover_id INTEGER NOT NULL CHECK(openlibrary_cover_id>0),
   chosen_by TEXT NOT NULL,
   chosen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  stmts.push(db.prepare("INSERT INTO work_representative_covers(work_id,openlibrary_work_key,openlibrary_cover_id,chosen_by) VALUES(?,?,?,?)")
   .bind(workId,book.coverWorkKey,book.coverId,actor));
 }
 stmts.push(db.prepare("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES(?,?,?,'author')").bind(uuid(),authorId,workId));
 stmts.push(db.prepare("INSERT INTO editions(id,work_id,format,page_count,language,publication_status,verification_status) VALUES(?,?,?,?,?,'draft','needs_review')").bind(editionId,workId,selectedFormat,book.pages,book.language));
 stmts.push(db.prepare("INSERT INTO entity_identifiers(id,scheme_id,entity_kind,entity_id,value,normalized_value) VALUES(?,?,'edition',?,?,?)").bind(uuid(),schemeId,editionId,code,code));
 stmts.push(db.prepare("INSERT INTO publication_events(id,edition_id,event_type,date_value,publisher_id) VALUES(?,?,'released',?,?)").bind(uuid(),editionId,book.publishedDate,publisherId));
 stmts.push(db.prepare("INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility) VALUES(?,'work',?,'synopsis',?,'private')").bind(uuid(),workId,selectedSynopsis));
 stmts.push(db.prepare("INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,'simple_import','work',?,?)").bind(uuid(),actor,workId,JSON.stringify({source:book.source,sourceUrl:book.sourceUrl,synopsisSource:ownSynopsis?'admin_original':book.synopsisSource,isbn13:code,language:book.language,format:selectedFormat,formatReviewed:book.format==='unknown',coverSource:book.coverKind,coverUrl:book.coverUrl,rightsReviewRequired:true})));
 try{await db.batch(stmts)}catch(e){throw Error('Import could not be completed. The database may already contain this edition; refresh before retrying.')}
 return {created:true,id:workId,editionId,status:'draft'};
}
