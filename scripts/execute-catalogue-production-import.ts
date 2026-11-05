/**
 * Controlled production execution for Chapter & Sound private catalogue drafts.
 *
 * DEFAULT: READ ONLY. Never calls a write endpoint unless:
 *   --execute --confirm IMPORT_PRIVATE_DRAFTS
 * and CATALOGUE_ADMIN_COOKIE is supplied in the process environment.
 *
 * The owner logs in to the website and passes an active browser session cookie
 * privately via the local environment. Never print, commit or upload the cookie.
 * Neither this script nor its checkpoint stores credentials.
 *
 * Requires a recent read-only production-preflight/ report built from a fresh
 * BOOK_DB export AFTER the successful rehearsal. All work IDs must appear on
 * that allowlist and their plan files must match the preflight plan digest.
 *
 * For safety, writes are capped at 10 candidates per invocation; start with 1.
 * The server separately rechecks duplicates/author identities and atomically
 * persists drafts. No public publication is attempted.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync,existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';

type Kind='edition'|'work-only';
type Candidate={sourceId?:unknown;workSourceKey?:unknown;sourceKey?:unknown;[key:string]:unknown};
type Entry={kind:Kind;key:string;file:string;candidate:Candidate};
type Outcome={key:string;kind:Kind;status:'saved'|'held';reason?:string;workId?:string};
type Ledger={version:1;planSha256:string;preflightSha256:string;results:Outcome[]};
const workPattern=/^\/works\/OL\d+W$/;
const digest=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
function flag(name:string){return process.argv.includes(name)}
function value(name:string){const pos=process.argv.indexOf(name);return pos<0?undefined:process.argv[pos+1]}
function save(path:string,data:unknown){
 const temp=path+'.tmp';
 writeFileSync(temp,JSON.stringify(data,null,2),'utf8');
 renameSync(temp,path);
}
function loadPlan(dir:string){
 const files=readdirSync(dir).filter(n=>/^(?:batch|work-only)-\d+\.json$/.test(n)).sort();
 if(!files.length)throw Error('No planned candidate files');
 const signatures:string[]=[],entries:Entry[]=[];
 for(const file of files){
  const buf=readFileSync(join(dir,file));
  signatures.push(file+':'+digest(buf));
  const document=JSON.parse(buf.toString('utf8')) as {confirmed?:boolean;importEnabled?:boolean;candidates?:Candidate[]};
  if(document.confirmed!==false||document.importEnabled===true||!Array.isArray(document.candidates))
   throw Error('Unsafe import manifest: '+file);
  const kind:Kind=file.startsWith('work-only-')?'work-only':'edition';
  for(const candidate of document.candidates){
   const key=String(candidate.workSourceKey||candidate.sourceKey||'');
   if(!workPattern.test(key))throw Error('Invalid work source key: '+file);
   entries.push({kind,key,file,candidate});
  }
 }
 return {entries,hash:digest(signatures.join('\n'))};
}
async function postJson(origin:string,path:string,body:unknown,cookie:string){
 const response=await fetch(origin+path,{method:'POST',headers:{
  'Content-Type':'application/json','Cookie':cookie,'Origin':origin
 },body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await response.json() as Record<string,unknown>;
 if(!response.ok)throw Error('HTTP '+response.status+': '+String(data.error||'server rejected the record'));
 return data;
}
async function main(){
 const plan=resolve(value('--plan')||'.private-catalogue-5000/import-plan');
 const preflight=resolve(value('--preflight')||'.private-catalogue-5000/production-preflight');
 const out=resolve(value('--out')||join(preflight,'execution'));
 const limit=Number(value('--limit')||1);
 if(!Number.isSafeInteger(limit)||limit<1||limit>10)
  throw Error('Production batch size must be between 1 and 10.');
 const {entries,hash:planHash}=loadPlan(plan);
 const preflightPath=join(preflight,'report.json');
 const eligiblePath=join(preflight,'eligible.json');
 const preflightRaw=readFileSync(preflightPath);
 const report=JSON.parse(preflightRaw.toString('utf8')) as Record<string,unknown>;
 const eligibleRaw=readFileSync(eligiblePath);
 if(report.eligibleManifestSha256!==digest(eligibleRaw))
  throw Error('Production preflight allowlist digest mismatch. Refusing to proceed.');
 const eligible=JSON.parse(eligibleRaw.toString('utf8')) as {
  dryRun?:boolean;importEnabled?:boolean;
  candidates?:Array<{kind:Kind;workSourceKey:string;file:string}>
 };
 if(report.planSha256!==planHash||report.dryRun!==true||report.importEnabled!==false
  ||report.productionWrites!==0||eligible.dryRun!==true||eligible.importEnabled!==false)
  throw Error('Current plan does not match a valid read-only production preflight.');
 const age=Date.now()-statSync(preflightPath).mtimeMs;
 if(age<0||age>4*60*60*1000)throw Error('Production preflight is older than four hours. Export a fresh BOOK_DB snapshot.');
 const allow=new Set((eligible.candidates||[]).map(e=>e.kind+':'+e.workSourceKey+':'+e.file));
 if(allow.size!==(eligible.candidates||[]).length||allow.size!==report.eligibleAgainstFreshSnapshot)
  throw Error('Eligible manifest count or uniqueness does not match the preflight report.');
 const keys=new Set<string>();
 for(const entry of entries){
  const marker=entry.kind+':'+entry.key;
  if(keys.has(marker))throw Error('Duplicate work in plan: '+marker);
  keys.add(marker);
 }
 for(const item of eligible.candidates||[]){
  if(!entries.some(e=>e.kind===item.kind&&e.key===item.workSourceKey&&e.file===item.file))
   throw Error('Preflight contains a work that is absent from the plan');
 }
 const selected=entries.filter(e=>allow.has(e.kind+':'+e.key+':'+e.file));
 if(!flag('--execute')){
  process.stdout.write(JSON.stringify({dryRun:true,productionWrites:0,
   eligible:selected.length,heldByPreflight:entries.length-selected.length,
   limit,productionExecutionAvailable:false,
   note:'Preview only. Run --execute with explicit approval and owner authentication to write.'},null,2)+'\n');
  return;
 }
 if(value('--confirm')!=='IMPORT_PRIVATE_DRAFTS')
  throw Error('Explicit --confirm IMPORT_PRIVATE_DRAFTS is required for production writes.');
 const origin=value('--origin');
 if(!origin||!/^https:\/\/[^/]+$/.test(origin)||new URL(origin).hostname!=='chapterandsound.imdavidj13.workers.dev')
  throw Error('Provide the exact HTTPS production origin with --origin and no trailing slash.');
 const cookie=process.env.CATALOGUE_ADMIN_COOKIE;
 if(!cookie||cookie.length<20)
  throw Error('Set CATALOGUE_ADMIN_COOKIE privately in your local environment. Do not share it in chat.');
 mkdirSync(out,{recursive:true});
 const checkpoint=join(out,'checkpoint.json');
 const preflightHash=digest(preflightRaw);
 let ledger:Ledger={version:1,planSha256:planHash,preflightSha256:preflightHash,results:[]};
 if(existsSync(checkpoint)){
  if(!flag('--resume'))throw Error('An execution checkpoint exists. Use --resume to avoid accidental duplicates.');
  ledger=JSON.parse(readFileSync(checkpoint,'utf8')) as Ledger;
  if(ledger.version!==1||ledger.planSha256!==planHash||ledger.preflightSha256!==preflightHash)
   throw Error('Checkpoint does not match plan/preflight. Refusing to continue.');
 }else if(flag('--resume'))throw Error('Cannot resume without an existing checkpoint.');
 const recorded=new Set<string>();
 for(const row of ledger.results){
  const marker=row.kind+':'+row.key;
  if(recorded.has(marker)||!selected.some(e=>e.kind===row.kind&&e.key===row.key))
   throw Error('Checkpoint has duplicate or out-of-allowlist results.');
  recorded.add(marker);
 }
 let attempted=0;
 for(const item of selected){
  const marker=item.kind+':'+item.key;
  if(recorded.has(marker))continue;
  if(attempted>=limit)break;
  const endpoint=item.kind==='work-only'?'/api/catalogue-admin/import/work-only/drafts':'/api/catalogue-admin/import/drafts';
  const body=item.kind==='work-only'?{candidate:item.candidate,confirmed:true}
   :{candidates:[item.candidate],confirmed:true,workFirstDraft:true};
  // Live server checks verified admin role, source identity, ISBNs and duplicate
  // work/author relationships, and owns the transaction boundary.
  let outcome:Outcome;
  try{
   const response=await postJson(origin,endpoint,body,cookie);
   if(response.saved!==true||response.published!==false)
    throw Error('Unexpected response. Inspect remote DB before retrying this record.');
   outcome={key:item.key,kind:item.kind,status:'saved',
    workId:typeof response.id==='string'?response.id:undefined};
  }catch(error){
   outcome={key:item.key,kind:item.kind,status:'held',reason:error instanceof Error?error.message:String(error)};
   // Network timeouts can occur after a committed write. Stop, do not retry
   // blindly; the operator must inspect BOOK_DB and reconcile against a new export.
   ledger.results.push(outcome);
   save(checkpoint,ledger);
   break;
  }
  ledger.results.push(outcome);
  save(checkpoint,ledger);
  attempted++;
 }
 const summary={executed:true,attemptedThisInvocation:attempted,
  saved:ledger.results.filter(r=>r.status==='saved').length,
  held:ledger.results.filter(r=>r.status==='held').length,
  remaining:selected.length-ledger.results.length,checkpoint,
  needsFreshVerification:true,publications:0,
  note:'Verify a fresh remote BOOK_DB export and reconcile counts before further batches.'};
 save(join(out,'report.json'),summary);
 process.stdout.write(JSON.stringify(summary,null,2)+'\n');
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1});
