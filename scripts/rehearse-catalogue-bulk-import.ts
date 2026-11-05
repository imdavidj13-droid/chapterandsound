/**
 * Offline, resumable rehearsal of planned catalogue imports.
 *
 * Executes the SAME draft-import functions used by the Worker against a
 * disposable SQLite copy of the BOOK_DB SQL export. No network calls, no
 * Wrangler invocations, and NO writes to BOOK_DB.
 *
 * Usage:
 * npx tsx scripts/rehearse-catalogue-bulk-import.ts \
 *   --plan .private-catalogue-5000/import-plan \
 *   --snapshot .private-catalogue-5000/snapshots/book-db-before-import-....sql \
 *   --limit 30
 *
 * Use --all to process every planned candidate. A checkpoint is written after
 * each candidate. --resume validates the plan and snapshot hashes before reuse.
 */
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {importCatalogueDrafts} from '../src/worker/catalogue-import-drafts.js';
import {importWorkOnlyDraft} from '../src/worker/catalogue-import-work-only.js';

type Scalar=string|number|null;
type Entry={file:string;kind:'edition'|'work-only';candidate:Record<string,unknown>};
type Result={key:string;kind:Entry['kind'];file:string;status:'rehearsed'|'held';reason?:string};
type Ledger={version:1;planHash:string;snapshotHash:string;results:Result[];dryRun:true;productionWrites:0};

