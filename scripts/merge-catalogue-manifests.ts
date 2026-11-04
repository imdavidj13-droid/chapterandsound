#!/usr/bin/env node
/**
 * Offline, no-write merge of licensed catalogue manifests.
 * Run with: npx tsx scripts/merge-catalogue-manifests.ts
 *   --primary pilot.json --supplement approved-enrichment.json --out combined.json
 * Each file uses {candidates:[{sourceId,title,author,editions:[...]}]}.
 * No web/API requests, publication, database or cover changes.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mergeCatalogueMetadata,type SourceCandidate} from '../src/worker/catalogue-import-merge.js';

const args:Record<string,string>={};
for(let i=2;i<process.argv.length;i+=2)args[process.argv[i]!]=process.argv[i+1]||'';
if(!args['--primary']||!args['--supplement']||!args['--out'])
 throw Error('Specify --primary, --supplement and --out (local JSON paths).');
const read=(name:string):SourceCandidate[]=>{
 const file=JSON.parse(readFileSync(resolve(args[name]!),'utf8')) as {candidates?:unknown};
 if(!Array.isArray(file?.candidates)||file.candidates.length>1000)
  throw Error(name+' must contain 0–1000 candidates');
 return file.candidates as SourceCandidate[];
};
const base=read('--primary'),supplements=read('--supplement');
if(!base.length)throw Error('Primary manifest has no candidates.');
const matchKey=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const merged:SourceCandidate[]=[],report:{title:string;applied:number;conflicts:unknown[];rejectedSources:unknown[]}[]=[];
for(const book of base){
 const title=matchKey(book.title||''),author=matchKey(book.author||'');
 const plausible=supplements.filter(candidate=>matchKey(candidate.title||'')===title&&matchKey(candidate.author||'')===author);
 const result=mergeCatalogueMetadata(book,plausible);
 merged.push(result.candidate);
 report.push({title:book.title||'',applied:result.applied.length,conflicts:result.conflicts,rejectedSources:result.rejectedSources});
}
writeFileSync(resolve(args['--out']),JSON.stringify({candidates:merged},null,2)+'\n');
writeFileSync(resolve(args['--out']+'.report.json'),JSON.stringify({
 works:merged.length,appliedFields:report.reduce((n,item)=>n+item.applied,0),
 conflicts:report.reduce((n,item)=>n+item.conflicts.length,0),report,
 note:'Review identity conflicts and source rights before uploading. No catalogue changes were made.'
},null,2)+'\n');
console.log(JSON.stringify({works:merged.length,out:resolve(args['--out']),readOnly:true}));
