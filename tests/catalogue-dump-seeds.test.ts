import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {selectWorkSeeds} from '../scripts/select-openlibrary-work-seeds.mjs';

test('offline seed selection reads a gzipped Open Library works TSV, excludes invalid works, and writes no database data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cas-ol-seeds-'));
 try{
  const works=join(dir,'works.txt.gz'),out=join(dir,'works-3.txt');
  const row=(key:string,data:unknown)=>'/type/work\t'+key+'\t1\t2026-10-31T00:00:00\t'+JSON.stringify(data);
  const data=[
   row('/works/OL1W',{title:'Relentless',authors:[{author:{key:'/authors/OL1A'}}]}),
   row('/works/OL2W',{title:'Untitled project',authors:[{author:{key:'/authors/OL1A'}}]}),
   row('/works/OL3W',{title:'Siege',authors:[{author:{key:'/authors/OL1A'}}]}),
   row('/works/OL4W',{title:'No author'}),
   row('/works/OL5W',{title:'The Crime Trade',authors:[{author:{key:'/authors/OL1A'}}]})
  ].join('\n')+'\n';
  writeFileSync(works,gzipSync(data));
  const result=await selectWorkSeeds({works,out,count:3});
  assert.equal(result.selected,3);
  assert.deepEqual(readFileSync(out,'utf8').trim().split('\n'),['/works/OL1W','/works/OL3W','/works/OL5W']);
  const report=JSON.parse(readFileSync(out+'.report.json','utf8'));
  assert.equal(report.readOnly,true);
  assert.equal(report.eligible,3);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('work-seed preparation refuses to write an incomplete requested batch',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cas-ol-short-'));
 try{
  const works=join(dir,'works.txt.gz'),out=join(dir,'seeds.txt');
  writeFileSync(works,gzipSync('/type/work\t/works/OL1W\t1\t2026-10-31\t'+JSON.stringify({title:'Only',authors:[{key:'/authors/OL1A'}]})+'\n'));
  await assert.rejects(selectWorkSeeds({works,out,count:3}),/Only 1 eligible works found/);
  assert.throws(()=>readFileSync(out,'utf8'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
