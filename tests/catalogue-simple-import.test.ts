import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {getSimpleBook,importSimpleBook,findSimpleBooks} from '../src/worker/catalogue-simple-import';

const code='9780552156905';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())
  sqlite.exec(readFileSync(new URL(name,dir),'utf8'));
 const conn={
  prepare(sql:string){
   let args:(string|number|null)[]=[];
   const stmt={
    bind(...values:(string|number|null)[]){args=values;return stmt},
    async first<T>(){return (sqlite.prepare(sql).get(...args) as T|undefined)??null},
    async all<T>(){return {results:sqlite.prepare(sql).all(...args) as T[]}},
    async run(){return sqlite.prepare(sql).run(...args)}
   };
   return stmt;
  },
  async batch(steps:{run():Promise<unknown>}[]){
   sqlite.exec('BEGIN');
   try{const rows=[];for(const step of steps)rows.push(await step.run());sqlite.exec('COMMIT');return rows}
   catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 };
 return {sqlite,conn,close:()=>sqlite.close()};
}
function mockSources(withOpenDescription=true,knownFormat=true){
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const url=String(input);
  let data:unknown=null;
  if(url.includes('/b/isbn/'+code+'-L.jpg?default=false'))
   return new Response(new Uint8Array([255,216,255,217]),{status:200,headers:{'Content-Type':'image/jpeg'}});
  if(url.includes('googleapis.com/books/v1/volumes/abc123'))
   data={id:'abc123',volumeInfo:{title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi Books',
    publishedDate:'2007-01-01',pageCount:480,language:'en',industryIdentifiers:[{type:'ISBN_13',identifier:code}],description:'Publisher text that must not be saved'}};
  else if(url.includes('googleapis.com/books/v1/volumes?'))
   data={items:[{id:'abc123',volumeInfo:{title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi Books',publishedDate:'2007',pageCount:480,language:'en',
    industryIdentifiers:[{type:'ISBN_13',identifier:code}]}}]};
  else if(url.includes('/isbn/'+code+'.json'))
   data={key:'/books/OL1M',isbn_13:[code],physical_format:knownFormat?'Paperback':undefined,languages:[{key:'/languages/eng'}],works:[{key:'/works/OL1W'}]};
  else if(url.includes('/works/OL1W.json'))
   data={title:'Relentless',description:withOpenDescription?'A short test synopsis prepared for this importer.':undefined};
  else if(url.includes('openlibrary.org/search.json'))data={docs:[]};
  return new Response(data?JSON.stringify(data):'not found',{status:data?200:404,headers:{'Content-Type':'application/json'}});
 };
 return ()=>{globalThis.fetch=original};
}
test('one-click importer saves one work, author, exact ISBN edition and private synopsis; retry never duplicates',async()=>{
 const f=fixture(),restore=mockSources();
 try{
  const result=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,undefined,'paperback');
  assert.equal(result.created,true);
  assert.equal(result.status,'draft');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM editions').get()?.count,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM people').get()?.count,1);
  assert.equal(f.sqlite.prepare('SELECT page_count AS pages,format FROM editions').get()?.pages,480);
  assert.equal(f.sqlite.prepare('SELECT language FROM editions').get()?.language,'en');
  assert.equal(f.sqlite.prepare('SELECT first_publication_date FROM works').get()?.first_publication_date,null);
  assert.equal(f.sqlite.prepare("SELECT body,visibility FROM text_content").get()?.visibility,'private');
  assert.equal(f.sqlite.prepare("SELECT normalized_value FROM entity_identifiers").get()?.normalized_value,code);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM publication_events").get()?.count,1);
  const again=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,undefined,'paperback');
  assert.equal(again.created,false);
  assert.equal(again.id,result.id);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,1);
 }finally{restore();f.close()}
});
test('does not permanently copy a Google Books description without an independent or original synopsis',async()=>{
 const f=fixture(),restore=mockSources(false);
 try{
  const detail=await getSimpleBook('g:abc123','catalogue-admin');
  assert.equal(detail.synopsisSource,'Google Books');
  assert.equal(detail.coverUrl,'https://covers.openlibrary.org/b/isbn/'+code+'-L.jpg?default=false');
  await assert.rejects(importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner'),/authorised synopsis/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
  const saved=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,
   'An original test synopsis supplied by the catalogue administrator.','paperback');
  assert.equal(saved.created,true);
  assert.match(String(f.sqlite.prepare('SELECT body FROM text_content').get()?.body),/original test synopsis/);
 }finally{restore();f.close()}
});
test('search returns Google volume results with explicit ISBN, no arbitrary Open Library edition ISBN',async()=>{
 const restore=mockSources();
 try{
  const found=await findSimpleBooks('Relentless','catalogue-admin');
  assert.equal(found.items[0]?.isbn13,code);
  assert.equal(found.items[0]?.title,'Relentless');
 }finally{restore()}
});

