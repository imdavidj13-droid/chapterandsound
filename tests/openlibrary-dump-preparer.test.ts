import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/prepare-openlibrary-pilot.mjs',import.meta.url));
const row=(kind:string,key:string,value:Record<string,unknown>)=>[kind,key,'1','2026-01-01T00:00:00',JSON.stringify(value)].join('\t')+'\n';
test('offline Open Library dump preparer creates reviewed manifests without network or D1 writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cs-ol-pilot-'));
 try{
  const work='/works/OL1W',author='/authors/OL1A',edition='/books/OL1M';
  const works=join(dir,'works.txt.gz'),authors=join(dir,'authors.txt.gz'),editions=join(dir,'editions.txt.gz');
  const seeds=join(dir,'seeds.txt'),out=join(dir,'output');
  writeFileSync(works,gzipSync(row('/type/work',work,{key:work,title:'Fixture Book',authors:[{author:{key:author}}]})));
  writeFileSync(authors,gzipSync(row('/type/author',author,{key:author,name:'Fixture Author'})));
  writeFileSync(editions,gzipSync(row('/type/edition',edition,{key:edition,works:[{key:work}],isbn_13:['9780306406157'],physical_format:'Paperback',publishers:['Fixture Publisher']})));
  writeFileSync(seeds,work+'\n');
  mkdirSync(out);
  execFileSync(process.execPath,[script,'--works',works,'--authors',authors,'--editions',editions,'--seeds',seeds,'--out',out],{timeout:15000});
  const candidate=JSON.parse(readFileSync(join(out,'candidates-01.json'),'utf8')).candidates[0];
  assert.equal(candidate.title,'Fixture Book');
  assert.equal(candidate.author,'Fixture Author');
  assert.equal(candidate.format,'paperback');
  assert.equal(candidate.isbn13,'9780306406157');
  assert.equal(candidate.sourceKey,edition);
  const report=JSON.parse(readFileSync(join(out,'report.json'),'utf8'));
  assert.equal(report.candidates,1);
  assert.equal(report.reviewItems,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
