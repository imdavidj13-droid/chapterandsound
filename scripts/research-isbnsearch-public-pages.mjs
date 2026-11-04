#!/usr/bin/env node
/**
 * Optional ISBNsearch.org public-page research adapter.
 * Read-only; never bypasses login, CAPTCHA, access denial or robots policy.
 * Results remain provisional until source usage rights and canonical identities
 * are reviewed. No production DB access.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const AGENT='ChapterAndSoundISBNResearch';
const sleep=n=>new Promise(r=>setTimeout(r,n));
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const decode=x=>String(x||'').replace(/&(?:amp|nbsp|quot|apos|lt|gt|#(\d+)|#x([a-f0-9]+));/gi,(match,d,h)=>{
 const named={amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>'};
 return named[match.slice(1,-1).toLowerCase()]||((d||h)?String.fromCodePoint(parseInt(d||h,d?10:16)):match);
});
const visible=html=>decode(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<\/?(?:p|div|h[1-6]|li|tr|dt|dd|br)\b[^>]*>/gi,'\n')
 .replace(/<[^>]+>/g,' ').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n')
 .replace(/\n{2,}/g,'\n')).trim();
const binding=v=>{
 const s=norm(v);
 if(/^(?:paperback|softcover|softback|mass market paperback)$/.test(s))return 'paperback';
 if(/^(?:hardcover|hardback|hard cover|hard bound)$/.test(s))return 'hardback';
 if(/^(?:ebook|e book|electronic resource ebook|electronic book|kindle edition)$/.test(s))return 'ebook';
 if(/^(?:audiobook|audio book|audio cd|mp3 cd|audio download)$/.test(s))return 'audiobook';
 return null;
};
export function parseIsbnSearch(html,isbn){
 const plain=visible(html);
 const capture=(label)=>plain.match(new RegExp('(?:^|\\n)\\s*'+label+'\\s*:\\s*([^\\n]+)','im'))?.[1]?.trim()||null;
 const found13=capture('ISBN-13'),found10=capture('ISBN-10');
 const bindingRaw=capture('Binding');
 const title=plain.match(/(?:^|\n)([^\n]+)\n\s*ISBN-13\s*:/i)?.[1]?.trim()||null;
 if(!found13&&!found10)return {status:'no_structured_isbn',url:'https://isbnsearch.org/isbn/'+isbn};
 if(isbn!==found13&&isbn!==found10)return {status:'isbn_mismatch',found13,found10};
 return {status:'matched_isbn',isbn13:found13,isbn10:found10,title,
  author:capture('Author'),publisher:capture('Publisher'),
  publicationDate:capture('Published'),bindingRaw,format:binding(bindingRaw)};
}
const allowedPath=(robots,path)=>{
 const groups=[],lines=robots.split(/\r?\n/);let current=null,ruleStarted=false;
 for(const raw of lines){
  const line=raw.split('#')[0].trim();if(!line)continue;
  const pos=line.indexOf(':');if(pos<0)continue;
  const key=line.slice(0,pos).trim().toLowerCase(),val=line.slice(pos+1).trim();
  if(key==='user-agent'){
   if(!current||ruleStarted){current={agents:[],rules:[]};groups.push(current);ruleStarted=false}
   current.agents.push(val.toLowerCase());
  }else if((key==='allow'||key==='disallow')&&current){
   current.rules.push({key,path:val});ruleStarted=true;
  }
 }
 const matches=groups.filter(g=>g.agents.includes(AGENT.toLowerCase()));
 const applicable=matches.length?matches:groups.filter(g=>g.agents.includes('*'));
 if(!applicable.length)return false; // fail closed, no assumed permission
 const rules=applicable.flatMap(g=>g.rules).filter(r=>r.path&&path.startsWith(r.path.replace(/\*.*$/,'')));
 rules.sort((a,b)=>b.path.length-a.path.length||(a.key==='allow'?-1:1));
 return rules.length?rules[0].key==='allow':true;
};
export function checkRobots(txt,path){return allowedPath(txt,path)}
export function validateMatch(book,edition,parsed){
 if(parsed.status!=='matched_isbn')return parsed.status;
 if(parsed.isbn13!==edition.isbn13&&parsed.isbn10!==edition.isbn10)return 'edition_isbn_mismatch';
 const title=norm(parsed.title),wanted=norm(book.title);
 if(!title||!(title===wanted||title.startsWith(wanted+' ')))return 'title_mismatch';
 const author=norm(parsed.author);
 if(!author||!author.includes('kernick')||!norm(book.author).split(' ').every(n=>author.includes(n)))
  return 'author_mismatch';
 if(!parsed.format)return 'no_explicit_binding';
 return 'provisional_binding';
}
export async function research(input,{getPage,getRobots,max=10,delay=1500}={}){
 if(!Array.isArray(input?.candidates)||input.candidates.length!==10)throw Error('Expected ten canonical pilot works');
 const books=structuredClone(input.candidates);
 const queue=books.flatMap(book=>book.editions.filter(e=>e.format==='unknown'&&/^97[89]\d{10}$/.test(e.isbn13||''))
  .map(edition=>({book,edition}))).slice(0,max);
 const robots=await getRobots();
 if(!checkRobots(robots,'/isbn/9780000000000'))
  throw Error('ISBNsearch robots policy not verifiably permitting ISBN result lookup; no pages requested');
 const findings=[],errors=[];
 for(const {book,edition} of queue){
  const path='/isbn/'+edition.isbn13;
  if(!checkRobots(robots,path)){errors.push({isbn:edition.isbn13,error:'robots_disallow'});continue}
  try{
   const html=await getPage(path);
   const parsed=parseIsbnSearch(html,edition.isbn13);
   const status=validateMatch(book,edition,parsed);
   const row={title:book.title,editionSourceKey:edition.sourceKey,isbn13:edition.isbn13,
    url:'https://isbnsearch.org'+path,status,
    ...(status==='provisional_binding'?{format:parsed.format,publisher:parsed.publisher,
     publicationDate:parsed.publicationDate,source:'isbnsearch_public_page'}:{})};
   findings.push(row);
   // Deliberately do not mutate book.editions: preserve approved format provenance.
  }catch(err){
   const message=String(err);
   errors.push({isbn:edition.isbn13,error:message});
   if(/HTTP (401|403|429)|captcha|challenge/i.test(message))break;
  }
  if(delay)await sleep(delay);
 }
 return {mode:'isbnsearch_public_page_research_only',findings,errors,
  totals:{attempted:queue.length,checked:findings.length,errors:errors.length,
   provisionalFormats:findings.filter(x=>x.status==='provisional_binding').length},
  candidateChanges:0,databaseWrites:0,
  notes:['Research observations are not production metadata imports.',
   'Permission to retain/redistribute information remains unverified.',
   'No protected access or rate-limiting bypass attempted.']};
}
export async function run(argv){
 const args={};
 for(let i=0;i<argv.length;i+=2)args[argv[i]]=argv[i+1];
 if(!args['--input']||!args['--out'])throw Error('Required --input and --out');
 const max=Number(args['--max']??10),delay=Number(args['--delay-ms']??1500);
 if(!Number.isInteger(max)||max<1||max>20||!Number.isInteger(delay)||delay<1000||delay>10000)
  throw Error('Maximum 20 lookups, minimum 1000ms delay');
 const base=args['--api-base']||'https://isbnsearch.org';
 if(args['--api-base']&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error('Custom site base only permitted for local fixtures');
 const out=resolve(args['--out']),cache=join(out,'isbnsearch-research-cache');
 mkdirSync(cache,{recursive:true});
 const response=async(path,kind)=>{
  const url=base+path;
  const res=await fetch(url,{headers:{Accept:'text/html,text/plain',
   'User-Agent':AGENT},signal:AbortSignal.timeout(16000)});
  if(!res.ok)throw Error('HTTP '+res.status+' from '+kind);
  const value=await res.text();
  if(/captcha|verify you are human|cloudflare challenge/i.test(value))
   throw Error('Access challenge; stop');
  return value;
 };
 const robots=await response('/robots.txt','robots');
 const getPage=async(path)=>{
  const file=join(cache,path.split('/').pop()+'.html');
  if(existsSync(file))return readFileSync(file,'utf8');
  const html=await response(path,'ISBN page');
  writeFileSync(file+'.partial',html);renameSync(file+'.partial',file);
  return html;
 };
 const result=await research(JSON.parse(readFileSync(resolve(args['--input']),'utf8')),
  {getPage,getRobots:async()=>robots,max,delay});
 const file=join(out,'isbnsearch-research-report.json');
 writeFileSync(file+'.partial',JSON.stringify(result,null,2)+'\n');
 renameSync(file+'.partial',file);
 return {report:file,totals:result.totals,status:'PROVISIONAL_RESEARCH_ONLY_NO_DATABASE_WRITES'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 run(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(error=>{console.error(error);process.exitCode=1});