test('title search prioritises explicitly English editions over unknown and foreign language editions',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('googleapis.com/books/v1/volumes?')){
   return Response.json({items:[
    {id:'spanish',volumeInfo:{title:'Persuader',authors:['Lee Child'],language:'es',industryIdentifiers:[{type:'ISBN_13',identifier:'9780306406157'}]}},
    {id:'unknown',volumeInfo:{title:'Persuader',authors:['Lee Child'],industryIdentifiers:[{type:'ISBN_13',identifier:'9780552156905'}]}},
    {id:'english',volumeInfo:{title:'Persuader',authors:['Lee Child'],language:'en',industryIdentifiers:[{type:'ISBN_13',identifier:'9781861972712'}]}}
   ]});
  }
  return Response.json({docs:[]});
 };
 try{
  const result=await findSimpleBooks('Persuader','catalogue-admin');
  assert.deepEqual(result.items.map(item=>item.language),['en',null,'es']);
  assert.deepEqual(result.items.map(item=>item.key),['g:english','g:unknown','g:spanish']);
 }finally{globalThis.fetch=original}
});

test('Open Library work artwork does not get reused for a different chosen ISBN edition',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('/b/isbn/'+code+'-L.jpg?default=false'))
   return new Response(new Uint8Array([255,216,255,217]),{status:200,headers:{'Content-Type':'image/jpeg'}});
  if(address.includes('/works/OL9W/editions.json'))
   return Response.json({entries:[{key:'/books/OL9M',isbn_13:[code],covers:[1234],
    publishers:['Corgi Books'],publish_date:'2007',number_of_pages:480,languages:[{key:'/languages/eng'}],physical_format:'Paperback'}]});
  if(address.includes('/works/OL9W.json'))
   return Response.json({title:'Relentless',description:'Verified test synopsis.',authors:[{author:{key:'/authors/OL9A'}}]});
  if(address.includes('/authors/OL9A.json'))return Response.json({name:'Simon Kernick'});
  return new Response('not found',{status:404});
 };
 try{
  const book=await getSimpleBook('o:OL9W','catalogue-admin');
  assert.equal(book.isbn13,code);
  assert.equal(book.coverUrl,'https://covers.openlibrary.org/b/isbn/'+code+'-L.jpg?default=false');
  assert.equal(book.language,'en');
 }finally{globalThis.fetch=original}
});

test('unknown edition format cannot be saved without explicit reviewed format; approved correction is publishable',async()=>{
 const f=fixture(),restore=mockSources(true,false);
 try{
  await assert.rejects(
   importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner'),
   /Choose a verified paperback, hardback or ebook format/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
  const result=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,undefined,'paperback');
  assert.equal(result.created,true);
  assert.equal(f.sqlite.prepare('SELECT format FROM editions').get()?.format,'paperback');
 }finally{restore();f.close()}
});
test('import rejects arbitrary or conflicting format overrides',async()=>{
 const f=fixture(),restore=mockSources();
 try{
  await assert.rejects(
   importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,undefined,'audiobook'),
   /Format selection conflicts/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
 }finally{restore();f.close()}
});

test('import rejects missing covers even when the book title and ISBN are complete',async()=>{
 const f=fixture();
 const original=globalThis.fetch;
 const restore=mockSources();
 const base=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).includes('/b/isbn/'))return new Response('no cover',{status:404,headers:{'Content-Type':'text/plain'}});
  return base(input,init);
 };
 try{
  const detail=await getSimpleBook('g:abc123','catalogue-admin');
  assert.equal(detail.coverUrl,null);
  assert.ok(detail.missing.includes('coverUrl'));
  await assert.rejects(importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,undefined,'paperback'),/No verified cover image/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
 }finally{restore();globalThis.fetch=original;f.close()}
});

test('known book-level artwork is retained separately when the selected ISBN has no edition cover',async()=>{
 const f=fixture(),restore=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('/works/OL9W/editions.json'))return Response.json({entries:[{
   isbn_13:[code],publishers:['Corgi Books'],publish_date:'2007',number_of_pages:480,
   languages:[{key:'/languages/eng'}],physical_format:'Paperback'
  }]});
  if(address.includes('/works/OL9W.json'))return Response.json({
   title:'Relentless',description:'An authorised sample synopsis.',
   authors:[{author:{key:'/authors/OL9A'}}]});
  if(address.includes('/authors/OL9A.json'))return Response.json({name:'Simon Kernick'});
  if(address.includes('openlibrary.org/search.json'))return Response.json({docs:[
   {key:'/works/OL9W',title:'Relentless',author_name:['Simon Kernick'],cover_i:4321}
  ]});
  if(address.includes('/b/id/4321-L.jpg?default=false'))
   return new Response(new Uint8Array([255,216,255,217]),{status:200,headers:{'Content-Type':'image/jpeg'}});
  return new Response('not found',{status:404});
 };
 try{
  const choice=await getSimpleBook('o:OL9W','catalogue-admin');
  assert.equal(choice.coverKind,'work');
  assert.equal(choice.coverUrl,'https://covers.openlibrary.org/b/id/4321-L.jpg?default=false');
  const added=await importSimpleBook(f.conn,'o:OL9W',code,'catalogue-admin','owner');
  assert.equal(added.created,true);
  assert.equal(f.sqlite.prepare('SELECT openlibrary_cover_id AS coverId FROM work_representative_covers').get()?.coverId,4321);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM media_links').get()?.count,0);
 }finally{globalThis.fetch=restore;f.close()}
});

