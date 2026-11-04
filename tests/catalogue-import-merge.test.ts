import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mergeCatalogueMetadata} from '../src/worker/catalogue-import-merge';
const original=()=>({
 sourceId:'openlibrary',workSourceKey:'/works/OL1W',sourceKey:'/works/OL1W',
 title:'Mystery Novel',author:'Verified Writer',authorSourceKeys:['/authors/OL1A'],
 editions:[{sourceKey:'/books/OL1M',isbn13:'9780306406157',format:'paperback'}]
});
test('independently verified ISBN fills missing fields but preserves original work identity',()=>{
 const primary=original();
 const supplementary={sourceId:'licensed-feed',title:'Mystery Novel',author:'Verified Writer',
  description:'A verified description',subjects:['Mystery'],
  editions:[{sourceKey:'external-abc',isbn13:'9780306406157',format:'paperback',
   publisher:'Verified Press',publicationDate:'2015',language:'eng'}]};
 const result=mergeCatalogueMetadata(primary,[supplementary]);
 assert.equal(result.candidate.description,'A verified description');
 assert.equal(result.candidate.editions?.[0]?.publisher,'Verified Press');
 assert.equal(result.candidate.editions?.[0]?.language,'eng');
 assert.equal(result.candidate.workSourceKey,'/works/OL1W');
 assert.equal(result.candidate.editions?.length,1);
 assert.equal(result.rejectedSources.length,0);
 assert.equal(primary.editions[0].publisher,undefined,'input must remain unchanged');
 assert.equal(primary.description,undefined);
});
test('conflicting metadata is disclosed rather than overwritten',()=>{
 const primary={...original(),description:'Original synopsis',editions:[{
  sourceKey:'/books/OL1M',isbn13:'9780306406157',format:'paperback',publisher:'Primary Publisher'}]};
 const result=mergeCatalogueMetadata(primary,[{sourceId:'other-feed',title:primary.title,author:primary.author,
  description:'Different synopsis',editions:[{sourceKey:'other-1',isbn13:'9780306406157',format:'ebook',publisher:'Another Publisher'}]}]);
 assert.equal(result.candidate.description,'Original synopsis');
 assert.equal(result.candidate.editions?.[0]?.format,'paperback');
 assert.equal(result.candidate.editions?.[0]?.publisher,'Primary Publisher');
 assert.ok(result.conflicts.some(x=>x.field==='work.description'));
 assert.ok(result.conflicts.some(x=>x.field.includes('.format')));
 assert.ok(result.conflicts.some(x=>x.field.includes('.publisher')));
});
test('different title/author or unverified identity never merges, even when names are similar',()=>{
 const primary=original();
 const results=[
  {sourceId:'other-feed',title:'Mystery Novel',author:'Different Writer',description:'Wrong book',
   editions:[{sourceKey:'a',isbn13:'9780306406157'}]},
  {sourceId:'other-feed',title:'Mystery Novel',author:'Verified Writer',description:'No identity proof',
   editions:[{sourceKey:'b',isbn13:'9781407084350'}]}
 ];
 const result=mergeCatalogueMetadata(primary,results);
 assert.equal(result.rejectedSources.length,2);
 assert.equal(result.candidate.description,undefined);
});
test('provider-specific author identifiers and new editions are not silently transplanted',()=>{
 const result=mergeCatalogueMetadata(original(),[{sourceId:'external',title:'Mystery Novel',author:'Verified Writer',
  authorSourceKeys:['another-provider-author'],editions:[
   {sourceKey:'x',isbn13:'9780306406157',language:'eng'},
   {sourceKey:'new-edition',isbn13:'9781407084350',format:'ebook'}
  ]}]);
 assert.deepEqual(result.candidate.authorSourceKeys,['/authors/OL1A']);
 assert.equal(result.candidate.editions?.length,1);
});
