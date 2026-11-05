import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {bindingFormat,lookupISBNdbEdition} from '../src/worker/catalogue-isbndb-resolver';

const isbn='9780552156905';
const fixture={book:{
 isbn13:isbn,title:'Relentless',authors:['Simon Kernick'],publisher:'Corgi Books',
 date_published:'2007-01-01',pages:480,language:'en',binding:'Paperback',
 image:'https://example.org/cover.jpg',synopsis:'Publisher description (not saved)'
}};
test('no API request is made without a configured key',async()=>{
 let calls=0;
 const result=await lookupISBNdbEdition(isbn,undefined,async()=>{calls++;return Response.json(fixture)});
 assert.equal(result.status,'unavailable');
 assert.equal(calls,0);
});
test('validates an exact ISBN and returns read-only structured edition facts',async()=>{
 let requested='';
 const result=await lookupISBNdbEdition(isbn,'TEST_ONLY',async(input,init)=>{
  requested=String(input);
  assert.equal((init?.headers as Record<string,string>).Authorization,'TEST_ONLY');
  return Response.json(fixture);
 });
 assert.equal(requested,'https://api2.isbndb.com/book/'+isbn);
 assert.equal(result.status,'matched');
 if(result.status!=='matched')return;
 assert.equal(result.edition.format,'paperback');
 assert.equal(result.edition.pageCount,480);
 assert.equal(result.edition.language,'en');
 assert.equal(result.edition.isbn13,isbn);
 assert.equal(result.rights,'not_reviewed');
 assert.equal(result.coverStatus,'not_verified');
 assert.equal(result.edition.coverCandidateUrl,'https://example.org/cover.jpg');
 assert.equal('synopsis' in result.edition,false);
});
test('rejects mismatched ISBN instead of using another edition',async()=>{
 const result=await lookupISBNdbEdition(isbn,'TEST_ONLY',async()=>Response.json({
  book:{...fixture.book,isbn13:'9781408855652',title:'Relentless'}
 }));
 assert.equal(result.status,'isbn_mismatch');
});
test('does not accept ambiguous binding classifications or unknown language',async()=>{
 assert.equal(bindingFormat('Paperback / Hardcover'),null);
 assert.equal(bindingFormat('Audio CD'),null);
 assert.equal(bindingFormat('Mass Market Paperback'),'paperback');
 const result=await lookupISBNdbEdition(isbn,'TEST_ONLY',async()=>Response.json({
  book:{...fixture.book,binding:'Audio CD',language:'not a language'}
 }));
 assert.equal(result.status,'matched');
 if(result.status==='matched'){
  assert.equal(result.edition.format,null);
  assert.equal(result.edition.language,null);
 }
});
test('reports provider outages separately from no matches, without exposing the key',async()=>{
 const limited=await lookupISBNdbEdition(isbn,'SECRET_VALUE',async()=>new Response('',{status:429}));
 assert.equal(limited.status,'rate_limited');
 assert.doesNotMatch(JSON.stringify(limited),/SECRET_VALUE/);
 const absent=await lookupISBNdbEdition(isbn,'SECRET_VALUE',async()=>new Response('',{status:404}));
 assert.equal(absent.status,'not_found');
});
test('does not request ISBNdb on invalid ISBN input',async()=>{
 let calls=0;
 const result=await lookupISBNdbEdition('1234567890123','TEST_ONLY',async()=>{
  calls++;return Response.json(fixture);
 });
 assert.equal(result.status,'invalid_response');
 assert.equal(calls,0);
});

test('retries a brief 429 once and accepts the exact ISBN on recovery',async()=>{
 let requests=0;
 const result=await lookupISBNdbEdition(isbn,'TEST_ONLY',async()=>{
  requests++;
  return requests===1?new Response('',{status:429,headers:{'Retry-After':'0'}}):Response.json(fixture);
 });
 assert.equal(requests,2);
 assert.equal(result.status,'matched');
});
test('does not retry a long Retry-After quota response',async()=>{
 let requests=0;
 const result=await lookupISBNdbEdition(isbn,'TEST_ONLY',async()=>{
  requests++;
  return new Response('',{status:429,headers:{'Retry-After':'3600'}});
 });
 assert.equal(requests,1);
 assert.equal(result.status,'rate_limited');
});
test('does not follow redirects to another host with the authorization key',async()=>{
 const result=await lookupISBNdbEdition(isbn,'SECRET_VALUE',async(_input,init)=>{
  assert.equal(init?.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://other.example/book'}});
 });
 assert.equal(result.status,'provider_error');
 if(result.status==='provider_error')assert.equal(result.reason,'redirect_blocked');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_VALUE|other\\.example/);
});
test('transport errors do not expose credentials or exception text',async()=>{
 const result=await lookupISBNdbEdition(isbn,'SECRET_VALUE',async()=>{
  throw new TypeError('SECRET_VALUE in upstream error');
 });
 assert.equal(result.status,'unavailable');
 if(result.status==='unavailable')assert.equal(result.reason,'transport_error');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_VALUE/);
});
