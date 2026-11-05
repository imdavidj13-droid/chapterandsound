#!/usr/bin/env node
/**
 * Select a deterministic sample of distinct Open Library works for an offline
 * catalogue population pilot. Nothing is uploaded, modified, or imported.
 *
 * This is NOT identity verification. Authors, editions, ISBNs, existing BOOK_DB
 * identities and rights must all be checked before any write.
 */
import {createReadStream,mkdirSync,writeFileSync} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function selectWorkSeeds({works,out,count=5000}){
 if(!works||!out||!Number.isInteger(count)||count<1||count>5000)
  throw Error('Provide --works and --out, with --count between 1 and 5000.');
 // Stable reservoir sampling, independent of the size/order of eligible records.
 let state=0x1f36c2a1;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
 const selected=[];
 let lines=0,eligible=0,invalid=0;
 const input=createReadStream(resolve(works)).pipe(createGunzip());
 const iterator=createInterface({input,crlfDelay:Infinity});
 for await(const line of iterator){
  lines++;
  const chunks=line.split('\t');
  if(chunks.length<5||chunks[0]!=='/type/work'||!/^\/works\/OL\d+W$/.test(chunks[1]||'')){invalid++;continue}
  let record;
  try{record=JSON.parse(chunks.slice(4).join('\t'))}catch{invalid++;continue}
  const title=typeof record.title==='string'?record.title.trim():'';
  const authors=Array.isArray(record.authors)?record.authors.map(a=>a?.author?.key||a?.key)
   .filter(k=>typeof k==='string'&&/^\/authors\/OL\d+A$/.test(k)):[];
  if(!title||title.length>500||/^untitled\b/i.test(title)||!authors.length)continue;
  const key=chunks[1];
  // Official monthly work dumps contain one row per work key; do not retain
  // millions of identifiers in RAM simply to deduplicate the source dump.
  eligible++;
  if(selected.length<count)selected.push(key);
  else{
   const slot=Math.floor(random()*eligible);
   if(slot<count)selected[slot]=key;
  }
  if(lines%2000000===0)console.error('[seed-selection] Scanned '+lines.toLocaleString('en-GB')+' works');
 }
 if(selected.length!==count)throw Error('Only '+selected.length+' eligible works found; requested '+count+'. No seed file written.');
 selected.sort();
 const target=resolve(out);
 mkdirSync(dirname(target),{recursive:true});
 writeFileSync(target,selected.join('\n')+'\n');
 const report={readOnly:true,requested:count,selected:selected.length,
  scanned:lines,eligible,invalidLines:invalid,
  selection:'deterministic reservoir sample of titled works with author source keys',
  caveats:['Selection is NOT a canonical identity verification',
   'Some selected works may have no usable editions or ISBNs',
   'Inspect author links, edition links and existing BOOK_DB identities before import',
   'No databases, remote APIs, or media assets were accessed']};
 writeFileSync(target+'.report.json',JSON.stringify(report,null,2)+'\n');
 return {seeds:target,report:target+'.report.json',selected:count,eligible};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args={};
 for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]]=process.argv[i+1];
 try{console.log(JSON.stringify(await selectWorkSeeds({
  works:args['--works'],out:args['--out'],count:args['--count']?Number(args['--count']):5000
 }),null,2))}
 catch(error){console.error('[seed-selection] '+error.message);process.exitCode=1}
}
