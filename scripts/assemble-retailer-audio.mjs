#!/usr/bin/env node
/**
 * Provider-identified audiobook candidates for ten canonical pilot works.
 * Creates ONLY a new local review manifest; never patches canonical source
 * identities, publishes anything or talks to a database.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const normalize=x=>typeof x==='string'?x.normalize('NFKC').toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim():'';
const validIsbn13=v=>{
 if(typeof v!=='string'||!/^97[89]\d{10}$/.test(v))return false;
 const s=[...v.slice(0,12)].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-s%10)%10===Number(v[12]);
};
const hosts={storytel:'www.storytel.com',apple_books:'books.apple.com',
 google_play_audiobooks:'play.google.com',audible:'www.audible.co.uk'};
const idPattern={storytel:/^isbn13:97[89]\d{10}$/,apple_books:/^\d{8,12}$/,
 google_play_audiobooks:/^[a-zA-Z0-9_-]{8,60}$/,audible:/^[A-Z0-9]{10}$/};
function validate(record){
 if(!hosts[record.provider]||!idPattern[record.provider].test(record.providerRecordingId)||
  !normalize(record.title)||!normalize(record.author)||
  !Array.isArray(record.narratorNames)||record.narratorNames.length<1||
  record.narratorNames.some(x=>!normalize(x))||
  !Number.isSafeInteger(record.durationMinutes)||record.durationMinutes<1||
  record.durationMinutes>3000||
  (record.isbn13!=null&&!validIsbn13(record.isbn13))||
  !Array.isArray(record.sources)||!record.sources.length)throw Error('Invalid audiobook evidence');
 const urls=record.sources.map(s=>new URL(s.url));
 if(urls.some(u=>u.protocol!=='https:'||
  !['www.storytel.com','books.apple.com','play.google.com','www.bookbeat.com',
    'www.audiobooks.com','www.goodreads.com','www.audible.co.uk'].includes(u.host)))
  throw Error('Unexpected audiobook evidence host');
 if(record.provider==='storytel'&&record.providerRecordingId!=='isbn13:'+record.isbn13)
  throw Error('Storytel ISBN identifier mismatch');
 if(record.provider==='apple_books'&&
   !urls.some(u=>u.host==='books.apple.com'&&u.pathname.endsWith('/id'+record.providerRecordingId)))
  throw Error('Apple recording ID not supported by evidence URL');
 if(record.provider==='google_play_audiobooks'&&
   !urls.some(u=>u.host==='play.google.com'&&u.searchParams.get('id')===record.providerRecordingId))
  throw Error('Google Play recording ID not supported by evidence URL');
 if(record.provider==='audible'&&
   !urls.some(u=>u.host==='www.goodreads.com'))throw Error('Audible ID requires review evidence');
}
export function assembleRetailerAudio(pilot,evidence){
 if(!Array.isArray(pilot?.candidates)||pilot.candidates.length!==10)throw Error('Expected ten work candidates');
 if(!Array.isArray(evidence?.records))throw Error('Missing retailer audiobook evidence');
 const books=structuredClone(pilot.candidates);
 const existingKeys=new Set(),usedProviderIds=new Set(),existingIsbns=new Map();
 for(const book of books){
  if(!book.workSourceKey||!Array.isArray(book.editions))throw Error('Invalid pilot work');
  for(const edition of book.editions){
   if(existingKeys.has(edition.sourceKey))throw Error('Repeated source edition key');
   existingKeys.add(edition.sourceKey);
   if(edition.isbn13){
    const matches=existingIsbns.get(edition.isbn13)||[];
    matches.push({bookKey:book.workSourceKey,sourceKey:edition.sourceKey});
    existingIsbns.set(edition.isbn13,matches);
   }
  }
 }
 const additions=[],blocked=[];
 for(const record of evidence.records){
  validate(record);
  const externalKey=record.provider+':'+record.providerRecordingId;
  if(usedProviderIds.has(externalKey))throw Error('Duplicate provider recording ID');
  usedProviderIds.add(externalKey);
  const works=books.filter(b=>normalize(b.title)===normalize(record.title)&&normalize(b.author)===normalize(record.author));
  if(works.length!==1){blocked.push({title:record.title,externalKey,reason:'canonical_work_not_unique'});continue}
  const book=works[0];
  const isbnLinks=record.isbn13?existingIsbns.get(record.isbn13)||[]:[];
  if(isbnLinks.some(link=>link.bookKey!==book.workSourceKey)){
   blocked.push({title:record.title,externalKey,reason:'isbn_linked_to_different_work'});continue
  }
  if(existingKeys.has(externalKey)){
   blocked.push({title:record.title,externalKey,reason:'edition_source_key_already_exists'});continue
  }
  const runtimes=[...new Set(record.sources.map(s=>s.durationMinutes).filter(Number.isInteger))];
  const disagreements=runtimes.length>1?runtimes:[];
  const fields=['format','narratorNames','durationSeconds',...(record.isbn13?['isbn13']:[])];
  const edition={
   sourceId:record.provider,sourceKey:externalKey,sourceWorkKeys:[book.workSourceKey],
   title:book.title,format:'audiobook',isbn13:record.isbn13||null,
   isbn13Candidates:record.isbn13?[record.isbn13]:[],
   narratorNames:[...record.narratorNames],narratorSourceKeys:[],
   durationSeconds:record.durationMinutes*60,audioDelivery:'digital',
   publicationDate:record.releaseDate||null,
   publisher:record.publisher||null,imprint:null,
   pageCount:null,coverIds:[],language:'eng',
   providerRecordingId:record.providerRecordingId,
   providerEvidenceUrls:record.sources.map(s=>s.url),
   fieldProvenance:Object.fromEntries(fields.map(field=>[field,{
    source:record.provider,identifier:record.providerRecordingId,
    status:'explicit_provider_evidence',urls:record.sources.map(s=>s.url)}])),
   potentialDuplicateSourceKeys:isbnLinks.map(x=>x.sourceKey),
   validationIssues:['narrator_canonical_identity_not_linked',
    'recording_work_relationship_not_independently_verified',
    'review_provider_metadata_usage_rights',
    ...(isbnLinks.length?['possible_duplicate_isbn_edition']:[]),
    ...(disagreements.length?['provider_duration_disagreement']:[])],
   durationDisagreementMinutes:disagreements,
   importEligible:false,publicationEligible:false
  };
  book.editions.push(edition);existingKeys.add(externalKey);
  additions.push({title:book.title,sourceKey:externalKey,isbn13:edition.isbn13,
   durationMinutes:record.durationMinutes,narrators:record.narratorNames,
   potentialDuplicateSourceKeys:edition.potentialDuplicateSourceKeys,
   durationDisagreementMinutes:disagreements});
 }
 return {candidates:{candidates:books,mode:'retailer_audio_review_only',importEligible:false},
  report:{mode:'retailer_audio_review_only',
   totals:{works:books.length,sourceRecords:evidence.records.length,
    addedAudiobookCandidates:additions.length,blocked:blocked.length,
    resultingEditionRecords:books.reduce((n,b)=>n+b.editions.length,0),
    recordsWithDurationDisagreement:additions.filter(x=>x.durationDisagreementMinutes.length).length,
    recordsWithoutISBN:additions.filter(x=>!x.isbn13).length},
   additions,blocked,
   warnings:['External recording IDs are provider-specific, not ISBNs.',
    'Candidate records are not canonical narrator identities or import approvals.',
    'Provider terms and possible duplicate editions require review. No D1 writes.']}
 };
}
export function run(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--input','--evidence','--out'].includes(argv[i])||!argv[i+1])
   throw Error('Required --input --evidence --out');
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--evidence']||!opts['--out'])throw Error('Required --input --evidence --out');
 const result=assembleRetailerAudio(
  JSON.parse(readFileSync(resolve(opts['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(opts['--evidence']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 for(const [name,value] of [['retailer-audio-report.json',result.report],
  ['retailer-audio-enriched-candidates.json',result.candidates]]){
  const file=join(dir,name);writeFileSync(file+'.partial',JSON.stringify(value,null,2)+'\n');
  renameSync(file+'.partial',file);
 }
 return {report:join(dir,'retailer-audio-report.json'),totals:result.report.totals,
 status:'LOCAL_REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
