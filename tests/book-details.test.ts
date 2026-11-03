import test from 'node:test';
import assert from 'node:assert/strict';
import {bookDetailsAPI} from '../src/worker/book-details-api.js';
import type {BookDetailsEnv} from '../src/worker/book-details-api.js';

function mockDB(){
  const statements:string[]=[];
  const db={
    prepare(sql:string){
      statements.push(sql);
      return {bind(..._values:unknown[]){
        return {
          async first(){
            if(sql.includes('FROM works w WHERE w.id='))return {id:'book-1',title:'A book',author:'A reader',summary:null,year:null,verificationStatus:'verified'};
            if(sql.includes('AVG(story_rating)'))return {average:4,count:2};
            return null;
          },
          async all(){
            if(sql.includes('FROM editions WHERE work_id='))return {results:[{id:'edition-1',format:'audiobook',durationMinutes:180,verificationStatus:'verified'}]};
            if(sql.includes('FROM edition_contributors ec'))return {results:[{editionId:'edition-1',name:'A narrator',id:'person-1',role:'narrator'}]};
            if(sql.includes('GROUP BY edition_id'))return {results:[{editionId:'edition-1',average:4.5,count:1}]};
            return {results:[]};
          }
        };
      }};
    }
  };
  return {db:db as unknown as NonNullable<BookDetailsEnv['DB']>,statements};
}
test('book detail separates story and edition-specific narration ratings',async()=>{
  const {db,statements}=mockDB();
  const result=await bookDetailsAPI(new Request('https://example.org/api/book/book-1'),{DB:db});
  assert.equal(result.status,200);
  const json=await result.json() as {book:{title:string};editions:Array<{contributors:Array<{name:string}>}>;ratings:{story:{average:number;count:number};narrationByEdition:Array<{editionId:string;average:number}>}};
  assert.equal(json.book.title,'A book');
  assert.equal(json.editions[0]?.contributors[0]?.name,'A narrator');
  assert.equal(json.ratings.story.count,2);
  assert.equal(json.ratings.narrationByEdition[0]?.editionId,'edition-1');
  assert.ok(statements.some(s=>s.includes('PARTITION BY member_id')));
  assert.ok(statements.some(s=>s.includes('PARTITION BY r.member_id,r.edition_id')));
});
test('book detail fails closed when D1 is unavailable',async()=>{
  const response=await bookDetailsAPI(new Request('https://example.org/api/book/book-1'),{});
  assert.equal(response.status,503);
});
test('non-GET public book methods are rejected',async()=>{
  const response=await bookDetailsAPI(new Request('https://example.org/api/book/book-1',{method:'POST'}),{});
  assert.equal(response.status,405);
});
