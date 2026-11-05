#!/usr/bin/env node
/**
 * Select FIVE canonical Simon Kernick books for the existing Catalogue Import Centre.
 * Draft-only, no network, no D1 writes. Excludes audio, unknown format, missing ISBN,
 * invalid ISBNs, suspect duplicate identities, and unknown author/work identities.
 * Does not claim fields have publication rights or that editions are complete.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const validISBN=v=>typeof v==='string'&&/^97[89]\d{10}$/.test(v)&&
 (10-[...v.slice(0,12)].reduce((a,d,i)=>a+Number(d)*(i%2?3:1),0)%10)%10===Number(v[12]);
const date=v=>typeof v==='string'&&/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(v)?v:undefined;
const str=v=>typeof v==='string'&&v.trim()?v.trim():undefined;
const allowed=new Set(['paperback','hardback','ebook','other_print','other_digital']);
export function prepareFiveBookDrafts(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)
  throw Error('Expected ten canonical pilot book candidates');
 const wanted=['Relentless','Siege','The Crime Trade','A Good Day to Die','The Payback'];
 const source=new Set(),isbnUsed=new Set(),candidates=[],quarantined=[];
 for(const title of wanted){
  const book=input.candidates.find(b=>b.title===title);
  if(!book)throw Error('Missing canonical book '+title);
  if(!/^\/works\/OL\d+W$/.test(book.workSourceKey)||
   !(book.authorSourceKeys||[]).some(k=>/^\/authors\/OL\d+A$/.test(k)))
   throw Error('Missing canonical work or author identity for '+title);
  const editions=[];
  for(const ed of book.editions||[]){
   let reason=null;
   if(!/^\/books\/OL\d+M$/.test(ed.sourceKey))reason='non_openlibrary_edition_identifier';
   else if(!validISBN(ed.isbn13))reason='missing_or_invalid_primary_isbn13';
   else if(!allowed.has(ed.format))reason='unsupported_or_unknown_format';
   else if(source.has(ed.sourceKey)||isbnUsed.has(ed.isbn13))reason='repeated_edition_or_isbn';
   if(reason){quarantined.push({title,editionSourceKey:ed.sourceKey,isbn13:ed.isbn13||null,reason});continue}
   source.add(ed.sourceKey);isbnUsed.add(ed.isbn13);
   editions.push({sourceKey:ed.sourceKey,isbn13:ed.isbn13,format:ed.format,
    ...(str(ed.publisher)?{publisher:ed.publisher}:{}),
    ...(date(ed.publicationDate)?{publicationDate:date(ed.publicationDate)}:{}),
    ...(str(ed.language)?{language:ed.language}:{}),
    ...(Number.isSafeInteger(ed.pageCount)&&ed.pageCount>0?{pageCount:ed.pageCount}:{})});
  }
  if(!editions.length)throw Error('No ISBN-identified supported editions for '+title+'; refusing to fabricate one');
  // Only save metadata already present in the review manifest. No ISBNdb field transfers.
  candidates.push({sourceId:'openlibrary',sourceKey:book.workSourceKey,
   workSourceKey:book.workSourceKey,title,author:book.author,
   authorSourceKeys:book.authorSourceKeys,
   ...(Array.isArray(book.subjects)?{subjects:book.subjects}:{}),
   ...(str(book.originalLanguage)?{originalLanguage:book.originalLanguage}:{}),
   ...(date(book.firstPublicationDate)?{firstPublicationDate:date(book.firstPublicationDate)}:{}),
   editions});
 }
 if(candidates.reduce((n,b)=>n+b.editions.length,0)>50)
  throw Error('More than 50 supported editions; reduce batch before importing');
 return {status:'READY_FOR_PREVIEW_NOT_IMPORTED',mode:'five_work_first_private_drafts',
  workFirstDraft:true,confirmed:false,candidates,
  review:{books:candidates.length,editionCount:candidates.reduce((n,b)=>n+b.editions.length,0),
   quarantined:quarantined.length,excluded:quarantined,
   warnings:['The existing import route must be used with an authenticated owner session.',
    'Run dry-run preview first, resolve any existing-work/ISBN/author matches.',
    'Save is an explicit separate action; only private drafts, never published.',
    'No covers, ISBNdb-licensed content, or unknown-format editions included.',
    'Existing edition formats need human confirmation of their underlying field provenance.']}};
}
export function run(argv){
 const opts={};for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out'].includes(argv[i])||!argv[i+1])throw Error('Unexpected argument '+argv[i]);
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Required --input --out');
 const result=prepareFiveBookDrafts(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const file=join(dir,'five-books-import-centre.json');
 const payload={candidates:result.candidates};
 writeFileSync(file+'.partial',JSON.stringify(payload,null,2)+'\n');renameSync(file+'.partial',file);
 return {status:result.status,importFile:file,review:result.review};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 try{console.log(JSON.stringify(run(process.argv.slice(2)),null,2))}
 catch(error){console.error('[five-book-draft] '+error.message);process.exitCode=1}
