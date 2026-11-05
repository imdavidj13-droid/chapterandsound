import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {resolveISBNClaims} from '../src/worker/catalogue-isbn-reconciliation';
import type {ISBNdbLookup} from '../src/worker/catalogue-isbndb-resolver';

const isbn='9780552156905';
const matched:ISBNdbLookup={status:'matched',rights:'not_reviewed',coverStatus:'not_verified',edition:{
 source:'ISBNdb',isbn13:isbn,title:'Relentless',authors:['Simon Kernick'],
 publisher:'Corgi',publishedDate:'2007',pageCount:480,language:'en',
 format:'paperback',bindingLabel:'Paperback',coverCandidateUrl:'https://images.isbndb.com/example.jpg',
 descriptionAvailable:true
}};
function mock(isGooglePresent=true,isOlPresent=true):typeof fetch{
 return async input=>{
  const url=String(input);
  if(url.includes('googleapis.com/books/v1/volumes')){
   if(!isGooglePresent)return new Response('forbidden',{status:403});
   return Response.json({items:[{volumeInfo:{
    title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi',
    publishedDate:'2007',pageCount:480,language:'en',
    industryIdentifiers:[{type:'ISBN_13',identifier:isbn}]
   }}]});
  }
  if(url.includes('openlibrary.org/isbn/')){
   if(!isOlPresent)return new Response('not found',{status:404});
   return Response.json({title:'Relentless',isbn_13:[isbn],publishers:['Corgi'],
    number_of_pages:480,physical_format:'Paperback',publish_date:'2007',
    languages:[{key:'/languages/eng'}],covers:[1234]});
  }
  return new Response('not found',{status:404});
 };
}
const lookup=async():Promise<ISBNdbLookup>=>matched;
test('ISBN evidence merging agrees on exact ISBN claims; never enables importing',async()=>{
 const result=await resolveISBNClaims(isbn,{fetchImpl:mock(),lookupIsbndb:lookup});
 assert.equal(result.status,'ready_for_review');
 assert.equal(result.fields.pages.value,480);
 assert.equal(result.fields.publisher.value,'Corgi');
 assert.equal(result.fields.language.value,'en');
 assert.equal(result.fields.format.value,'paperback');
 assert.equal(result.conflicts.length,0);
 assert.equal(result.missing.length,0);
 assert.equal(result.canImport,false);
 assert.equal(result.coverCandidates.length,2);
 assert.ok(result.coverCandidates.every(c=>c.verifiedImage===false&&c.isbn13===isbn));
});
test('conflicting page counts are exposed, never silently treated as verified',async()=>{
 const altered=async():Promise<ISBNdbLookup>=>({...matched,edition:{...matched.edition,pageCount:464}});
 const result=await resolveISBNClaims(isbn,{fetchImpl:mock(),lookupIsbndb:altered});
 assert.equal(result.status,'conflict');
 assert.ok(result.conflicts.includes('pages'));
 assert.equal(result.fields.pages.conflict,true);
 assert.equal(result.fields.pages.claims.length,3);
});
test('provider outage does not hide other exact ISBN matches',async()=>{
 const result=await resolveISBNClaims(isbn,{fetchImpl:mock(false,true),lookupIsbndb:async()=>({
  status:'unavailable',message:'not configured'
 })});
 assert.equal(result.sourceStatus.ISBNdb,'unavailable');
 assert.equal(result.sourceDiagnostics.ISBNdb,'request_unavailable');
 assert.equal(result.sourceDiagnostics['Google Books'],'http_403');
 assert.equal(result.sourceStatus['Google Books'],'HTTP_403');
 assert.equal(result.fields.format.value,'paperback');
 assert.equal(result.canImport,false);
});
test('mismatched ISBN data from Google is never merged',async()=>{
 const wrong:typeof fetch=async input=>{
  const u=String(input);
  if(u.includes('googleapis.com'))return Response.json({items:[{volumeInfo:{
   title:'Wrong book',authors:['Wrong'],pageCount:999,industryIdentifiers:[{type:'ISBN_13',identifier:'9781408855652'}]
  }}]});
  return new Response('not found',{status:404});
 };
 const result=await resolveISBNClaims(isbn,{fetchImpl:wrong,lookupIsbndb:lookup});
 assert.equal(result.fields.title.value,'Relentless');
 assert.equal(result.fields.pages.value,480);
 assert.equal(result.sourceStatus['Google Books'],'not_found');
 assert.equal(result.sourceDiagnostics['Google Books'],'results_without_exact_isbn');
});
test('missing English edition evidence blocks automatic readiness',async()=>{
 const nl=async():Promise<ISBNdbLookup>=>({...matched,edition:{...matched.edition,language:'nl'}});
 const result=await resolveISBNClaims(isbn,{fetchImpl:mock(false,false),lookupIsbndb:nl});
 assert.equal(result.status,'incomplete');
 assert.ok(result.missing.includes('English edition not confirmed'));
 assert.equal(result.canImport,false);
});
test('invalid ISBN is rejected before provider requests',async()=>{
 let calls=0;
 await assert.rejects(resolveISBNClaims('1234567890123',{fetchImpl:async()=>{
  calls++;return Response.json({});
 }}),/Invalid ISBN/);
 assert.equal(calls,0);
});

