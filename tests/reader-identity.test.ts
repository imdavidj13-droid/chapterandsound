import test from 'node:test';
import assert from 'node:assert/strict';
import {readerAPI} from '../src/worker/reader-api.js';
import type {ReaderEnv} from '../src/worker/reader-api.js';

test('public profile only returns selected fields and published review records',async()=>{
 const db={
  prepare(sql:string){
   return {
    bind(_handle:string){
     return {
      async first(){
       return sql.includes('FROM members')
        ? {id:'member-1',handle:'reader',displayName:'@reader',bio:null}:null;
      },
      async all(){
       assert.ok(sql.includes("r.status='published'"));
       assert.ok(sql.includes("r.visibility='public'"));
       return {results:[{id:'review-1',title:'A reader opinion',bookTitle:'A novel'}]};
      }
     };
    }
   };
  }
 } as unknown as NonNullable<ReaderEnv['DB']>;
 const res=await readerAPI(new Request('https://chapterandsound.example/api/reader/Reader'),{DB:db});
 assert.equal(res.status,200);
 const result=await res.json() as {reader:Record<string,unknown>;reviews:Array<{id:string}>};
 assert.equal(result.reader.displayName,'@reader');
 assert.equal(result.reviews[0]?.id,'review-1');
 assert.equal('email' in result.reader,false);
 assert.equal('reading_experiences' in result.reader,false);
});
test('invalid handles are rejected before database access',async()=>{
 const db={prepare(){throw Error('Unexpected database access')}} as unknown as NonNullable<ReaderEnv['DB']>;
 const response=await readerAPI(new Request('https://chapterandsound.example/api/reader/a%20b'),{DB:db});
 assert.equal(response.status,400);
});
