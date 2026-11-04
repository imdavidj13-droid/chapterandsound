#!/usr/bin/env node
/**
 * Produce one deterministic, deduplicated evidence-research queue for every
 * unknown-format edition. No network requests and no catalogue modifications.
 * Queries are exact identifiers, never inferred formats.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const isbn13=v=>{
 if(typeof v!=='string'||!/^97[89]\d{10}$/.test(v))return false;
 const total=[...v.slice(0,12)].reduce((sum,ch,i)=>sum+Number(ch)*(i%2?3:1),0);
 return (10-total%10)%10===Number(v[12]);
};
const isbn10=v=>{
 if(typeof v!=='string'||!/^[0-9]{9}[0-9X]$/.test(v))return false;
 return [...v].reduce((sum,ch,i)=>sum+(10-i)*(ch==='X'?10:Number(ch)),0)%11===0;
};
export function createFormatResearchQueue(input){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)
  throw Error('Expected ten canonical pilot books');
 const queue=[],seenKeys=new Set(),isbnIndices=new Map();
 for(const book of input.candidates){
  if(!book.workSourceKey||!book.title||!book.author||!Array.isArray(book.editions))
   throw Error('Incomplete canonical work identity');
  for(const ed of book.editions){
   if(ed.format!=='unknown')continue;
   if(!/^\/books\/OL\d+M$/.test(ed.sourceKey)||seenKeys.has(ed.sourceKey))
    throw Error('Unknown edition has duplicate or invalid source identity');
   seenKeys.add(ed.sourceKey);
   const isbn=isbn13(ed.isbn13)?ed.isbn13:null;
   const isbnTen=isbn10(ed.isbn10)?ed.isbn10:null;
   const candidates13=[...new Set((ed.isbn13Candidates||[]).filter(isbn13))];
   const sourceUrl='https://openlibrary.org'+ed.sourceKey;
   queue.push({title:book.title,author:book.author,workSourceKey:book.workSourceKey,
    editionSourceKey:ed.sourceKey,isbn13:isbn,isbn10:isbnTen,
    otherCandidateISBN13s:candidates13.filter(value=>value!==isbn),
    hasUsableISBN:Boolean(isbn||isbnTen),
    evidenceLinks:{openLibraryEdition:sourceUrl,
     ...(isbn?{openLibraryIsbn:'https://openlibrary.org/isbn/'+isbn,
      isbnSearch:'https://www.google.com/search?q='+encodeURIComponent('"'+isbn+'" book format paperback hardback ebook audiobook')}:{})},
    matchRule:'require_explicit_binding_or_recording_format_and_exact_edition_identity',
    status:'requires_external_evidence'});
   if(isbn){
    const linked=isbnIndices.get(isbn)||[];
    linked.push(ed.sourceKey);
    isbnIndices.set(isbn,linked);
   }
  }
 }
 const ambiguousISBNs=[...isbnIndices.entries()].filter(([,keys])=>keys.length>1)
  .map(([isbn,editionSourceKeys])=>({isbn13:isbn,editionSourceKeys}));
 return {mode:'unknown_edition_format_research_queue',importEligible:false,
  totals:{works:input.candidates.length,unknownEditions:queue.length,
   withISBN:queue.filter(e=>e.hasUsableISBN).length,
   withoutISBN:queue.filter(e=>!e.hasUsableISBN).length,
   sharedISBNGroups:ambiguousISBNs.length},
  queue,ambiguousISBNs,
  notes:['Search links are research aids, not source evidence or format classifications.',
   'Use exact ISBN and matching work/edition identities before applying source observations.',
   'Google Books ebook sale status does not establish edition binding.',
   'Entries without ISBN require edition-key verification, not guesses.',
   'This report never changes or writes database records.']};
}
export function run(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--input','--out'].includes(argv[i])||!argv[i+1])throw Error('Required --input --out');
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--out'])throw Error('Required --input --out');
 const report=createFormatResearchQueue(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 const path=join(dir,'unknown-edition-research-queue.json');
 writeFileSync(path+'.partial',JSON.stringify(report,null,2)+'\n');
 renameSync(path+'.partial',path);
 return {report:path,totals:report.totals,status:'READ_ONLY_RESEARCH_QUEUE_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
