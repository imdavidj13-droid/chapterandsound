#!/usr/bin/env node
/**
 * Prepare a deterministic, no-write candidate manifest from official Open Library
 * monthly TSV dumps. Works/editions/authors are streamed as gzipped records:
 *   type TAB key TAB revision TAB modified TAB JSON
 *
 * No network calls, no R2/Cloudflare writes. This is a staging preprocessor,
 * not a production importer. Only requested work keys are considered.
 */
import {createReadStream,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {resolve,join} from 'node:path';

function usage(){
 console.error('Usage: node scripts/prepare-openlibrary-pilot.mjs --works works.txt.gz --authors authors.txt.gz --editions editions.txt.gz --seeds pilot-work-keys.txt --out .private-catalogue-pilot');
 process.exitCode=2;
}
const opts={};
for(let i=2;i<process.argv.length;i+=2){opts[process.argv[i]]=process.argv[i+1]}
const needed=['--works','--authors','--editions','--seeds','--out'];
if(needed.some(key=>!opts[key])){usage();process.exit(2)}
const output=resolve(opts['--out']);
const wanted=new Set(readFileSync(opts['--seeds'],'utf8').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')));
if(!wanted.size||wanted.size>250||[...wanted].some(x=>!/^\/works\/OL\d+W$/.test(x))){
 throw Error('Seed file must contain 1–250 unique Open Library work keys, e.g. /works/OL123W.');
}
mkdirSync(output,{recursive:true});
const workRecords=new Map(),authors=new Map(),editions=new Map();
const normalize=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' '):'';
const valid13=value=>{
 const v=normalize(value).replace(/[ -]/g,'');
 if(!/^\d{13}$/.test(v)||!/^97[89]/.test(v))return false;
 const sum=v.slice(0,12).split('').reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(v[12]);
};
async function scan(path,onRecord){
 const stream=createReadStream(path).pipe(createGunzip());
 const lines=createInterface({input:stream,crlfDelay:Infinity});
 let seen=0,parsed=0;
 for await(const line of lines){
  seen++;
  const chunks=line.split('\t');
  if(chunks.length<5)continue;
  let record;
  try{record=JSON.parse(chunks.slice(4).join('\t'))}catch{continue}
  await onRecord(chunks[1],record);
  parsed++;
 }
 return {lines:seen,parsed};
}
const workScan=await scan(opts['--works'],(key,record)=>{
 if(wanted.has(key)){
  const authorKeys=(record.authors||[]).map(a=>a?.author?.key||a?.key).filter(x=>typeof x==='string');
  workRecords.set(key,{key,title:normalize(record.title),authorKeys,revision:record.revision||null});
 }
});
const authorIds=new Set([...workRecords.values()].flatMap(w=>w.authorKeys));
const authorScan=await scan(opts['--authors'],(key,record)=>{
 if(authorIds.has(key)&&normalize(record.name))authors.set(key,normalize(record.name));
});
const editionScan=await scan(opts['--editions'],(key,record)=>{
 const refs=(record.works||[]).map(x=>x?.key).filter(x=>wanted.has(x));
 if(!refs.length)return;
 const isbns=(record.isbn_13||[]).map(normalize).filter(valid13);
 const normalizedFormat=normalize(record.physical_format).toLowerCase();
 const format=normalizedFormat.includes('paperback')?'paperback':
  normalizedFormat.includes('hardcover')||normalizedFormat.includes('hardback')?'hardback':
  normalizedFormat.includes('ebook')||normalizedFormat.includes('electronic')?'ebook':
  normalizedFormat.includes('audio')?'audiobook':'';
 for(const workKey of refs){
  // Candidate identity is edition-specific; never guess an ISBN from a work aggregate.
  const item={key,format,isbn13:[...new Set(isbns)].length===1?isbns[0]:'',publishDate:normalize(record.publish_date),publisher:normalize(record.publishers?.[0])};
  if(!editions.has(workKey))editions.set(workKey,[]);
  editions.get(workKey).push(item);
 }
});
const candidates=[],errors=[];
for(const key of wanted){
 const work=workRecords.get(key);
 if(!work){errors.push({key,reason:'Work key not found in dump'});continue}
 const names=work.authorKeys.map(k=>authors.get(k)).filter(Boolean);
 if(!names.length){errors.push({key,reason:'Author identity missing in author dump'});continue}
 if(!work.title){errors.push({key,reason:'Work title missing'});continue}
 const all=editions.get(key)||[];
 const likely=all.filter(e=>e.isbn13);
 likely.sort((a,b)=>({paperback:0,hardback:1,ebook:2,audiobook:3}[a.format]??4)-({paperback:0,hardback:1,ebook:2,audiobook:3}[b.format]??4)||a.key.localeCompare(b.key));
 const selected=likely[0];
 if(!selected){errors.push({key,reason:'No verified edition ISBN-13 was found'});continue}
 candidates.push({sourceId:'openlibrary',sourceKey:selected.key,title:work.title,author:names[0],isbn13:selected.isbn13,format:selected.format,workSourceKey:key});
 if(names.length>1)errors.push({key,reason:'Multiple author contributors require manual review before applying: '+names.join(', ')});
}
const files=[];
for(let i=0;i<candidates.length;i+=100){
 const name='candidates-'+String(Math.floor(i/100)+1).padStart(2,'0')+'.json';
 writeFileSync(join(output,name),JSON.stringify({candidates:candidates.slice(i,i+100)},null,2)+'\n');
 files.push(name);
}
const report={generatedAt:new Date().toISOString(),source:'Open Library monthly dumps',requested:wanted.size,worksFound:workRecords.size,authorsFound:authors.size,
 editionsMatched:[...editions.values()].reduce((sum,value)=>sum+value.length,0),
 candidates:candidates.length,reviewItems:errors.length,files,errors,
 scan:{works:workScan,authors:authorScan,editions:editionScan},
 caveats:['No database writes performed','Only the first validated ISBN-13 edition per seeded work is selected','Authors with multiple creators need manual verification','Covers, synopses, rights and audio metadata are not imported','Output needs a BOOK_DB dry-run preview before any future ingestion']};
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,candidates:candidates.length,reviewItems:errors.length,files},null,2));
