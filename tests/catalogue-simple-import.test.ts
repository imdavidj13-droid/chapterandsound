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
function mockSources(withOpenDescription=true){
 const original=globalThis.fetch;
 globalThis.fetch=async(input:RequestInfo|URL)=>{
  const url=String(input);
  let data:unknown=null;
  if(url.includes('googleapis.com/books/v1/volumes/abc123'))
   data={id:'abc123',volumeInfo:{title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi Books',
    publishedDate:'2007-01-01',pageCount:480,language:'en',industryIdentifiers:[{type:'ISBN_13',identifier:code}],description:'Publisher text that must not be saved'}};
  else if(url.includes('googleapis.com/books/v1/volumes?'))
   data={items:[{id:'abc123',volumeInfo:{title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi Books',publishedDate:'2007',pageCount:480,language:'en',
    industryIdentifiers:[{type:'ISBN_13',identifier:code}]}}]};
  else if(url.includes('/isbn/'+code+'.json'))
   data={key:'/books/OL1M',isbn_13:[code],physical_format:'Paperback',languages:[{key:'/languages/eng'}],works:[{key:'/works/OL1W'}]};
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
  const result=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner');
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
  const again=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner');
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
  await assert.rejects(importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner'),/authorised synopsis/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM works').get()?.count,0);
  const saved=await importSimpleBook(f.conn,'g:abc123',code,'catalogue-admin','owner',undefined,
   'An original test synopsis supplied by the catalogue administrator.');
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
