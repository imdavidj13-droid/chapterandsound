#!/usr/bin/env node
/**
 * Combine saved source reports behind one canonical work. No source-specific
 * book or author identities become new catalogue records. No database writes.
 * The result is a local evidence bundle for automated reconciliation work,
 * not a production import manifest.
 */
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=path=>JSON.parse(readFileSync(resolve(path),'utf8'));
const sameIdentity=(b,row)=>row?.workSourceKey===b.workSourceKey&&row?.title===b.title;
export function assemble({enriched,covers,audio,wikidata}){
 if(!Array.isArray(enriched?.candidates)||enriched.candidates.length!==10)throw Error('Expected ten enriched canonical works');
 if(!Array.isArray(covers?.results)||!Array.isArray(audio?.books)||!Array.isArray(wikidata?.books))
  throw Error('Missing cover, audio, or Wikidata report');
 const coverBy=new Map(covers.results.map(r=>[r.workSourceKey,r]));
 const audioBy=new Map(audio.books.map(r=>[r.workSourceKey,r]));
 const wdBy=new Map(wikidata.books.map(r=>[r.workSourceKey,r]));
 const books=enriched.candidates.map(book=>{
  const cover=coverBy.get(book.workSourceKey);
  const recording=audioBy.get(book.workSourceKey);
  const wd=wdBy.get(book.workSourceKey);
  if(!sameIdentity(book,cover)||!sameIdentity(book,recording)||!sameIdentity(book,wd))
   throw Error('Cross-source work identity mismatch for '+book.title);
  const formatSummary={};
  for(const e of book.editions||[]){
   const format=e.format||'unknown';
   formatSummary[format]=(formatSummary[format]||0)+1;
  }
  const audiovisual=(recording.candidates||[]).filter(x=>
   x.status==='candidate_review'&&x.title===book.title&&x.author===book.author);
  const workIdentities=(wd.candidates||[]).filter(x=>x.status==='identity_candidate');
  const problems=[];
  if(cover.status!=='available')problems.push('cover_not_confirmed');
  if(!workIdentities.length)problems.push('wikidata_work_identity_not_confirmed');
  if(!audiovisual.length)problems.push('audiobook_release_not_found');
  if((book.editions||[]).some(x=>x.format==='unknown'))problems.push('edition_formats_unknown');
  if(book.identityStatus!=='verified')problems.push('openlibrary_work_identity_unreviewed');
  return {canonicalWorkKey:book.workSourceKey,title:book.title,author:book.author,
   authorSourceKeys:book.authorSourceKeys||[],
   work:{descriptionPresent:Boolean(book.description?.trim()),originalPublicationDate:book.firstPublicationDate||null},
   editionCount:(book.editions||[]).length,editionFormats:formatSummary,
   cover:cover.status==='available'?{status:'url_available_not_visually_verified',
    source:'openlibrary',editionSourceKey:cover.editionSourceKey,url:cover.displayUrl}:{status:cover.status},
   wikidata:{status:wd.status,identities:workIdentities},
   audiobook:{status:recording.status,releaseCandidates:audiovisual},
   blockers:problems,importEligible:false,publicationEligible:false};
 });
 return {mode:'unified_ten_work_source_evidence_no_import',books,
  totals:{works:books.length,coverUrlsAvailable:books.filter(b=>b.cover.url).length,
   booksWithWikidataCandidates:books.filter(b=>b.wikidata.identities.length).length,
   booksWithAudiobookCandidates:books.filter(b=>b.audiobook.releaseCandidates.length).length,
   unknownEditions:books.reduce((n,b)=>n+(b.editionFormats.unknown||0),0)},
  warnings:['This bundle contains independent source candidates; it does not verify 100% completion.',
   'Audiobook candidates are not automatically linked as recordings.',
   'No published records, member relationships or Cloudflare database are changed.']};
}
export function run(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--enriched','--covers','--audio','--wikidata','--out'].includes(args[i])||!args[i+1])throw Error('Invalid argument');
  opts[args[i]]=args[i+1];
 }
 if(['--enriched','--covers','--audio','--wikidata','--out'].some(k=>!opts[k]))throw Error('Required: --enriched --covers --audio --wikidata --out');
 const report=assemble({enriched:load(opts['--enriched']),covers:load(opts['--covers']),
  audio:load(opts['--audio']),wikidata:load(opts['--wikidata'])});
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const path=join(dir,'ten-book-unified-evidence.json');
 writeFileSync(path+'.partial',JSON.stringify(report,null,2)+'\n');renameSync(path+'.partial',path);
 return {report:path,totals:report.totals,status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
