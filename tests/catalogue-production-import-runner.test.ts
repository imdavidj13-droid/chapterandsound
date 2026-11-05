import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const sha=(raw:string)=>createHash('sha256').update(raw).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cas-prod-runner-'));
 const plan=join(root,'plan'),preflight=join(root,'preflight');
 mkdirSync(plan);mkdirSync(preflight);
 const file='work-only-001.json';
 const work={sourceId:'openlibrary',workSourceKey:'/works/OL123W',
  title:'Sample',author:'Author',authorSourceKeys:['/authors/OL1A'],editions:[]};
 const raw=JSON.stringify({confirmed:false,importEnabled:false,candidates:[work]});
 writeFileSync(join(plan,file),raw);
 const planHash=sha(file+':'+sha(raw));
 const eligible=JSON.stringify({dryRun:true,importEnabled:false,candidates:[
  {kind:'work-only',workSourceKey:'/works/OL123W',file}
 ]});
 writeFileSync(join(preflight,'eligible.json'),eligible);
 const report={dryRun:true,importEnabled:false,productionWrites:0,
  planSha256:planHash,eligibleManifestSha256:sha(eligible),
  eligibleAgainstFreshSnapshot:1};
 writeFileSync(join(preflight,'report.json'),JSON.stringify(report));
 return {root,plan,preflight};
}
function run(plan:string,preflight:string,flags:string[]=[]){
 return spawnSync(process.execPath,['--import','tsx',resolve('scripts/execute-catalogue-production-import.ts'),
  '--plan',plan,'--preflight',preflight,...flags],{encoding:'utf8',timeout:60000,
  env:{...process.env,CATALOGUE_ADMIN_COOKIE:''}});
}
test('production runner defaults to read-only and writes nothing',()=>{
 const f=fixture();
 try{
  const result=run(f.plan,f.preflight);
  assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);
  assert.equal(output.dryRun,true);
  assert.equal(output.productionWrites,0);
  assert.equal(output.eligible,1);
  assert.equal(output.productionExecutionAvailable,false);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('modified allowlist fails SHA check before any write requests',()=>{
 const f=fixture();
 try{
  const file=join(f.preflight,'eligible.json');
  writeFileSync(file,readFileSync(file,'utf8')+' ');
  const result=run(f.plan,f.preflight);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/allowlist digest mismatch/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
test('explicit execute requires confirmation and canonical owner origin',()=>{
 const f=fixture();
 try{
  const missing=run(f.plan,f.preflight,['--execute']);
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/Explicit --confirm/);
  const wrongOrigin=run(f.plan,f.preflight,['--execute','--confirm','IMPORT_PRIVATE_DRAFTS',
   '--origin','https://example.com']);
  assert.notEqual(wrongOrigin.status,0);
  assert.match(wrongOrigin.stderr,/exact HTTPS production origin/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
