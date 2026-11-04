import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assessImportQuality} from '../src/worker/catalogue-import-quality';

test('work-only lookup is never marked metadata-complete',()=>{
 const result=assessImportQuality({title:'Relentless',author:'Simon Kernick',sourceKey:'/works/OL1W'});
 assert.equal(result.ready,false);
 assert.equal(result.editionCount,0);
 assert.ok(result.missing.includes('work.editions (edition-level records required)'));
 assert.ok(result.missing.includes('work.authorIdentifiers'));
 assert.ok(result.missing.includes('work.description'));
 assert.ok(result.warnings.some(x=>x.includes('work-level only')));
});
test('complete work and each verified edition meet quality gate',()=>{
 const work={title:'Example',author:'Writer',workSourceKey:'/works/OL1W',
  authorSourceKeys:['/authors/OL1A'],description:'An example synopsis',
  subjects:['Mystery'],originalLanguage:'eng',firstPublicationDate:'2002',
  editions:[
   {sourceKey:'/books/OL1M',format:'paperback',isbn13:'9780306406157',
    publisher:'Sample Press',publicationDate:'2002',language:'eng'},
   {sourceKey:'/books/OL2M',format:'ebook',isbn13:'9781407084350',
    publisher:'Sample Press',publicationDate:'2010',language:'eng'}
  ]};
 const result=assessImportQuality(work);
 assert.equal(result.ready,true);
 assert.equal(result.editionCount,2);
 assert.equal(result.verifiedEditionCount,2);
 assert.deepEqual(result.formatCoverage,['ebook','paperback']);
 assert.deepEqual(result.missing,[]);
});
test('audio editions are held when narrator/duration cannot be verified',()=>{
 const result=assessImportQuality({title:'Example',author:'Writer',sourceKey:'/works/OL1W',
  authorSourceKeys:['/authors/OL1A'],description:'Synopsis',subjects:['Mystery'],
  originalLanguage:'eng',firstPublicationDate:'2010',
  editions:[{sourceKey:'/books/OL1M',format:'audiobook',isbn13:'9780306406157',
   publisher:'Publisher',publicationDate:'2010',language:'eng'}]});
 assert.equal(result.ready,false);
 assert.ok(result.missing.includes('edition[1].duration'));
 assert.ok(result.missing.includes('edition[1].narratorIdentifiers'));
});
