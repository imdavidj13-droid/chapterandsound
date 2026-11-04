#!/usr/bin/env node
/**
 * Review-only readiness assessment for ten canonical works.
 * Reads locally saved Open Library enrichment; never contacts providers or D1.
 * Selecting an edition for review does NOT approve or import it.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const requiredEditionFields=['isbn','format','publisher','publicationDate'];
export function assess(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)
  throw Error('Expected exactly ten saved canonical work candidates');
 const names=new Set(),keys=new Set();
 const books=input.candidates.map(book=>{
  if(!book?.title||!book?.author||!book?.workSourceKey||!Array.isArray(book.editions))
   throw Error('Invalid canonical work candidate');
  if(names.has(book.title)||keys.has(book.workSourceKey))throw Error('Duplicate canonical work');
  names.add(book.title);keys.add(book.workSourceKey);
  const editions=book.editions.map(e=>{
   const missing=[];
   if(!e.isbn13&&!e.isbn10)missing.push('isbn');
   if(!e.format||e.format==='unknown')missing.push('format');
   if(!e.publisher)missing.push('publisher');
   if(!e.publicationDate)missing.push('publicationDate');
   const conflicts=(book.validationIssues||[]).filter(issue=>
    issue.edition===e.sourceKey && issue.code!=='format_unverified' && issue.code!=='isbn_unavailable');
   const priority={paperback:0,hardback:1,ebook:2,audiobook:3,unknown:4};
   return {sourceKey:e.sourceKey, isbn13:e.isbn13||null,isbn10:e.isbn10||null,
    format:e.format||'unknown', publisher:e.publisher||null,
    publicationDate:e.publicationDate||null, missing,conflictCodes:[...new Set(conflicts.map(x=>x.code))],
    provenance:e.fieldProvenance?.format||null,
    score:missing.length*100+conflicts.length*20+(priority[e.format]??4)};
  }).sort((a,b)=>a.score-b.score||String(a.sourceKey).localeCompare(String(b.sourceKey)));
  const selected=editions[0]||null;
  const workMissing=[];
  if(!book.description?.trim())workMissing.push('description');
  if(!book.firstPublicationDate)workMissing.push('firstPublicationDate');
  const sourceConflicts=(book.validationIssues||[]).filter(x=>
   ['canonical_work_identity_unreviewed','same_isbn_conflicting_metadata','isbn_linked_to_multiple_canonical_works',
    'source_edition_linked_to_multiple_canonical_works'].includes(x.code)).map(x=>x.code);
  const blockers=[
   ...workMissing.map(f=>'work:'+f),
   ...(!selected?['edition:none']:selected.missing.map(f=>'edition:'+f)),
   ...(!selected?[]:selected.conflictCodes.map(f=>'edition_conflict:'+f)),
   ...sourceConflicts.map(f=>'identity_or_source:'+f),
   'manual_identity_and_source_rights_approval'
  ];
  return {title:book.title,author:book.author,workSourceKey:book.workSourceKey,
   authorSourceKeys:book.authorSourceKeys||[],editionCount:editions.length,
   bestEditionForReview:selected,alternateEditionCount:Math.max(0,editions.length-1),
   workMissing,sourceConflictCodes:[...new Set(sourceConflicts)],
   blockers:[...new Set(blockers)],reviewRequired:true,importEligible:false};
 });
 return {mode:'ten_book_readiness_review_only',books,
  totals:{works:books.length,editions:books.reduce((n,b)=>n+b.editionCount,0),
   bestEditionsWithCoreFields:books.filter(b=>b.bestEditionForReview?.missing.length===0).length,
   worksMissingDescription:books.filter(b=>b.workMissing.includes('description')).length,
   worksMissingFirstPublicationDate:books.filter(b=>b.workMissing.includes('firstPublicationDate')).length,
   readyForAutomaticImport:0},
  notes:['One candidate edition per canonical work is shortlisted for HUMAN review, not approved.',
   'All unknown formats and missing bibliographic fields remain missing.',
   'Source descriptions/covers must pass rights review before publication.',
   'Do not create a duplicate work or author for an edition or audiobook.',
   'No production import, publication or member-relationship changes.']};
}
export function run(args){
 const opts={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--out'].includes(args[i])||!args[i+1])throw Error('Usage: --input enriched-candidates.json --out directory');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Both --input and --out are required');
 const result=assess(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'ten-book-readiness.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');
 renameSync(file+'.partial',file);
 return {file,totals:result.totals,status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