test('distinguishes an empty Google Books search from unmatched ISBN responses',async()=>{
 const fetchImpl:typeof fetch=async input=>{
  if(String(input).includes('googleapis.com'))return Response.json({totalItems:0});
  return new Response('',{status:404});
 };
 const result=await resolveISBNClaims(isbn,{fetchImpl,lookupIsbndb:async()=>({
  status:'unavailable',message:'network failure',reason:'transport_error'
 })});
 assert.equal(result.sourceStatus['Google Books'],'not_found');
 assert.equal(result.sourceDiagnostics['Google Books'],'no_results');
 assert.equal(result.sourceDiagnostics.ISBNdb,'transport_error');
 assert.equal(result.canImport,false);
});

test('year-only and exact-day claims remain compatible without inventing date precision',async()=>{
 const olDate:typeof fetch=async input=>{
  if(String(input).includes('openlibrary.org/isbn/'))return Response.json({
   title:'Relentless',isbn_13:[isbn],publishers:['Corgi'],
   publish_date:'2007-01-01'
  });
  if(String(input).includes('googleapis.com'))return Response.json({totalItems:0});
  return new Response('',{status:404});
 };
 const result=await resolveISBNClaims(isbn,{fetchImpl:olDate,lookupIsbndb:lookup});
 assert.equal(result.status,'ready_for_review');
 assert.equal(result.fields.publishedDate.value,'2007');
 assert.equal(result.fields.publishedDate.conflict,false);
 assert.deepEqual(result.fields.publishedDate.claims.map(c=>c.value),['2007','2007-01-01']);
 assert.equal(result.canImport,false);
});
test('contradictory months remain genuine publication-date conflicts',async()=>{
 const dated:typeof fetch=async input=>{
  if(String(input).includes('openlibrary.org/isbn/'))return Response.json({
   title:'Relentless',isbn_13:[isbn],publish_date:'2007-02-01'
  });
  return Response.json({totalItems:0});
 };
 const specific=async():Promise<ISBNdbLookup>=>({...matched,edition:{...matched.edition,publishedDate:'2007-01'}});
 const result=await resolveISBNClaims(isbn,{fetchImpl:dated,lookupIsbndb:specific});
 assert.equal(result.status,'conflict');
 assert.ok(result.conflicts.includes('publishedDate'));
});
test('different publication years remain genuine conflicts',async()=>{
 const dated:typeof fetch=async input=>{
  if(String(input).includes('openlibrary.org/isbn/'))return Response.json({
   title:'Relentless',isbn_13:[isbn],publish_date:'2008'
  });
  return Response.json({totalItems:0});
 };
 const result=await resolveISBNClaims(isbn,{fetchImpl:dated,lookupIsbndb:lookup});
 assert.ok(result.conflicts.includes('publishedDate'));
});
