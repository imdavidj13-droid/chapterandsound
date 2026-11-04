import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/enrich-openlibrary-pilot.mjs',import.meta.url));
test('edition enrichment uses explicit format, retains unknown, flags ISBN conflicts and never writes to DB',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cs-enrichment-'));
 try{
  const input=join(dir,'input.json');
  writeFileSync(input,JSON.stringify({candidates:[{
   title:'Sample Book',author:'Fixture Author',
   workSourceKey:'/works/OL1W',sourceWorkKeys:['/works/OL1W'],
   identityStatus:'provisional_review_required',
   editions:[
    {sourceKey:'/books/OL1M',format:'unknown',physicalFormat:'E-book',isbn13:'9780306406157',
     isbn13Candidates:['9780306406157'],publisher:'Publisher'},
    {sourceKey:'/books/OL2M',format:'paperback',physicalFormat:'',isbn13:null,
     isbn13Candidates:[],isbn10Candidates:[]},
    {sourceKey:'/books/OL3M',format:'unknown',physicalFormat:'Paperback',
     isbn13Candidates:['9780306406157','9781407084350'],isbn10Candidates:[]}
   ],
   duplicateEditionGroups:[{retained:'/books/OL1M',other:'/books/OL4M',conflicts:['format']}]
  }]}));
  execFileSync(process.execPath,[script,'--input',input,'--out',dir],{timeout:15000});
  const enriched=JSON.parse(readFileSync(join(dir,'enriched-candidates-01.json'),'utf8')).candidates[0];
  const report=JSON.parse(readFileSync(join(dir,'enrichment-report.json'),'utf8'));
  assert.equal(enriched.editions[0].format,'ebook');
  assert.equal(enriched.editions[0].fieldProvenance.format.status,'source_explicit');
  assert.equal(enriched.editions[1].format,'unknown','must not assume format from ISBN or stale manifest');
  assert.equal(enriched.editions[2].isbn13,null,'multi-ISBN source record must not choose one');
  assert.equal(enriched.importEligible,false);
  assert.equal(report.totals.formats.ebook,1);
  assert.equal(report.totals.formats.unknown,1);
  assert.equal(report.databaseWrites,0);
  assert.ok(report.books[0].issues.some((x:{code:string})=>x.code==='multiple_isbns_on_one_source_edition'));
  assert.ok(report.books[0].issues.some((x:{code:string})=>x.code==='same_isbn_conflicting_metadata'));
  const cache=join(dir,'isbn-lookup-cache');
  mkdirSync(cache,{recursive:true});
  writeFileSync(join(cache,'9780306406157.json'),JSON.stringify({
   key:'/books/OL1M',title:'Sample Book',works:[{key:'/works/OL1W'}],
   isbn_13:['9780306406157'],physical_format:'E-book'
  }));
  // Change the fixture to an unclassified edition: the cached ISBN lookup
  // must be consulted and permitted to recover the explicit E-book format.
  const secondPass=JSON.parse(readFileSync(input,'utf8'));
  secondPass.candidates[0].editions[0].physicalFormat='';
  writeFileSync(input,JSON.stringify(secondPass));
  // Standalone CLI flag must be recognized even when it has no following value.
  execFileSync(process.execPath,[script,'--input',input,'--out',dir,'--isbn-lookups'],{timeout:15000});
  const lookupReport=JSON.parse(readFileSync(join(dir,'enrichment-report.json'),'utf8'));
  assert.equal(lookupReport.totals.isbnLookupsCached,1);
  const lookupCandidates=JSON.parse(readFileSync(join(dir,'enriched-candidates-01.json'),'utf8')).candidates;
  assert.equal(lookupCandidates[0].editions[0].format,'ebook');
  assert.equal(lookupCandidates[0].editions[0].fieldProvenance.format.source,'openlibrary_isbn_lookup');
  assert.ok(lookupReport.source.includes('exact ISBN lookups'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
