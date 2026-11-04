#!/usr/bin/env node
/**
 * Propose missing publisher editions under existing canonical works.
 * Reads locally saved publisher-enriched candidates + approved factual ISBN
 * evidence, and writes a SEPARATE review-only file. No network, D1 or import.
 * Source-specific publisher keys must never pretend to be Open Library IDs.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const norm=value=>typeof value==='string'
 ?value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
const isIsbn13=value=>{
 if(typeof value!=='string'||!/^97[89]\d{10}$/.test(value))return false;
 const sum=[...value.slice(0,12)].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(value[12]);
};
const permitted=new Set(['paperback','hardback','ebook']);
const factProvenance=(fact,field)=>({source:'penguin_uk_product_page',
 sourceUrl:fact.sourceUrl,identifier:fact.isbn13,field,status:'source_explicit',
 checkedOn:fact.checkedOn});

export function proposePublisherEditions(enriched,evidence){
 if(!Array.isArray(enriched?.candidates)||enriched.candidates.length!==10)
  throw Error('Expected ten canonical work candidates');
 if(!Array.isArray(evidence?.records))throw Error('Missing publisher evidence');
 const books=structuredClone(enriched.candidates);
 const proposed=[],blocked=[],existing=[],seenFacts=new Set();
 const sourceWorkKeys=new Set();
 const globalISBNs=new Map();
 for(const book of books){
  if(!book?.workSourceKey||!book.title||!book.author||!Array.isArray(book.editions))
   throw Error('Invalid canonical work in pilot');
  if(sourceWorkKeys.has(book.workSourceKey))throw Error('Duplicate canonical work identity');
  sourceWorkKeys.add(book.workSourceKey);
  for(const ed of book.editions){
   const values=[...new Set([ed.isbn13,...(ed.isbn13Candidates||[])].filter(Boolean))];
   for(const isbn of values){
    if(!isIsbn13(isbn))continue;
    const group=globalISBNs.get(isbn)||[];
    group.push({workSourceKey:book.workSourceKey,sourceKey:ed.sourceKey});
    globalISBNs.set(isbn,group);
   }
  }
 }
 for(const fact of evidence.records){
  const isbn=fact?.isbn13;
  if(!isIsbn13(isbn)||!permitted.has(fact.format)||
   typeof fact.sourceUrl!=='string'||
   !/^https:\/\/www\.penguin\.co\.uk\/books\/[^?#]+$/.test(fact.sourceUrl)||
   !fact.sourceUrl.endsWith('/'+isbn)||
   !/^\d{4}-\d{2}-\d{2}$/.test(fact.publicationDate||'')||
   !Number.isSafeInteger(fact.pageCount)||fact.pageCount<=0||
   !norm(fact.title)||!norm(fact.author))
   throw Error('Invalid publisher edition evidence');
  if(seenFacts.has(isbn))throw Error('Duplicate evidence ISBN '+isbn);
  seenFacts.add(isbn);
  const matches=books.filter(b=>norm(b.title)===norm(fact.title)&&norm(b.author)===norm(fact.author));
  if(matches.length!==1){
   blocked.push({isbn13:isbn,title:fact.title,reason:'missing_or_ambiguous_canonical_work'});
   continue;
  }
  const book=matches[0];
  const previous=globalISBNs.get(isbn)||[];
  if(previous.length){
   if(previous.length===1&&previous[0].workSourceKey===book.workSourceKey){
    existing.push({isbn13:isbn,title:book.title,editionSourceKey:previous[0].sourceKey});
   }else blocked.push({isbn13:isbn,title:book.title,reason:'isbn_ambiguous_or_shared_across_works',
    existingSourceKeys:previous.map(x=>x.sourceKey)});
   continue;
  }
  const sourceKey='penguin-uk:isbn13:'+isbn;
  const edition={
   sourceId:'penguin_uk',sourceKey,sourceWorkKeys:[book.workSourceKey],
   title:book.title,isbn13:isbn,isbn13Candidates:[isbn],isbn10:null,
   isbn10Candidates:[],format:fact.format,physicalFormat:null,
   publisher:null,imprint:fact.imprint||null,
   publicationDate:fact.publicationDate,pageCount:fact.pageCount,
   language:null,coverIds:[],publisherEvidenceUrl:fact.sourceUrl,
   fieldProvenance:Object.fromEntries(['isbn13','format','imprint','publicationDate','pageCount'].map(field=>
    [field,factProvenance(fact,field)])),
   identityStatus:'publisher_isbn_provisional',
   importEligible:false,publicationEligible:false,
   validationIssues:['publisher_imprint_not_equivalent_to_publisher',
    'publisher_edition_identity_pending_canonical_cross_check',
    'rights_and_cover_review_required']
  };
  book.editions.push(edition);
  globalISBNs.set(isbn,[{workSourceKey:book.workSourceKey,sourceKey}]);
  proposed.push({title:book.title,workSourceKey:book.workSourceKey,
   isbn13:isbn,format:fact.format,editionSourceKey:sourceKey,
   sourceUrl:fact.sourceUrl,unresolved:edition.validationIssues});
 }
 return {
  candidates:{candidates:books,mode:'publisher_additions_review_only',importEligible:false},
  report:{mode:'publisher_missing_editions_draft_only',
   totals:{works:books.length,publisherFacts:evidence.records.length,
    alreadyPresent:existing.length,proposedAdditions:proposed.length,
    blocked:blocked.length,
    resultingEditions:books.reduce((n,b)=>n+b.editions.length,0),
    unknownFormats:books.reduce((n,b)=>n+b.editions.filter(e=>e.format==='unknown').length,0)},
   proposed,existing,blocked,
   notes:['Only source-specific edition candidates are created under existing canonical works.',
    'No Open Library source identifiers are invented or reused.',
    'ISBN collisions are blocked; imprint does not become publisher.',
    'These are incomplete, unpublished review candidates and not production-import manifests.',
    'Descriptions or images are not fetched or retained. No database writes.']}
 };
}
export function run(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--input','--evidence','--out'].includes(args[i])||!args[i+1])
   throw Error('Required --input --evidence --out');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--evidence']||!opts['--out'])throw Error('Required --input --evidence --out');
 const result=proposePublisherEditions(
  JSON.parse(readFileSync(resolve(opts['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(opts['--evidence']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 for(const [name,value] of [
  ['publisher-additions-report.json',result.report],
  ['publisher-with-proposed-editions.json',result.candidates]]){
  const file=join(dir,name);
  writeFileSync(file+'.partial',JSON.stringify(value,null,2)+'\n');
  renameSync(file+'.partial',file);
 }
 return {report:join(dir,'publisher-additions-report.json'),
  totals:result.report.totals,status:'REVIEW_ONLY_NO_PRODUCTION_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
