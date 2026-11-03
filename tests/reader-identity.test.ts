import test from 'node:test';
import assert from 'node:assert/strict';
import {readerAPI} from '../src/worker/reader-api.js';
import type {ReaderEnv} from '../src/worker/reader-api.js';

test('reader profile lookup exposes only curated public fields and published reviews',async()=>{
 let lastSql='';
 const db={prepare(sql:string){lastSql=sql;return {bind(){return {async first(){
    if(lastSql.includes('FROM members'))return {id:'member-1',handle:'reader',displayName:'@reader',bio:null};
    return null;
   },async all(){return {results:[{id:'review-1',title:'An opinion',bookTitle:'A novel'}]}}}}}} as unknown as NonNullable<ReaderEnv['DB']>;
 const res=await readerAPI(new Request('https://chapterandsound.example/api/reader/Reader'),{DB:db});
 assert.equal(res.status,200);
 const result=await res.json() as {reader:Record<string,unknown>;reviews:Array<{id:string}>};
 assert.equal(result.reader.displayName,'@reader');
 assert.equal(result.reviews[0]?.id,'review-1');
 assert.equal('email' in result.reader,false);
 assert.equal('reading_experiences' in result.reader,false);
});
test('invalid handles are rejected without accessing D1',async()=>{
 const res=await readerAPI(new Request('https://chapterandsound.example/api/reader/a%20b'),{});
 assert.equal(res.status,503);
 const db={prepare(){throw Error('Should not query database')}} as unknown as NonNullable<ReaderEnv['DB']>;
 const invalid=await readerAPI(new Request('https://chapterandsound.example/api/reader/a%20b'),{DB:db});
 assert.equal(invalid.status,400);
});
