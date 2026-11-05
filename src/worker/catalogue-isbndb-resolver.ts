/**
 * Read-only, owner-initiated ISBNdb edition resolver.
 * NEVER persists provider payloads, descriptions or images. The subscription's
 * display/storage terms must be verified before enabling any write path.
 * This module makes one exact-ISBN request per invocation; no bulk searches.
 */
export type ISBNdbEdition={
 source:'ISBNdb';isbn13:string;title:string;authors:string[];publisher:string|null;
 publishedDate:string|null;pageCount:number|null;language:string|null;
 format:'paperback'|'hardback'|'ebook'|null;bindingLabel:string|null;
 coverCandidateUrl:string|null;descriptionAvailable:boolean;
};
export type ISBNdbLookup=
 |{status:'matched';edition:ISBNdbEdition;rights:'not_reviewed';coverStatus:'not_verified'}
 |{status:'not_found'|'unavailable'|'rate_limited'|'authentication_error'|'provider_error'|'invalid_response'|'isbn_mismatch';httpStatus?:number;message:string;reason?:'not_configured'|'timeout'|'transport_error'|'request_rejected'|'redirect_blocked'};
const str=(x:unknown,max=500)=>typeof x==='string'?x.trim().slice(0,max):'';
const isbn13=(v:string)=>/^97[89]\d{10}$/.test(v)&&[...v].reduce((t,d,i)=>t+Number(d)*(i%2?3:1),0)%10===0;
const isbn10To13=(value:string)=>{
 const v=value.toUpperCase();
 if(!/^\d{9}[\dX]$/.test(v)||[...v].reduce((t,d,i)=>t+(10-i)*(d==='X'?10:Number(d)),0)%11!==0)return null;
 const first='978'+v.slice(0,9);
 return first+((10-[...first].reduce((t,d,i)=>t+Number(d)*(i%2?3:1),0)%10)%10);
};
const normalizedIsbn=(raw:unknown)=>{
 const v=str(raw,30).replace(/[\s-]/g,'');
 return isbn13(v)?v:typeof v==='string'?isbn10To13(v):null;
};
const date=(raw:unknown)=>{
 const v=str(raw,40);
 if(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(v))return v;
 // ISBNdb sometimes returns month names. Do not invent an ISO date from an ambiguous value.
 return null;
};
const language=(raw:unknown)=>{
 const v=str(raw,50).toLowerCase().replace(/^\/languages\//,'');
 if(['english','eng','en','en-us','en-gb'].includes(v))return 'en';
 if(['spanish','spa','es'].includes(v))return 'es';
 if(['dutch','dut','nld','nl'].includes(v))return 'nl';
 if(['french','fra','fre','fr'].includes(v))return 'fr';
 if(['german','deu','ger','de'].includes(v))return 'de';
 return /^[a-z]{2,3}$/.test(v)?v:null;
};
export const bindingFormat=(raw:unknown):ISBNdbEdition['format']=>{
 const s=str(raw,150).toLowerCase().replace(/[-_]/g,' ');
 if(!s)return null;
 const matches=[
  /\b(paperback|mass market|softcover|softback|trade paper)\b/.test(s)?'paperback':null,
  /\b(hardback|hardcover|hard cover|clothbound)\b/.test(s)?'hardback':null,
  /\b(ebook|e book|epub|kindle|electronic book)\b/.test(s)?'ebook':null
 ].filter(Boolean);
 return matches.length===1?matches[0] as ISBNdbEdition['format']:null;
};
const coverUrl=(raw:unknown)=>{
 const v=str(raw,2000);
 if(!v)return null;
 try{const u=new URL(v);return u.protocol==='https:'?u.toString():null}catch{return null}
};
const empty=(status:Exclude<ISBNdbLookup['status'],'matched'>,message:string,httpStatus?:number):Exclude<ISBNdbLookup,{status:'matched'}>=>
 ({status,message,...(httpStatus?{httpStatus}:{})});
/**
 * Transport is injected for fixture tests. Only a configured API key enables
 * a request. No key or unconfigured plan => no paid API calls.
 */
export async function lookupISBNdbEdition(rawIsbn:string,key?:string,fetchImpl:typeof fetch=fetch):Promise<ISBNdbLookup>{
 const expected=normalizedIsbn(rawIsbn);
 if(!expected)return empty('invalid_response','Enter a valid ISBN-10 or ISBN-13.');
 if(!key?.trim())return {...empty('unavailable','ISBNdb is not configured on this Worker.'),reason:'not_configured'};
 let response:Response|null=null;
 // One interactive lookup, with at most one bounded retry for a short-term 429.
 // This does NOT provide global 1 req/sec coordination across Cloudflare isolates.
 for(let attempt=0;attempt<2;attempt++){
  try{
   response=await fetchImpl('https://api2.isbndb.com/book/'+expected,{
    method:'GET',headers:{Authorization:key.trim(),Accept:'application/json'},
    signal:AbortSignal.timeout(15000),redirect:'manual'
   });
  }catch(error){
   // Never echo exception messages, URLs or headers: they may contain credentials.
   const name=error instanceof Error?error.name:'';
   const reason=name==='TimeoutError'||name==='AbortError'?'timeout':
    name==='TypeError'?'transport_error':'request_rejected';
   return {...empty('unavailable',reason==='timeout'?'ISBNdb lookup timed out.':'ISBNdb request did not reach the provider.'),reason};
  }
  if(response.status!==429||attempt===1)break;
  // Respect a short Retry-After only; never hold a Worker open for a long quota reset.
  const retryAfter=response.headers.get('Retry-After');
  const seconds=retryAfter===null?1.25:Number(retryAfter);
  if(!Number.isFinite(seconds)||seconds>5||seconds<0)break;
  await new Promise<void>(resolve=>setTimeout(resolve,Math.max(1250,seconds*1000)));
 }
 if(!response)return {...empty('unavailable','ISBNdb lookup did not produce a response.'),reason:'request_rejected'};
 if(response.status>=300&&response.status<400)return {...empty('provider_error','ISBNdb endpoint redirected; verify the API hostname.',response.status),reason:'redirect_blocked'};
 if(response.status===404)return empty('not_found','No ISBNdb edition found for this ISBN.',404);
 if(response.status===429)return empty('rate_limited','ISBNdb rate limit or daily quota reached.',429);
 if(response.status===401||response.status===403)return empty('authentication_error','ISBNdb rejected the configured API key or subscription.',response.status);
 if(!response.ok)return empty('provider_error','ISBNdb returned HTTP '+response.status+'.',response.status);
 let data:unknown;
 try{data=await response.json()}catch{return empty('invalid_response','ISBNdb returned invalid JSON.')}
 const book=data&&typeof data==='object'&&'book' in data?(data as {book:unknown}).book:null;
 if(!book||typeof book!=='object'||Array.isArray(book))return empty('invalid_response','ISBNdb response has no book.');
 const row=book as Record<string,unknown>;
 const received=[row.isbn13,row.isbn].map(normalizedIsbn).filter(Boolean);
 if(!received.includes(expected))return empty('isbn_mismatch','Provider ISBN does not match the requested edition. No data accepted.');
 const title=str(row.title);
 const authors=Array.isArray(row.authors)?row.authors.map(x=>str(x,300)).filter(Boolean).slice(0,10):[];
 if(!title||!authors.length)return empty('invalid_response','ISBNdb did not return a title and author.');
 const bindingLabel=str(row.binding,150)||null;
 const n=row.pages;
 const pageCount=typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<100000?n:null;
 return {status:'matched',rights:'not_reviewed',coverStatus:'not_verified',edition:{
  source:'ISBNdb',isbn13:expected,title,authors,publisher:str(row.publisher)||null,
  publishedDate:date(row.date_published),pageCount,
  language:language(row.language),format:bindingFormat(bindingLabel),
  bindingLabel,coverCandidateUrl:coverUrl(row.image),
  descriptionAvailable:Boolean(str(row.synopsis,8000)||str(row.overview,8000))
 }};
}

/** A single paginated title/author search request, never one request per result.
 * Search records are unverified and MUST NOT be imported as canonical entities.
 * The caller handles a non-matched status independently of other providers.
 */
export type ISBNdbSearch=
 |{status:'matched';books:ISBNdbEdition[];total:number;page:number}
 |{status:'unavailable'|'rate_limited'|'authentication_error'|'provider_error'|'invalid_response';books:[];reason?:string;httpStatus?:number};
export async function searchISBNdbBooks(query:string,key?:string,fetchImpl:typeof fetch=fetch):Promise<ISBNdbSearch>{
 const q=query.trim().slice(0,120);
 if(q.length<2||!key?.trim())return {status:'unavailable',books:[],reason:q.length<2?'invalid_query':'not_configured'};
 const url=new URL('https://api2.isbndb.com/books/'+encodeURIComponent(q));
 url.searchParams.set('page','1');
 url.searchParams.set('pageSize','20');
 let response:Response;
 try{
  response=await fetchImpl(url.toString(),{
   method:'GET',headers:{Authorization:key.trim(),Accept:'application/json'},
   signal:AbortSignal.timeout(15000),redirect:'manual'
  });
 }catch(error){
  const name=error instanceof Error?error.name:'';
  return {status:'unavailable',books:[],reason:name==='TimeoutError'||name==='AbortError'?'timeout':'transport_error'};
 }
 if(response.status===429)return {status:'rate_limited',books:[],httpStatus:429};
 if(response.status===401||response.status===403)return {status:'authentication_error',books:[],httpStatus:response.status};
 if(!response.ok)return {status:'provider_error',books:[],httpStatus:response.status};
 let data:unknown;
 try{data=await response.json()}catch{return {status:'invalid_response',books:[]}}
 if(!data||typeof data!=='object'||Array.isArray(data))return {status:'invalid_response',books:[]};
 const payload=data as {books?:unknown;total?:unknown};
 if(!Array.isArray(payload.books))return {status:'invalid_response',books:[]};
 const seen=new Set<string>();
 const books:ISBNdbEdition[]=[];
 for(const item of payload.books.slice(0,20)){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const row=item as Record<string,unknown>;
  const code=normalizedIsbn(row.isbn13)||normalizedIsbn(row.isbn);
  const title=str(row.title),authors=Array.isArray(row.authors)?row.authors.map(a=>str(a,300)).filter(Boolean).slice(0,10):[];
  if(!code||seen.has(code)||!title||!authors.length)continue;
  seen.add(code);
  const bindingLabel=str(row.binding,150)||null;
  const n=row.pages;
  books.push({
   source:'ISBNdb',isbn13:code,title,authors,publisher:str(row.publisher)||null,
   publishedDate:date(row.date_published),
   pageCount:typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<100000?n:null,
   language:language(row.language),format:bindingFormat(bindingLabel),bindingLabel,
   coverCandidateUrl:coverUrl(row.image),
   descriptionAvailable:Boolean(str(row.synopsis,8000)||str(row.overview,8000))
  });
 }
 return {status:'matched',books,total:typeof payload.total==='number'&&Number.isSafeInteger(payload.total)&&payload.total>=0?payload.total:books.length,page:1};
}
