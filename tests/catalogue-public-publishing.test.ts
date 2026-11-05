import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {publicCatalogueAPI} from '../src/worker/catalogue-public-api';

type Param=string|number|null;
function seededCatalogue(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../catalogue-migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())
  db.exec(readFileSync(new URL(name,dir),'utf8'));
 const insert=(sql:string,...args:Param[])=>db.prepare(sql).run(...args);
 insert("INSERT INTO works(id,canonical_title,status,first_publication_date) VALUES('published-work','The Business of Dying','published','2010-05-05')");
 insert("INSERT INTO works(id,canonical_title,status) VALUES('draft-work','Unpublished Fixture','draft')");
 insert("INSERT INTO people(id,preferred_name) VALUES('canonical-author','Simon Kernick')");
 insert("INSERT INTO people(id,preferred_name) VALUES('draft-only-author','Private Author')");
 insert("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES('published-credit','canonical-author','published-work','author')");
 insert("INSERT INTO contributions(id,person_id,work_id,role_code) VALUES('draft-credit','draft-only-author','draft-work','author')");
 insert("INSERT INTO editions(id,work_id,format,publication_status) VALUES('published-ebook','published-work','ebook','published')");
 insert("INSERT INTO editions(id,work_id,format,publication_status) VALUES('unapproved-paperback','published-work','paperback','draft')");
 insert("INSERT INTO editions(id,work_id,format) VALUES('draft-ebook','draft-work','ebook')");
 insert("INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility) VALUES('public-description','work','published-work','synopsis','Public book synopsis','public')");
 insert("INSERT INTO text_content(id,entity_kind,entity_id,content_type,body,visibility) VALUES('private-description','work','draft-work','synopsis','Private draft synopsis','private')");
 const connector={
  prepare(sql:string){
   let args:Param[]=[];
   const stmt={
    bind(...values:Param[]){args=values;return stmt;},
    async first<T>():Promise<T|null>{return (db.prepare(sql).get(...args) as T|undefined)??null},
    async all<T>():Promise<{results:T[]}>{return {results:db.prepare(sql).all(...args) as T[]}}
   };
   return stmt;
  }
 };
 async function get<T>(route:string){
  const response=await publicCatalogueAPI(new Request('https://example.test/api/catalogue-public/'+route),connector);
  if(response.status!==200)assert.fail('Catalogue response '+route+' returned '+response.status+': '+await response.text());
  return await response.json() as T;
 }
 return {get,close:()=>db.close()};
}
test('published book appears in search, detail page, and canonical author bibliography',async()=>{
 const f=seededCatalogue();
 try{
  const list=await f.get<{items:{id:string;title:string;author:string;authorId:string;formats:string[]}[]}>('books?q=Business%20of%20Dying');
  assert.deepEqual(list.items.map(x=>x.id),['published-work']);
  assert.equal(list.items[0]?.author,'Simon Kernick');
  assert.equal(list.items[0]?.authorId,'canonical-author');
  assert.deepEqual(list.items[0]?.formats,['ebook']);
  const detail=await f.get<{book:{id:string;authorId:string;summary:string};editions:{id:string}[]}>('book/published-work');
  assert.equal(detail.book.id,'published-work');
  assert.equal(detail.book.authorId,'canonical-author');
  assert.equal(detail.book.summary,'Public book synopsis');
  assert.deepEqual(detail.editions.map(x=>x.id),['published-ebook']);
  assert.deepEqual(list.items[0]?.formats,['ebook']);
  const profile=await f.get<{person:{id:string};works:{id:string}[]}>('person/canonical-author');
  assert.equal(profile.person.id,'canonical-author');
  assert.deepEqual(profile.works.map(x=>x.id),['published-work']);
 }finally{f.close()}
});
test('draft book and draft-only author remain invisible on public catalogue',async()=>{
 const f=seededCatalogue();
 try{
  const books=await f.get<{items:{id:string}[]}>('books');
  assert.ok(!books.items.some(x=>x.id==='draft-work'));
  const people=await f.get<{items:{id:string}[]}>('people?role=author');
  assert.deepEqual(people.items.map(x=>x.id),['canonical-author']);
  const profile=await f.get<{person:{id:string};works:{id:string}[]}>('person/draft-only-author');
  assert.equal(profile.works.length,0);
 }finally{f.close()}
});
