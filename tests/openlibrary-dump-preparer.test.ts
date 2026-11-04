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
  const work='/works/OL1W',author='/authors/OL1A',edition='/books/OL1M',edition2='/books/OL2M';
  const works=join(dir,'works.txt.gz'),authors=join(dir,'authors.txt.gz'),editions=join(dir,'editions.txt.gz');
  const seeds=join(dir,'seeds.txt'),out=join(dir,'output');
  writeFileSync(works,gzipSync(row('/type/work',work,{key:work,title:'Fixture Book',description:{value:'A full story description.'},subjects:['Mystery'],original_language:{key:'/languages/eng'},first_publish_date:'2002',authors:[{author:{key:author}}]})));
  writeFileSync(authors,gzipSync(row('/type/author',author,{key:author,name:'Fixture Author'})));
  writeFileSync(editions,gzipSync(row('/type/edition',edition,{key:edition,works:[{key:work}],isbn_13:['9780306406157'],physical_format:'Paperback',publishers:['Fixture Publisher'],publish_date:'2002',languages:[{key:'/languages/eng'}]})+row('/type/edition',edition2,{key:edition2,works:[{key:work}],isbn_13:['9781407084350'],physical_format:'Ebook',publishers:['Another Publisher'],publish_date:'2009',languages:[{key:'/languages/eng'}]})));
  writeFileSync(seeds,work+'\n');
  mkdirSync(out);
  execFileSync(process.execPath,[script,'--works',works,'--authors',authors,'--editions',editions,'--seeds',seeds,'--out',out],{timeout:15000});
  const candidate=JSON.parse(readFileSync(join(out,'candidates-01.json'),'utf8')).candidates[0];
  assert.equal(candidate.title,'Fixture Book');
  assert.equal(candidate.author,'Fixture Author');
  assert.equal(candidate.format,'paperback');
  assert.equal(candidate.isbn13,'9780306406157');
  assert.equal(candidate.sourceKey,work);
  assert.equal(candidate.workSourceKey,work);
  assert.deepEqual(candidate.authorSourceKeys,[author]);
  assert.equal(candidate.description,'A full story description.');
  assert.equal(candidate.editions.length,2);
  assert.deepEqual(candidate.editions.map((e:{sourceKey:string})=>e.sourceKey),[edition,edition2]);
  assert.equal(candidate.editions[1].isbn13,'9781407084350');
  const report=JSON.parse(readFileSync(join(out,'report.json'),'utf8'));
  assert.equal(report.candidates,1);
  assert.equal(report.reviewItems,0);
  assert.equal(report.editionsMatched,2);
  const auto=join(dir,'automatic-pilot');
  mkdirSync(auto);
  execFileSync(process.execPath,[script,'--works',works,'--authors',authors,'--editions',editions,
   '--author-name','Fixture Author','--max','10','--out',auto],{timeout:15000});
  const automatic=JSON.parse(readFileSync(join(auto,'candidates-01.json'),'utf8'));
  assert.equal(automatic.candidates.length,1);
  assert.equal(automatic.candidates[0].author,'Fixture Author');
  assert.equal(JSON.parse(readFileSync(join(auto,'report.json'),'utf8')).selection.authorName,'Fixture Author');
  const byId=join(dir,'author-id-pilot'),titles=join(dir,'titles.txt');
  writeFileSync(titles,'# Author title pilot\n\nFixture Book\n');
  mkdirSync(byId);
  execFileSync(process.execPath,[script,'--works',works,'--authors',authors,'--editions',editions,
   '--author-key',author,'--titles-file',titles,'--max','10','--out',byId],{timeout:15000});
  const byIdResult=JSON.parse(readFileSync(join(byId,'candidates-01.json'),'utf8'));
  assert.equal(byIdResult.candidates.length,1);
  assert.equal(byIdResult.candidates[0].workSourceKey,work);
  const idReport=JSON.parse(readFileSync(join(byId,'report.json'),'utf8'));
  assert.equal(idReport.selection.authorKey,author);
  assert.deepEqual(idReport.selection.titles,['fixture book']);
  // Two distinct source works with the same title must not be picked arbitrarily.
  const ambiguousWorks=join(dir,'ambiguous-works.txt.gz');
  writeFileSync(ambiguousWorks,gzipSync(
   row('/type/work',work,{key:work,title:'Fixture Book',authors:[{author:{key:author}}]})+
   row('/type/work','/works/OL999W',{key:'/works/OL999W',title:'Fixture Book',authors:[{author:{key:author}}]})
  ));
  const failedOut=join(dir,'ambiguous-output');
  mkdirSync(failedOut);
  execFileSync(process.execPath,[script,
   '--works',ambiguousWorks,'--authors',authors,'--editions',editions,
   '--author-key',author,'--titles-file',titles,'--max','10','--out',failedOut
  ],{timeout:15000,stdio:'pipe'});
  const review=JSON.parse(readFileSync(join(failedOut,'report.json'),'utf8'));
  assert.equal(review.candidates,0,'ambiguous title must not be imported');
  assert.equal(review.needsIdentityReview,1);
  assert.deepEqual(review.unresolvedTitles[0].options.map((x:{key:string})=>x.key),
   [work,'/works/OL999W'].sort());
  assert.equal(review.unresolvedTitles[0].options.find((x:{key:string})=>x.key===work).editionCount,2);
  assert.ok(!review.files.length,'no import-ready manifest should be produced for only ambiguous titles');

 }finally{rmSync(dir,{recursive:true,force:true})}
});
