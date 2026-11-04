#!/usr/bin/env node
/**
 * Strict edition-specific factual format reconciliation for the ten-work pilot.
 * Requires BOTH Open Library edition key and ISBN to match the expected work.
 * Large-print is independent of binding. No D1 or publishing operations.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const norm=x=>typeof x==='string'?x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
export function reconcileFormats(input,evidence){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten canonical works');
 if(!Array.isArray(evidence?.records))throw Error('Missing evidence records');
 const candidates=structuredClone(input.candidates),applied=[],conflicts=[],unmatched=[],used=new Set();
 for(const fact of evidence.records){
  if(!/^\/books\/OL\d+M$/.test(fact.editionSourceKey)||
   !/^97[89]\d{10}$/.test(fact.isbn13)||
   !['ebook','paperback','hardback',null].includes(fact.format)||
   ![null,'large_print'].includes(fact.feature)||
   (!fact.format&&!fact.feature)||
   typeof fact.sourceUrl!=='string'||!fact.sourceUrl.startsWith('https://'))
   throw Error('Invalid edition-specific format evidence');
  const key=fact.editionSourceKey+'|'+fact.isbn13;
  if(used.has(key))throw Error('Duplicate format evidence for same edition and ISBN');
  used.add(key);
  const matches=candidates.flatMap(book=>(book.editions||[]).filter(e=>e.sourceKey===fact.editionSourceKey)
   .map(edition=>({book,edition})));
  if(matches.length!==1||norm(matches[0].book.title)!==norm(fact.title)||
    (matches[0].edition.isbn13!==fact.isbn13&&
     !(matches[0].edition.isbn13Candidates||[]).includes(fact.isbn13))){
   unmatched.push({title:fact.title,isbn13:fact.isbn13,sourceKey:fact.editionSourceKey,
    reason:'edition_identity_or_isbn_mismatch'});continue;
  }
  const {book,edition}=matches[0],changes=[];
  edition.fieldProvenance ||= {};
  if(fact.format){
   if(!edition.format||edition.format==='unknown'){
    edition.format=fact.format;
    edition.fieldProvenance.format={source:fact.source,url:fact.sourceUrl,
     isbn13:fact.isbn13,editionSourceKey:fact.editionSourceKey,status:'explicit'};
    changes.push('format');
   }else if(edition.format!==fact.format){
    conflicts.push({title:book.title,editionSourceKey:edition.sourceKey,
     field:'format',existing:edition.format,evidence:fact.format});
   }
  }
  if(fact.feature==='large_print'){
   if(edition.largePrint===false)conflicts.push({title:book.title,editionSourceKey:edition.sourceKey,
    field:'largePrint',existing:false,evidence:true});
   else if(edition.largePrint!==true){
    edition.largePrint=true;
    edition.fieldProvenance.largePrint={source:fact.source,url:fact.sourceUrl,
     isbn13:fact.isbn13,editionSourceKey:fact.editionSourceKey,status:'explicit'};
    changes.push('largePrint');
   }
  }
  applied.push({title:book.title,editionSourceKey:edition.sourceKey,isbn13:fact.isbn13,changes});
 }
 const totalUnknown=candidates.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0);
 return {candidates:{candidates,mode:'exact_format_review_only',importEligible:false},
  report:{mode:'exact_edition_format_review_only',
   totals:{works:candidates.length,observations:evidence.records.length,matched:applied.length,
    fieldsFilled:applied.reduce((n,a)=>n+a.changes.length,0),
    formatsResolved:applied.filter(a=>a.changes.includes('format')).length,
    largePrintTagged:applied.filter(a=>a.changes.includes('largePrint')).length,
    conflicts:conflicts.length,unmatched:unmatched.length,remainingUnknownFormats:totalUnknown},
   applied,conflicts,unmatched,
   warnings:['Requires matching Open Library edition ID and ISBN, not just same title.',
    'Large-print evidence alone never implies paperback or hardback.',
    'No canonical work/edition merge, production import, publication, or D1 writes.']}};
}
export function run(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  if(!['--input','--evidence','--out'].includes(argv[i])||!argv[i+1])throw Error('Required --input --evidence --out');
  opts[argv[i]]=argv[i+1];
 }
 if(!opts['--input']||!opts['--evidence']||!opts['--out'])throw Error('Required --input --evidence --out');
 const result=reconcileFormats(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(opts['--evidence']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 for(const [name,value] of [['targeted-format-report.json',result.report],
  ['targeted-format-enriched-candidates.json',result.candidates]]){
  const path=join(dir,name);
  writeFileSync(path+'.partial',JSON.stringify(value,null,2)+'\n');renameSync(path+'.partial',path);
 }
 return {report:join(dir,'targeted-format-report.json'),totals:result.report.totals,
  status:'REVIEW_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
