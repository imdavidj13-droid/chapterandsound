import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/compare-google-books-pilot.mjs',import.meta.url));
const run=(args:string[])=>new Promise<void>((resolve,reject)=>{
 const child=spawn(process.execPath,[script,...args],{stdio:'pipe'});
 let stderr='';
 child.stderr.on('data',c=>stderr+=String(c));
 child.on('error',reject);
 child.on('exit',code=>code===0?resolve():reject(new Error('Exit '+code+': '+stderr)));
});
test('Google Books comparison counts exact ISBN and title/author matches without keeping provider metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cs-google-books-'));
 let calls=0;
 const server=createServer((req,res)=>{
  calls++;
  const q=new URL(req.url||'/', 'http://localhost').searchParams.get('q');
  res.setHeader('content-type','application/json');
  if(q==='isbn:9780306406157')res.end(JSON.stringify({items:[
   {id:'thirdPartyRecordToNeverPersist',volumeInfo:{
    title:'Sample Book',authors:['Fixture Author'],
    industryIdentifiers:[{type:'ISBN_13',identifier:'9780306406157'}],
    publisher:'Sample Publisher',pageCount:300,publishedDate:'2002'},
    saleInfo:{isEbook:true}}
  ]}));
  else res.end(JSON.stringify({totalItems:0}));
 });
 try{
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Invalid server address');
  const input=join(dir,'in.json');
  writeFileSync(input,JSON.stringify({candidates:[{title:'Sample Book',author:'Fixture Author',editions:[
   {format:'unknown',isbn13:'9780306406157',publisher:'',publicationDate:'',pageCount:null},
   {format:'paperback',isbn13:'9781407084350'}
  ]}]}));
  await run(['--input',input,'--out',dir,'--max','2','--delay-ms','0',
   '--api-base','http://127.0.0.1:'+address.port]);
  const reportText=readFileSync(join(dir,'google-books-comparison.json'),'utf8');
  const report=JSON.parse(reportText);
  assert.equal(calls,1);
  assert.equal(report.attempted,1);
  assert.equal(report.exactIdentifierMatches,1);
  assert.equal(report.identityMatches,1);
  assert.equal(report.additionalPublisherEvidence,1);
  assert.equal(report.additionalDateEvidence,1);
  assert.equal(report.additionalPageEvidence,1);
  assert.equal(report.googleEbookAvailableSignals,1);
  assert.equal(report.requestFailures,0);
  assert.ok(!reportText.includes('thirdPartyRecordToNeverPersist'));
  assert.ok(!reportText.includes('Sample Publisher'));
  assert.ok(!reportText.includes('9780306406157'));
 }finally{
  await new Promise<void>(ok=>server.close(()=>ok()));
  rmSync(dir,{force:true,recursive:true});
 }
});
