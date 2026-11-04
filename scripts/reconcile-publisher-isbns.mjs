#!/usr/bin/env node
/**
 * Apply publisher-sourced bibliographic facts only to EXACT pre-existing ISBN
 * editions of the same canonical title + author. Outputs separate local files.
 * Does not alter input candidates, databases, or published/member records.
 * Publisher marketing copy and cover image bytes are not collected.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const norm=x=>typeof x==='string'?x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
const valid13=x=>{if(!/^97[89]\d{10}$/.test(x))return false;
 const sum=[...x.slice(0,12)].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0);
 return (10-sum%10)%10===Number(x[12]);};
const datePrecision=value=>{
 const v=String(value||'').trim();
 if(/^\\d{4}$/.test(v))return {kind:'year',year:v};
 if(/^\\d{4}-\\d{2}$/.test(v))return {kind:'month',year:v.slice(0,4),month:v};
 if(/^\\d{4}-\\d{2}-\\d{2}$/.test(v))return {kind:'day',year:v.slice(0,4),month:v.slice(0,7),day:v};
 return {kind:'unstructured'};
};
export function classifyDisagreement(key,existing,observed){
 if(key!=='publicationDate')return 'different_values';
 const a=datePrecision(existing),b=datePrecision(observed);
 if(a.kind==='unstructured'||b.kind==='unstructured')return 'date_not_directly_comparable';
 if(a.year!==b.year)return 'different_year';
 if(a.kind==='year'||b.kind==='year')return 'same_year_different_precision';
 if(a.month!==b.month)return 'different_month_same_year';
 if(a.kind==='month'||b.kind==='month')return 'same_month_different_precision';
 return 'different_day_same_month';
}
export function reconcilePublisher(input,evidence){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten candidates');
 if(!Array.isArray(evidence?.records))throw Error('Missing publisher facts');
 const candidates=structuredClone(input.candidates);
 const found=[],unmatched=[],conflicts=[],seen=new Set();
 const permitted=['format','publicationDate','pageCount'];
 for(const fact of evidence.records){
  if(!valid13(fact.isbn13)||!['paperback','hardback','ebook','audiobook'].includes(fact.format)||
    !/^https:\/\/www\.penguin\.co\.uk\/books\//.test(fact.sourceUrl))
   throw Error('Invalid publisher fact or source URL');
  if(seen.has(fact.isbn13))throw Error('Duplicate publisher ISBN evidence');
  seen.add(fact.isbn13);
  const book=candidates.find(b=>norm(b.title)===norm(fact.title)&&norm(b.author)===norm(fact.author));
  if(!book){unmatched.push({isbn13:fact.isbn13,title:fact.title,reason:'work_identity_missing'});continue}
  const editions=(book.editions||[]).filter(e=>e.isbn13===fact.isbn13);
  if(editions.length!==1){
   unmatched.push({isbn13:fact.isbn13,title:fact.title,reason:editions.length?'ambiguous_isbn':'edition_isbn_not_found'});
   continue;
  }
  const ed=editions[0], changed=[];
  ed.fieldProvenance ||= {};
  for(const key of permitted){
   const observed=fact[key];
   const old=ed[key];
   if(observed==null)continue;
   if(old==null||old===''||(key==='format'&&old==='unknown')){
    ed[key]=observed;
    ed.fieldProvenance[key]={source:'penguin_uk_product_page',identifier:fact.isbn13,
     url:fact.sourceUrl,status:'source_explicit',checkedOn:fact.checkedOn};
    changed.push(key);
   }else if(String(old).trim().toLowerCase()!==String(observed).trim().toLowerCase()){
    conflicts.push({title:book.title,isbn13:fact.isbn13,editionSourceKey:ed.sourceKey,
     field:key,retainedExisting:old,alternative:observed,classification:classifyDisagreement(key,old,observed),sourceUrl:fact.sourceUrl});
   }
  }
  // Imprint and publisher are related but NOT synonymous; don't overwrite
  // publisher with an imprint and don't silently invent the parent publisher.
  found.push({title:book.title,isbn13:fact.isbn13,editionSourceKey:ed.sourceKey,
   fieldsFilled:changed,imprintEvidence:fact.imprint,sourceUrl:fact.sourceUrl});
 }
 const byTitle=candidates.map(book=>({
  title:book.title,
  matchedISBNs:found.filter(row=>row.title===book.title).map(row=>row.isbn13),
  filledFieldCount:found.filter(row=>row.title===book.title).reduce((n,row)=>n+row.fieldsFilled.length,0),
  conflicts:conflicts.filter(row=>row.title===book.title),
  unmatchedEvidence:unmatched.filter(row=>row.title===book.title),
  remainingUnknownFormats:(book.editions||[]).filter(e=>e.format==='unknown').length
 }));
 const conflictClassificationCounts=Object.fromEntries([...new Set(conflicts.map(c=>c.classification))].map(k=>
  [k,conflicts.filter(c=>c.classification===k).length]));
 const report={mode:'publisher_isbn_reconciliation_review_only',
  totals:{evidenceRecords:evidence.records.length,matchedEditions:found.length,
   newlyFilledFields:found.reduce((n,r)=>n+r.fieldsFilled.length,0),
   conflicts:conflicts.length,unmatchedEvidence:unmatched.length,
   remainingUnknownFormats:candidates.reduce((n,b)=>n+(b.editions||[]).filter(e=>e.format==='unknown').length,0)},
  matched:found,unmatched,conflicts,conflictClassificationCounts,books:byTitle,
  notes:['Only explicit facts on identical ISBN and title/author are applied to local output.',
   'Conflicts are retained for investigation, not overwritten.',
   'Imprint does not automatically equal publisher.',
   'Publication dates may have differing source granularities and require conflict review.',
   'No author, work or edition is created. No Cloudflare/D1 access or publication.']};
 return {report,candidates:{candidates}};
}
export function run(args){
 const opts={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--evidence','--out'].includes(args[i])||!args[i+1])throw Error('Required --input --evidence --out');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--input']||!opts['--evidence']||!opts['--out'])throw Error('Required --input --evidence --out');
 const result=reconcilePublisher(JSON.parse(readFileSync(resolve(opts['--input']),'utf8')),
  JSON.parse(readFileSync(resolve(opts['--evidence']),'utf8')));
 const dir=resolve(opts['--out']);mkdirSync(dir,{recursive:true});
 for(const [name,data] of [['publisher-isbn-report.json',result.report],
  ['publisher-enriched-candidates.json',result.candidates]]){
  const file=join(dir,name);writeFileSync(file+'.partial',JSON.stringify(data,null,2)+'\n');renameSync(file+'.partial',file);
 }
 return {report:join(dir,'publisher-isbn-report.json'),totals:result.report.totals,
  status:'LOCAL_ONLY_PUBLISHER_EVIDENCE_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
