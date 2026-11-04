import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/fetch-openlibrary-pilot.mjs',import.meta.url));
const run=(args:string[])=>new Promise<void>((ok,fail)=>{
 const p=spawn(process.execPath,[script,...args],{stdio:'pipe'});
 let stderr='';
 p.stderr.on('data',v=>stderr+=String(v));
 p.on('error',fail);
 p.on('exit',code=>code===0?ok():fail(Error('exit '+code+': '+stderr)));
});
test('targeted Open Library fetcher caches and consolidates aliased editions without D1',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cs-ol-api-'));
 const counts=new Map<string,number>();
 const data:Record<string,unknown>={
  '/authors/OL1A.json':{key:'/authors/OL1A',name:'Fixture Author'},
  '/works/OL1W.json':{key:'/works/OL1W',title:'Fixture Book',authors:[{author:{key:'/authors/OL1A'}}],description:'Description'},
  '/works/OL2W.json':{key:'/works/OL2W',title:'Fixture Book',authors:[{author:{key:'/authors/OL1A'}}]},
  '/works/OL1W/editions.json?limit=100&offset=0':{size:2,entries:[
   {key:'/books/OL1M',isbn_13:['9780306406157'],physical_format:'Paperback',publishers:['Publisher'],publish_date:'2001'},
   {key:'/books/OL2M',isbn_13:['9781407084350'],physical_format:'Ebook'}]},
  '/works/OL2W/editions.json?limit=100&offset=0':{size:1,entries:[
   {key:'/books/OL3M',isbn_13:['9780306406157'],physical_format:'Hardback',publishers:['Publisher']}]}
 };
 const server=createServer((req,res)=>{
  const path=req.url||'';
  counts.set(path,(counts.get(path)||0)+1);
  if(!(path in data)){res.writeHead(404);res.end('{}');return}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data[path]));
 });
 try{
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const addr=server.address();
  if(!addr||typeof addr==='string')throw Error('address');
  const base='http://127.0.0.1:'+addr.port;
  const resolution=join(dir,'resolution.json');
  const output=join(dir,'output');
  writeFileSync(resolution,JSON.stringify({authorKey:'/authors/OL1A',books:[{
   title:'Fixture Book',canonicalWorkKey:'/works/OL1W',aliasWorkKeys:['/works/OL2W']
  }]}));
  const args=['--resolution-file',resolution,'--out',output,'--api-base',base,'--delay-ms','0'];
  await run(args);
  const report=JSON.parse(readFileSync(join(output,'api-report.json'),'utf8'));
  assert.equal(report.totals.books,1);
  assert.equal(report.totals.sourceWorkIds,2);
  assert.equal(report.totals.editionRelationships,3);
  assert.equal(report.totals.uniqueEditionRecords,2);
  assert.equal(report.totals.fetched,5);
  assert.equal(report.books[0].conflicts,1);
  const candidate=JSON.parse(readFileSync(join(output,'api-candidates-01.json'),'utf8')).candidates[0];
  assert.equal(candidate.editions.length,2);
  assert.equal(candidate.identityStatus,'provisional_review_required');
  assert.deepEqual(candidate.sourceWorkKeys,['/works/OL1W','/works/OL2W']);
  assert.deepEqual(candidate.editions.find((e:{isbn13:string})=>e.isbn13==='9780306406157').aliasEditionSourceKeys,['/books/OL3M']);
  const requests=[...counts.values()].reduce((a,b)=>a+b,0);
  await run(args);
  assert.equal([...counts.values()].reduce((a,b)=>a+b,0),requests,'second run should be fully cached');
  assert.equal(JSON.parse(readFileSync(join(output,'api-report.json'),'utf8')).totals.reused,5);
 }finally{
  await new Promise<void>(r=>server.close(()=>r()));
  rmSync(dir,{recursive:true,force:true});
 }
});
