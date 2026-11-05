/**
 * Read-only exact-ISBN reconciliation for the next Chapter & Sound importer.
 * No database writes; never persists metadata or third-party descriptions.
 * One ISBNdb request, one Google ISBN query and one OL edition lookup maximum.
 */
import {lookupISBNdbEdition,type ISBNdbLookup} from './catalogue-isbndb-resolver.js';

export type EvidenceSource='ISBNdb'|'Google Books'|'Open Library';
type Claim<T=string|number>= {source:EvidenceSource;value:T};
type ResolvedField<T=string|number>={value:T|null;source:EvidenceSource|null;claims:Claim<T>[];conflict:boolean};
type EditionEvidence={source:EvidenceSource;isbn13:string;title:string|null;authors:string[];
 publisher:string|null;publishedDate:string|null;pages:number|null;language:string|null;
 format:string|null;coverCandidateUrl:string|null;descriptionAvailable:boolean};
export type ISBNResolution={
 isbn13:string;status:'ready_for_review'|'incomplete'|'conflict'|'unavailable';
 fields:{title:ResolvedField<string>;author:ResolvedField<string>;publisher:ResolvedField<string>;
 publishedDate:ResolvedField<string>;pages:ResolvedField<number>;language:ResolvedField<string>;format:ResolvedField<string>};
 coverCandidates:{source:EvidenceSource;url:string;isbn13:string;verifiedImage:false}[];
 sourceStatus:Record<EvidenceSource,string>;
 sourceDiagnostics:Record<EvidenceSource,string>;
 missing:string[];conflicts:string[];evidence:EditionEvidence[];
 canImport:false;
};
const text=(x:unknown,max=500)=>typeof x==='string'?x.trim().slice(0,max):'';
const normalized=(x:string)=>x.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const isbnValid=(v:string)=>/^97[89]\d{10}$/.test(v)&&[...v].reduce((a,b,i)=>a+Number(b)*(i%2?3:1),0)%10===0;
const isbn13=(v:unknown)=>{
 const t=text(v,30).replace(/[\s-]/g,'').toUpperCase();
 if(isbnValid(t))return t;
 if(!/^\d{9}[\dX]$/.test(t))return null;
 if([...t].reduce((a,b,i)=>a+(10-i)*(b==='X'?10:Number(b)),0)%11!==0)return null;
 const base='978'+t.slice(0,9);
 return base+((10-[...base].reduce((a,b,i)=>a+Number(b)*(i%2?3:1),0)%10)%10);
};
const firstIsbn=(x:unknown)=>{
 if(!Array.isArray(x))return null;
 return x.map(isbn13).find(Boolean)||null;
};
const language=(v:unknown)=>{
 const s=text(v,50).toLowerCase().replace(/^\/languages\//,'');
 const aliases:Record<string,string>={english:'en',eng:'en',spanish:'es',spa:'es',dutch:'nl',dut:'nl',nld:'nl',french:'fr',fra:'fr',fre:'fr',german:'de',ger:'de',deu:'de'};
 return aliases[s]||(/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(s)?s.slice(0,2):null);
};
const format=(v:unknown)=>{
 const s=text(v,100).toLowerCase();
 if(/\b(paperback|softcover|softback|mass.market|trade.paper)\b/.test(s))return 'paperback';
 if(/\b(hardcover|hardback|hard.cover)\b/.test(s))return 'hardback';
 if(/\b(ebook|e.book|electronic.book|epub)\b/.test(s))return 'ebook';
 return null;
};
const date=(v:unknown)=>/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(text(v,30))?text(v,30):null;
const pages=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=100000?v:null;
const cover=(v:unknown)=>{
 try{const u=new URL(text(v,1200));return u.protocol==='https:'?u.toString():null}catch{return null}
};
const empty=(source:EvidenceSource,code:string):EditionEvidence=>({
 source,isbn13:code,title:null,authors:[],publisher:null,publishedDate:null,pages:null,language:null,
 format:null,coverCandidateUrl:null,descriptionAvailable:false
});
async function json(url:string,fetchImpl:typeof fetch):Promise<unknown>{
 const res=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'ChapterAndSound/0.3 (owner catalogue research)'},
  signal:AbortSignal.timeout(9000)});
 if(!res.ok)throw Error('HTTP_'+res.status);
 return res.json();
}
async function fromGoogle(code:string,key:string|undefined,fetchImpl:typeof fetch){
 const url=new URL('https://www.googleapis.com/books/v1/volumes');
 url.searchParams.set('q','isbn:'+code);url.searchParams.set('maxResults','10');
 if(key)url.searchParams.set('key',key);
 const data=await json(url.toString(),fetchImpl) as {items?:Array<{volumeInfo?:{
  title?:string;authors?:string[];industryIdentifiers?:{type?:string;identifier?:string}[];
  publisher?:string;publishedDate?:string;pageCount?:number;language?:string;
  description?:string;imageLinks?:{thumbnail?:string}
 }}>};
 const items=data.items||[];
 const exact=items.find(x=>x.volumeInfo?.industryIdentifiers?.some(y=>isbn13(y.identifier)===code));
 if(!exact?.volumeInfo)return {edition:null,diagnostic:items.length?'results_without_exact_isbn':'no_results'} as const;
 const x=exact.volumeInfo;
 return {edition:{source:'Google Books',isbn13:code,title:text(x.title)||null,authors:(x.authors||[]).map(x=>text(x)).filter(Boolean),
  publisher:text(x.publisher)||null,publishedDate:date(x.publishedDate),pages:pages(x.pageCount),
  language:language(x.language),format:null,
  // Google volume art can represent a different ISBN within a grouped volume. Do not treat it as verified edition art.
  coverCandidateUrl:null,descriptionAvailable:Boolean(text(x.description))} as EditionEvidence,diagnostic:'exact_isbn_matched'};
}
async function fromOL(code:string,fetchImpl:typeof fetch){
 const data=await json('https://openlibrary.org/isbn/'+code+'.json',fetchImpl) as {
  title?:string;isbn_13?:string[];isbn_10?:string[];publishers?:string[];publish_date?:string;
  number_of_pages?:number;physical_format?:string;languages?:{key?:string}[];covers?:number[];description?:unknown};
 if(![...(data.isbn_13||[]),...(data.isbn_10||[])].some(x=>isbn13(x)===code))return null;
 const id=(data.covers||[]).find(x=>Number.isSafeInteger(x)&&x>0);
 const authors:string[]=[]; // OL edition author keys require extra resolution, not guessed from work.
 return {source:'Open Library',isbn13:code,title:text(data.title)||null,authors,
  publisher:text(data.publishers?.[0])||null,publishedDate:date(data.publish_date),
  pages:pages(data.number_of_pages),language:language(data.languages?.[0]?.key),
  format:format(data.physical_format),
  coverCandidateUrl:id?'https://covers.openlibrary.org/b/id/'+id+'-L.jpg?default=false':null,
  descriptionAvailable:Boolean(data.description)} as EditionEvidence;
}
function combine<T extends string|number>(rows:EditionEvidence[],property:keyof EditionEvidence):ResolvedField<T>{
 const claims=rows.filter(row=>typeof row[property]==='number'||typeof row[property]==='string').map(row=>({source:row.source,value:row[property] as T}));
 const groups=new Map<string,Claim<T>[]>();
 for(const claim of claims){const key=typeof claim.value==='number'?String(claim.value):normalized(claim.value);
  groups.set(key,[...(groups.get(key)||[]),claim]);}
 const ordered=[...groups.values()].sort((a,b)=>b.length-a.length);
 // Disagreement is explicit, even when one choice is provisionally preferred.
 const chosen=ordered[0]?.[0];
 return {value:chosen?.value??null,source:chosen?.source??null,claims,conflict:groups.size>1};
}
export async function resolveISBNClaims(codeInput:string,opts:{
 isbnDbKey?:string;googleKey?:string;fetchImpl?:typeof fetch;lookupIsbndb?:typeof lookupISBNdbEdition;
}={}):Promise<ISBNResolution>{
 const code=isbn13(codeInput);
 if(!code)throw Error('Invalid ISBN. Enter ISBN-10 or ISBN-13 with a valid check digit.');
 const fetchImpl=opts.fetchImpl||fetch;
 const probe=opts.lookupIsbndb||lookupISBNdbEdition;
 const statuses:Record<EvidenceSource,string>={'ISBNdb':'unavailable','Google Books':'unavailable','Open Library':'unavailable'};
 const diagnostics:Record<EvidenceSource,string>={'ISBNdb':'not_checked','Google Books':'not_checked','Open Library':'not_checked'};
 const [isbnResult,googleResult,olResult]=await Promise.allSettled([
  probe(code,opts.isbnDbKey,fetchImpl),fromGoogle(code,opts.googleKey,fetchImpl),fromOL(code,fetchImpl)
 ]);
 const evidence:EditionEvidence[]=[];
 if(isbnResult.status==='fulfilled'){
  const result:ISBNdbLookup=isbnResult.value;statuses.ISBNdb=result.status;
  diagnostics.ISBNdb=result.status==='matched'?'exact_isbn_matched':result.status==='unavailable'?(result.reason||'request_unavailable'):
   result.status+(result.httpStatus?'_http_'+result.httpStatus:'');
  if(result.status==='matched')evidence.push({source:'ISBNdb',isbn13:code,title:result.edition.title,
   authors:result.edition.authors,publisher:result.edition.publisher,publishedDate:result.edition.publishedDate,
   pages:result.edition.pageCount,language:result.edition.language,format:result.edition.format,
   coverCandidateUrl:result.edition.coverCandidateUrl,descriptionAvailable:result.edition.descriptionAvailable});
 }else {statuses.ISBNdb='request_failed';diagnostics.ISBNdb='unexpected_error';}
 if(googleResult.status==='fulfilled'){
  statuses['Google Books']=googleResult.value.edition?'matched':'not_found';
  diagnostics['Google Books']=googleResult.value.diagnostic;
  if(googleResult.value.edition)evidence.push(googleResult.value.edition);
 }else {
  const match=googleResult.reason instanceof Error?/^HTTP_(\\d{3})$/.exec(googleResult.reason.message):null;
  statuses['Google Books']=match?'HTTP_'+match[1]:'request_failed';
  diagnostics['Google Books']=match?'http_'+match[1]:'network_or_invalid_response';
 }
 if(olResult.status==='fulfilled'){
  statuses['Open Library']=olResult.value?'matched':'not_found';
  diagnostics['Open Library']=olResult.value?'exact_isbn_matched':'no_matching_edition';
  if(olResult.value)evidence.push(olResult.value);
 }else {
  const match=olResult.reason instanceof Error?/^HTTP_(\\d{3})$/.exec(olResult.reason.message):null;
  statuses['Open Library']=match?'HTTP_'+match[1]:'request_failed';
  diagnostics['Open Library']=match?'http_'+match[1]:'network_or_invalid_response';
 }
 const fields={
  title:combine<string>(evidence,'title'),author:combine<string>(evidence.map(e=>({...e,title:e.authors[0]||null})),'title'),
  publisher:combine<string>(evidence,'publisher'),publishedDate:combine<string>(evidence,'publishedDate'),
  pages:combine<number>(evidence,'pages'),language:combine<string>(evidence,'language'),
  format:combine<string>(evidence,'format')
 };
 const conflicts=Object.entries(fields).filter(([,value])=>value.conflict).map(([key])=>key);
 const missing=Object.entries(fields).filter(([,value])=>value.value===null).map(([key])=>key);
 if(fields.language.value!==null&&fields.language.value!=='en')missing.push('English edition not confirmed');
 const coverCandidates=evidence.filter(e=>e.coverCandidateUrl).map(e=>({
  source:e.source,url:e.coverCandidateUrl!,isbn13:code,verifiedImage:false as const
 }));
 if(!coverCandidates.length)missing.push('edition cover');
 const status=conflicts.length?'conflict':missing.length?'incomplete':evidence.length?'ready_for_review':'unavailable';
 return {isbn13:code,status,fields,coverCandidates,sourceStatus:statuses,sourceDiagnostics:diagnostics,missing,conflicts,evidence,canImport:false};
}
