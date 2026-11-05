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
 |{status:'not_found'|'unavailable'|'rate_limited'|'authentication_error'|'provider_error'|'invalid_response'|'isbn_mismatch';httpStatus?:number;message:string;reason?:'not_configured'|'timeout'|'transport_error'|'request_rejected'};
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
const empty=(status:Exclude<ISBNdbLookup['status'],'matched'>,message:string,httpStatus?:number):ISBNdbLookup=>
 ({status,message,...(httpStatus?{httpStatus}:{})});
/**
 * Transport is injected for fixture tests. Only a configured API key enables
 * a request. No key or unconfigured plan => no paid API calls.
 */
export async function lookupISBNdbEdition(rawIsbn:string,key?:string,fetchImpl:typeof fetch=fetch):Promise<ISBNdbLookup>{
 const expected=normalizedIsbn(rawIsbn);
 if(!expected)return empty('invalid_response','Enter a valid ISBN-10 or ISBN-13.');
 if(!key?.trim())return {...empty('unavailable','ISBNdb is not configured on this Worker.'),reason:'not_configured'};
 let response:Response;
 try{
  response=await fetchImpl('https://api2.isbndb.com/book/'+expected,{
   method:'GET',headers:{Authorization:key,Accept:'application/json'},
   signal:AbortSignal.timeout(15000),redirect:'error'
  });
 }catch(error){
  // Never echo provider URLs or exception messages: runtimes may include sensitive headers.
  const name=error instanceof Error?error.name:'';
  const reason=name==='TimeoutError'||name==='AbortError'?'timeout':
   name==='TypeError'?'transport_error':'request_rejected';
  return {...empty('unavailable',reason==='timeout'?'ISBNdb lookup timed out.':'ISBNdb request did not reach the provider.'),reason};
 }
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
