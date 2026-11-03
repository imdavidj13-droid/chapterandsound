import test from 'node:test';
import assert from 'node:assert/strict';
import {publicReviewAPI} from '../src/worker/public-review-api.js';
import type {PublicReviewEnv} from '../src/worker/public-review-api.js';

const published={id:'review-1',title:'A thoughtful review',body:'A genuine reader opinion',
  storyRating:4,audioRating:null,spoilers:0,publishedAt:'2026-11-03 00:00:00',
  bookId:'book-1',editionId:null,bookTitle:'Example book',
  format:'paperback',authorId:'user-1',authorHandle:'reader',authorName:'Reader',
  helpfulCount:3};

function database(rows:Record<string,unknown>){
 return {prepare(sql:string){
   return {bind(...args:unknown[]){
     return {
       async first(){if(sql.includes('WHERE r.id=?')&&args[0]==='review-1')return rows.review??null;return null},
       async all(){return {results:[]}},
       async run(){return {}}
     };
   }};
 }} as unknown as NonNullable<PublicReviewEnv['DB']>;
}
test('anonymous visitors can read only published public review details',async()=>{
 const result=await publicReviewAPI(new Request('https://chapterandsound.test/api/public-reviews/review-1'),{DB:database({review:published})});
 assert.equal(result.status,200);
 const payload=await result.json() as {item:{id:string;helpfulCount:number};viewerHelpful:boolean};
 assert.equal(payload.item.id,'review-1');
 assert.equal(payload.item.helpfulCount,3);
 assert.equal(payload.viewerHelpful,false);
});
test('missing or non-public reviews return not found',async()=>{
 const result=await publicReviewAPI(new Request('https://chapterandsound.test/api/public-reviews/private-review'),{DB:database({})});
 assert.equal(result.status,404);
});
test('anonymous helpful votes are rejected',async()=>{
 const result=await publicReviewAPI(new Request('https://chapterandsound.test/api/public-reviews/review-1/helpful',{
 method:'POST',headers:{Origin:'https://chapterandsound.test'}
 }),{DB:database({review:published})});
 assert.equal(result.status,401);
});
test('cross-origin report writes are rejected',async()=>{
 const result=await publicReviewAPI(new Request('https://chapterandsound.test/api/public-reviews/review-1/report',{
 method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},
 body:JSON.stringify({reason:'Testing an untrusted origin'})
 }),{DB:database({review:published})});
 assert.equal(result.status,403);
});
