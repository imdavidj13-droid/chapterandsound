import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const runner=resolve('scripts/rehearse-catalogue-bulk-import.ts');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cas-bulk-test-'));
 const plan=join(root,'plan'),out=join(root,'out'),snapshot=join(root,'snapshot.sql');
 mkdirSync(plan);
 // Reuse the real catalogue migrations; no live D1 binding or network access.
 const migrationsDir=resolve('catalogue-migrations');
 const sql=readdirSync(migrationsDir).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()
  .map(n=>readFileSync(join(migrationsDir,n),'utf8')).join('\n');
 writeFileSync(snapshot,sql);
 const work=(key:string,title:string)=>({
  sourceId:'openlibrary',workSourceKey:key,title,author:'Example Author',
  authorSourceKeys:['/authors/OL100A'],editions:[]
 });
 writeFileSync(join(plan,'work-only-001.json'),JSON.stringify({
  confirmed:false,importEnabled:false,candidates:[
   work('/works/OL100W','First Work'),work('/works/OL101W','Second Work')]
 }));
 return {root,plan,out,snapshot};
}
function run(plan:string,snapshot:string,out:string,flags:string[]){
 const proc=spawnSync(process.execPath,['--import','tsx',runner,'--plan',plan,
  '--snapshot',snapshot,'--out',out,...flags],{encoding:'utf8',timeout:60000});
 return {status:proc.status,stderr:proc.stderr,stdout:proc.stdout};
}
test('rehearsal persists checkpoint and resumes without touching production',()=>{
 const f=fixture();
 try{
  const first=run(f.plan,f.snapshot,f.out,['--limit','1']);
  assert.equal(first.status,0,first.stderr);
  let report=JSON.parse(readFileSync(join(f.out,'report.json'),'utf8'));
  assert.equal(report.totalCandidates,2);
  assert.equal(report.evaluated,1);
  assert.equal(report.remaining,1);
  assert.equal(report.productionWrites,0);
  assert.equal(report.dryRun,true);
  const second=run(f.plan,f.snapshot,f.out,['--resume','--all']);
  assert.equal(second.status,0,second.stderr);
  report=JSON.parse(readFileSync(join(f.out,'report.json'),'utf8'));
  assert.equal(report.evaluated,2);
  assert.equal(report.rehearsed,2);
  assert.equal(report.remaining,0);
  assert.equal(report.kindBreakdown.workOnly,2);
  const ledger=JSON.parse(readFileSync(join(f.out,'checkpoint.json'),'utf8'));
  assert.equal(ledger.results.length,2);
  assert.equal(ledger.productionWrites,0);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('checkpoint mismatch aborts resume and unconfirmed imports are rejected',()=>{
 const f=fixture();
 try{
  assert.equal(run(f.plan,f.snapshot,f.out,['--limit','1']).status,0);
  const file=join(f.plan,'work-only-001.json');
  const data=JSON.parse(readFileSync(file,'utf8'));
  data.confirmed=true;
  writeFileSync(file,JSON.stringify(data));
  const second=run(f.plan,f.snapshot,f.out,['--resume','--all']);
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/Unsafe or unreviewed plan/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
