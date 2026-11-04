#!/usr/bin/env node
/**
 * Targeted AudioSilo audiobook-release discovery for the saved ten-work pilot.
 * Read-only: results are local diagnostic candidates, not approved DB records.
 * Only factual fields from the provider's CC0 core are retained; no cover URLs,
 * blurbs, images, reviews or other potentially third-party material are copied.
 * API route documented at https://github.com/KodeStar/audiosilo-meta
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const norm=v=>typeof v==='string'?v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim():'';
const isbn=v=>String(v||'').replace(/[-\s]/g,'');
export function assessAudioMatch(book,match){
 const title=norm(match?.title),wanted=norm(book.title),author=norm(match?.author),wantedAuthor=norm(book.author);
 const titleOK=title===wanted||title.startsWith(wanted+' ');
 const authorOK=author===wantedAuthor;
 if(!titleOK||!authorOK)return {status:'identity_mismatch'};
 const narrator=typeof match.narrator==='string'?match.narrator.trim():null;
 const minutes=Number(match.duration);
 return {status:'candidate_review',title:book.title,author:book.author,
  isbn:/^97[89]\d{10}$/.test(isbn(match.ISBN))?isbn(match.ISBN):null,
  asin:typeof match.ASIN==='string'&&/^[A-Z0-9]{10}$/i.test(match.ASIN)?match.ASIN:null,
  narrator:narrator||null,
  publisher:typeof match.publisher==='string'&&match.publisher.trim()?match.publisher.trim():null,
  releaseYear:Number.isSafeInteger(Number(match.publishedYear))&&Number(match.publishedYear)>1800?Number(match.publishedYear):null,
  durationSeconds:Number.isFinite(minutes)&&minutes>0?Math.round(minutes*60):null,
  language:typeof match.language==='string'?match.language:null,
  evidence:{provider:'audiosilo',licence:'CC0 factual core',status:'unreviewed',discovery:'title_author'},
  note:'Recording candidate only. Check independent identifier/recording identity before import.'};
}
export async function discoverAudio(data,{fetcher=fetch,base='https://meta.audiosilo.app',delayMs=500}={}){
 if(!Array.isArray(data?.candidates)||data.candidates.length!==10)throw Error('Expected exactly ten canonical works');
 if(base!=='https://meta.audiosilo.app'&&!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error('Only official AudioSilo or localhost test fixture allowed');
 const books=[];
 for(const book of data.candidates){
  if(!book.title||!book.author||!book.workSourceKey)throw Error('Missing canonical identity');
  const row={title:book.title,workSourceKey:book.workSourceKey,status:'',candidates:[],identityMismatches:0};
  try{
   if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
   const url=base+'/abs/search?'+new URLSearchParams({mediaType:'book',query:book.title,author:book.author});
   const res=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
   if(!res.ok){row.status='request_failed_http_'+res.status}
   else{
    const payload=await res.json();
    const matches=Array.isArray(payload.matches)?payload.matches.slice(0,10):[];
    for(const match of matches){
     const candidate=assessAudioMatch(book,match);
     if(candidate.status==='candidate_review')row.candidates.push(candidate);
     else row.identityMismatches++;
    }
    row.status=row.candidates.length?'candidates_found':'no_verified_identity_candidates';
   }
  }catch{row.status='request_failed'}
  books.push(row);
 }
 return {mode:'audiosilo_audiobook_discovery_review_only',books,
  totals:{works:books.length,worksWithCandidates:books.filter(x=>x.candidates.length>0).length,
   releaseCandidates:books.reduce((n,b)=>n+b.candidates.length,0),
   requestFailures:books.filter(x=>x.status.startsWith('request_failed')).length},
  notes:['Not an audiobook import or publication. No database writes.',
   'Only factual fields are retained. Cover URLs, descriptions and third-party content are excluded.',
   'Audio release identity, ISBN, narrator and duration must be reviewed before linking to a canonical work.',
   'No audiobook duration or narrator is inferred for missing records.']};
}
export async function run(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--input','--out'].includes(args[i])||!args[i+1])throw Error('Usage: --input enriched.json --out directory');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Both --input and --out are required');
 const result=await discoverAudio(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'ten-book-audio-evidence.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');renameSync(file+'.partial',file);
 return {report:file,totals:result.totals,status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 run(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(e);process.exitCode=1});
}