function arg(name:string){const pos=process.argv.indexOf(name);return pos<0?undefined:process.argv[pos+1]}
function hash(buffer:Buffer|string){return createHash('sha256').update(buffer).digest('hex')}
function atomicWrite(path:string,data:unknown){
 const tmp=path+'.tmp';
 writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');
 renameSync(tmp,path);
}
function driver(db:DatabaseSync){
 function statement(sql:string){
  let params:Scalar[]=[];
  const entry={
   bind(...args:Scalar[]){params=args;return entry},
   async first<T>():Promise<T|null>{return (db.prepare(sql).get(...params) as T|undefined)??null},
   async all<T>():Promise<{results:T[]}>{return {results:db.prepare(sql).all(...params) as T[]}},
   async run(){const row=db.prepare(sql).run(...params);return {meta:{changes:Number(row.changes)}}}
  };
  return entry;
 }
 return {
  prepare:statement,
  async batch(items:ReturnType<typeof statement>[]){
   db.exec('BEGIN IMMEDIATE');
   try{const result=[];for(const item of items)result.push(await item.run());db.exec('COMMIT');return result}
   catch(error){db.exec('ROLLBACK');throw error}
  }
 };
}
function loadPlan(dir:string){
 const files=readdirSync(dir).filter(n=>/^batch-\d+\.json$|^work-only-\d+\.json$/.test(n)).sort();
 if(!files.length)throw Error('No edition or work-only plan files found. Run the read-only planner first.');
 const entries:Entry[]=[];
 const signatures:string[]=[];
 for(const file of files){
  const raw=readFileSync(join(dir,file));
  signatures.push(file+':'+hash(raw));
  const data=JSON.parse(raw.toString('utf8')) as {confirmed?:boolean;importEnabled?:boolean;candidates?:unknown[]};
  if(data.confirmed!==false)throw Error('Unsafe or unreviewed plan (confirmed must be false): '+file);
  if(data.importEnabled===true)throw Error('Unexpected enabled import manifest: '+file);
  const kind:Entry['kind']=file.startsWith('work-only-')?'work-only':'edition';
  if(!Array.isArray(data.candidates))throw Error('Invalid candidate list: '+file);
  for(const value of data.candidates){
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Non-object candidate in '+file);
   entries.push({file,kind,candidate:value as Record<string,unknown>});
  }
 }
 return {entries,planHash:hash(signatures.join('\n'))};
}
async function main(){
 const dir=resolve(arg('--plan')||'.private-catalogue-5000/import-plan');
 const snapshot=arg('--snapshot');
 if(!snapshot)throw Error('Provide --snapshot with the saved BOOK_DB SQL export. No remote export is performed.');
 const snapshotPath=resolve(snapshot);
 const output=resolve(arg('--out')||join(dir,'rehearsal'));
 const limit=process.argv.includes('--all')?Number.MAX_SAFE_INTEGER:Number(arg('--limit')||30);
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('--limit must be a positive integer');
 const {entries,planHash}=loadPlan(dir);
 const snapshotSql=readFileSync(snapshotPath);
 const snapshotHash=hash(snapshotSql);
 mkdirSync(output,{recursive:true});
 const checkpoint=join(output,'checkpoint.json');
 let ledger:Ledger={version:1,planHash,snapshotHash,results:[],dryRun:true,productionWrites:0};
 if(process.argv.includes('--resume')){
  if(!existsSync(checkpoint))throw Error('Cannot resume without existing checkpoint.');
  const previous=JSON.parse(readFileSync(checkpoint,'utf8')) as Ledger;
  if(previous.version!==1||previous.planHash!==planHash||previous.snapshotHash!==snapshotHash
   ||previous.dryRun!==true||previous.productionWrites!==0)
   throw Error('Checkpoint does not match the current plan/snapshot; refusing unsafe resume.');
  ledger=previous;
 }else if(existsSync(checkpoint)){
  throw Error('Existing checkpoint found. Use --resume or a different --out directory.');
 }
 // Temporary copy exists ONLY in this process; actual BOOK_DB is never touched.
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(snapshotSql.toString('utf8'));
  const client=driver(db);
  const completed=new Map(ledger.results.map(r=>[r.kind+':'+r.key,r]));
  let processed=0;
  for(const entry of entries){
   const key=String(entry.candidate.workSourceKey||entry.candidate.sourceKey||'');
   if(!key||!/^\/works\/OL\d+W$/.test(key))throw Error('Invalid work key in '+entry.file);
   const marker=entry.kind+':'+key;
   if(completed.has(marker)){
    // A resumed rehearsal must rebuild prior *successful* changes in its
    // disposable SQLite database so subsequent dedup checks are meaningful.
    const prior=completed.get(marker)!;
    if(prior.status==='rehearsed'){
     try{await runCandidate(client,entry)}
     catch(e){throw Error('Checkpoint could not replay '+key+': '+String(e))}
    }
    continue;
   }
   if(processed>=limit)break;
   let result:Result={key,kind:entry.kind,file:entry.file,status:'rehearsed'};
   try{await runCandidate(client,entry)}
   catch(error){result={...result,status:'held',reason:error instanceof Error?error.message:String(error)}}
   ledger.results.push(result);
   completed.set(marker,result);
   atomicWrite(checkpoint,ledger);
   processed++;
  }
  const counters={rehearsed:ledger.results.filter(x=>x.status==='rehearsed').length,
   held:ledger.results.filter(x=>x.status==='held').length};
  const remaining=entries.length-ledger.results.length;
  const report={dryRun:true,productionWrites:0,totalCandidates:entries.length,
   evaluated:ledger.results.length,remaining,...counters,
   completed:remaining===0,checkpoint,kindBreakdown:{
    editions:ledger.results.filter(x=>x.kind==='edition'&&x.status==='rehearsed').length,
    workOnly:ledger.results.filter(x=>x.kind==='work-only'&&x.status==='rehearsed').length},
   heldExamples:ledger.results.filter(x=>x.status==='held').slice(0,20)};
  atomicWrite(join(output,'report.json'),report);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }finally{db.close()}
}
async function runCandidate(db:ReturnType<typeof driver>,entry:Entry){
 if(entry.kind==='work-only'){
  const saved=await importWorkOnlyDraft(db,entry.candidate,'offline-rehearsal');
  if(saved.published||saved.editionCount!==0)throw Error('Work-only rehearsal violated private draft boundary.');
 }else{
  const saved=await importCatalogueDrafts(db,[entry.candidate],'offline-rehearsal',{workFirstDraft:true});
  if(saved.published||saved.status!=='draft')throw Error('Edition rehearsal violated private draft boundary.');
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1});