test('author search requests ISBNdb only once for multiple returned books',async()=>{
 const original=globalThis.fetch;
 let isbnDbCalls=0;
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const address=String(input);
  if(address.includes('api2.isbndb.com/books/')){
   isbnDbCalls++;
   assert.equal((init?.headers as Record<string,string>).Authorization,'TEST_KEY');
   assert.ok(address.includes('pageSize=20'));
   return Response.json({total:25,books:[
    {isbn13:code,title:'Relentless',authors:['Simon Kernick'],binding:'Paperback',language:'en'},
    {isbn13:'9781408855652',title:'Another book',authors:['Simon Kernick'],binding:'Hardback',language:'en'}
   ]});
  }
  if(address.includes('googleapis.com'))return Response.json({items:[]});
  if(address.includes('openlibrary.org/search.json'))return Response.json({docs:[]});
  return new Response('not found',{status:404});
 };
 try{
  const result=await findSimpleBooks('Simon Kernick','catalogue-admin',undefined,'TEST_KEY');
  assert.equal(isbnDbCalls,1);
  assert.equal(result.sources.isbnDb,'matched');
  assert.equal(result.items.length,2);
  assert.equal(result.items[0]?.source,'ISBNdb');
  assert.ok(result.items.every(item=>item.coverUrl===null));
 }finally{globalThis.fetch=original}
});
test('search merges matching ISBNs without duplicating Google and ISBNdb editions',async()=>{
 const original=globalThis.fetch;
 let isbnDbCalls=0;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('api2.isbndb.com/books/')){
   isbnDbCalls++;
   return Response.json({total:1,books:[{isbn13:code,title:'Relentless',authors:['Simon Kernick']}]});
  }
  if(address.includes('googleapis.com'))return Response.json({items:[{id:'abc123',volumeInfo:{
   title:'Relentless',authors:['Simon Kernick'],industryIdentifiers:[{type:'ISBN_13',identifier:code}]
  }}]});
  if(address.includes('openlibrary.org/search.json'))return Response.json({docs:[]});
  return new Response('not found',{status:404});
 };
 try{
  const result=await findSimpleBooks('Simon Kernick','catalogue-admin',undefined,'TEST_KEY');
  assert.equal(isbnDbCalls,1);
  assert.equal(result.items.filter(item=>item.isbn13===code).length,1);
  assert.equal(result.items[0]?.source,'Google Books');
 }finally{globalThis.fetch=original}
});
test('ISBNdb-only results are research-only and cannot write catalogue data',async()=>{
 const f=fixture();
 try{
  await assert.rejects(importSimpleBook(f.conn,'i:'+code,code,'catalogue-admin','owner'),/research-only/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM editions').get()?.count,0);
 }finally{f.close()}
});
test('ISBNdb failure does not block Google Books search',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('api2.isbndb.com/books/'))return new Response('',{status:429});
  if(address.includes('googleapis.com'))return Response.json({items:[{id:'abc123',volumeInfo:{
   title:'Relentless',authors:['Simon Kernick'],industryIdentifiers:[{type:'ISBN_13',identifier:code}]
  }}]});
  return Response.json({docs:[]});
 };
 try{
  const result=await findSimpleBooks('Simon Kernick','catalogue-admin',undefined,'TEST_KEY');
  assert.equal(result.sources.isbnDb,'rate_limited');
  assert.equal(result.items[0]?.source,'Google Books');
 }finally{globalThis.fetch=original}
});

test('safe search diagnostics expose ISBNdb counts and deduplicated editions',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const address=String(input);
  if(address.includes('api2.isbndb.com/books/'))return Response.json({total:2,books:[
   {isbn13:code,title:'Relentless',authors:['Simon Kernick']},
   {isbn13:'9781408855652',title:'Another title',authors:['Simon Kernick']}
  ]});
  if(address.includes('googleapis.com'))return Response.json({items:[{
   id:'abc123',volumeInfo:{title:'Relentless',authors:['Simon Kernick'],industryIdentifiers:[{type:'ISBN_13',identifier:code}]}
  }]});
  return Response.json({docs:[]});
 };
 try{
  const result=await findSimpleBooks('Simon Kernick','catalogue-admin',undefined,'TEST_KEY');
  assert.equal(result.diagnostics.isbnDbCandidates,2);
  assert.equal(result.diagnostics.isbnDbNewEditions,1);
  assert.equal(result.diagnostics.googleCandidates,1);
  assert.equal(result.diagnostics.openLibraryCandidates,0);
  assert.equal(result.items.filter(x=>x.isbn13===code).length,1);
 }finally{globalThis.fetch=original}
});
