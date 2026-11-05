import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {groupCoverCandidates,groupSearchResults,type SearchEdition} from '../src/site/catalogue-search-grouping';
const entry=(key:string,title:string,author:string,isbn13:string|null):SearchEdition=>({
 key,title,author,isbn13,publisher:null,publishedDate:null,pages:null,coverUrl:null,language:null,source:'ISBNdb'
});
test('groups matching titles and authors for display while preserving distinct editions',()=>{
 const result=groupSearchResults([
  entry('g:1','Relentless','Simon Kernick','9780552156905'),
  entry('g:2','RELENTLESS','Simon Kernick','9780552153126'),
  entry('o:OL21028427W','Relentless','Simon Kernick',null)
 ]);
 assert.equal(result.length,1);
 assert.equal(result[0]?.items.length,3);
 assert.deepEqual(result[0]?.items.map(e=>e.isbn13),['9780552156905','9780552153126',null]);
 assert.equal(result[0]?.ambiguous,true);
});
test('same title by different authors never shares a display group',()=>{
 const groups=groupSearchResults([
  entry('i:1','The Witness','Simon Kernick','9780552156905'),
  entry('i:2','The Witness','Different Author','9780552153126')
 ]);
 assert.equal(groups.length,2);
});
test('duplicate ISBN source hits do not create another edition row',()=>{
 const groups=groupSearchResults([
  entry('g:1','Relentless','Simon Kernick','9780552156905'),
  entry('i:1','Relentless','Simon Kernick','9780552156905')
 ]);
 assert.equal(groups.length,1);
 assert.equal(groups[0]?.items.length,1);
});
test('missing identity fields are never combined by title-only heuristics',()=>{
 const groups=groupSearchResults([
  entry('i:1','Relentless','',null),
  entry('i:2','Relentless','',null)
 ]);
 assert.equal(groups.length,2);
});
test('import review selection does not automatically persist a book',()=>{
 const ui=readFileSync(new URL('../src/site/CatalogueImportCentre.tsx',import.meta.url),'utf8');
 const start=ui.indexOf('async function selectAndImport(');
 const end=ui.indexOf('const synopsisReady=',start);
 assert.ok(start>0&&end>start);
 const handler=ui.slice(start,end);
 assert.match(handler,/setSelected\(detail\)/);
 assert.doesNotMatch(handler,/await save\(detail\)/);
 assert.match(ui,/groupSearchResults\(items\)/);
});

test('preview covers prefer work art and then ISBN and Google thumbnails',()=>{
 const google={...entry('g:1','Relentless','Simon Kernick','9780552156905'),source:'Google Books',
  coverUrl:'https://covers.openlibrary.org/b/isbn/9780552156905-L.jpg?default=false',
  previewCoverUrl:'https://books.google.com/books/content?id=example'};
 const ol={...entry('o:1','Relentless','Simon Kernick',null),source:'Open Library',
  coverUrl:'https://covers.openlibrary.org/b/id/123-M.jpg'};
 const group=groupSearchResults([google,ol])[0]!;
 assert.deepEqual(groupCoverCandidates(group).map(x=>x.label),[
  'Open Library work artwork','Open Library ISBN cover candidate','Google Books volume thumbnail'
 ]);
});
test('groups without working source URLs have no fabricated cover',()=>{
 const group=groupSearchResults([entry('i:1','Relentless','Simon Kernick','9780552156905')])[0]!;
 assert.deepEqual(groupCoverCandidates(group),[]);
});

test('surname-first and marketing-subtitle variants do not become separate books',()=>{
 const rows=[
  entry('g:1','Relentless','Simon Kernick','9780552153126'),
  entry('i:1','Relentless: A Thriller','Kernick, Simon','9780552156905'),
  entry('i:2','Relentless: A Thriller','Kernick, Simon','9780552153126')
 ];
 const groups=groupSearchResults(rows);
 assert.equal(groups.length,1);
 assert.equal(groups[0]?.title,'Relentless');
 assert.equal(groups[0]?.author,'Simon Kernick');
 assert.deepEqual(groups[0]?.items.map(item=>item.isbn13),['9780552153126','9780552156905']);
});
test('reversed author format alone does not create an edition',()=>{
 const groups=groupSearchResults([
  entry('g:1','The Witness','Simon Kernick','9781448136728'),
  entry('i:1','The Witness','Kernick, Simon','9781448136728')
 ]);
 assert.equal(groups.length,1);
 assert.equal(groups[0]?.items.length,1);
});
test('untitled placeholders cannot group with each other',()=>{
 const groups=groupSearchResults([
  entry('i:1','Untitled Kernick','Simon Kernick','9780552153126'),
  entry('i:2','Untitled Kernick','Kernick, Simon','9780552156905')
 ]);
 assert.equal(groups.length,2);
});
test('material subtitles remain distinct without identity evidence',()=>{
 const groups=groupSearchResults([
  entry('g:1','The Witness','Simon Kernick','9780552153126'),
  entry('i:1','The Witness: Aftermath','Kernick, Simon','9780552156905')
 ]);
 assert.equal(groups.length,2);
});
