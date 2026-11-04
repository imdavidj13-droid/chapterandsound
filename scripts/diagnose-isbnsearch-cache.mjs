#!/usr/bin/env node
/**
 * Diagnose cached ISBNsearch pages without network calls, copying HTML,
 * mutating candidate files, or leaking cookies. Only structural indicators
 * and the public ISBN are reported.
 */
import {readFileSync,readdirSync,existsSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const decode=s=>s.replace(/&(?:nbsp|amp|quot|lt|gt);/gi,v=>({ '&nbsp;':' ', '&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>'}[v.toLowerCase()]||v));
export function classifyPage(html,isbn){
 const text=String(html||'');
 const title=decode(text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')
  .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
 const hasBookInfo=/class=["'][^"']*\bbookinfo\b/i.test(text);
 const hasIsbnField=/ISBN(?:-|\s*)13\s*:/i.test(text)||/ISBN(?:-|\s*)10\s*:/i.test(text);
 const hasRequestedIsbn=text.includes(isbn);
 const hasChallenge=/(captcha|verify you are human|just a moment|access denied|bot detection|enable javascript to continue)/i.test(text);
 const hasRedirect=/<meta\s+http-equiv=["']refresh/i.test(text);
 const pageKind=hasChallenge?'access_challenge':hasRedirect?'html_redirect':
  (hasIsbnField&&hasRequestedIsbn?'isbn_record':
  hasBookInfo?'bookinfo_without_isbn':
  hasRequestedIsbn?'isbn_mentioned_no_structured_fields':'non_record_page');
 return {isbn,bytes:Buffer.byteLength(text),title,
  hasBookInfo,hasIsbnField,hasRequestedIsbn,hasChallenge,hasRedirect,pageKind};
}
export function inspectCache(input,dir){
 if(!Array.isArray(input?.candidates))throw Error('Expected candidate manifest');
 const wanted=[...new Set(input.candidates.flatMap(b=>(b.editions||[])
  .filter(e=>e.format==='unknown'&&/^97[89]\d{10}$/.test(e.isbn13||'')).map(e=>e.isbn13)))];
 const items=wanted.map(isbn=>{
  const path=join(dir,isbn+'.html');
  return existsSync(path)?classifyPage(readFileSync(path,'utf8'),isbn):
   {isbn,pageKind:'not_cached'};
 });
 const summary=Object.fromEntries([...new Set(items.map(x=>x.pageKind))].map(kind=>
  [kind,items.filter(x=>x.pageKind===kind).length]));
 return {mode:'isbnsearch_cache_structure_diagnostic',cachedCount:items.filter(x=>x.pageKind!=='not_cached').length,
  statusCounts:summary,items,
  note:'No HTTP requests, no raw HTML, cookies, or production database changes.'};
}
export function run(args){
 const options={};for(let i=0;i<args.length;i+=2){
  if(!['--input','--out'].includes(args[i])||!args[i+1])throw Error('Required --input --out');
  options[args[i]]=args[i+1];
 }
 if(!options['--input']||!options['--out'])throw Error('Required --input --out');
 const output=resolve(options['--out']);
 const report=inspectCache(JSON.parse(readFileSync(resolve(options['--input']),'utf8')),
  join(output,'isbnsearch-research-cache'));
 const path=join(output,'isbnsearch-cache-diagnostic.json');
 writeFileSync(path+'.partial',JSON.stringify(report,null,2)+'\n');renameSync(path+'.partial',path);
 return {report:path,cachedCount:report.cachedCount,statusCounts:report.statusCounts,
  sample:report.items.slice(0,10),status:'CACHE_INSPECTION_ONLY'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
