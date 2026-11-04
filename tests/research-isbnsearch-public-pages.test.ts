import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error The site research module is plain JavaScript.
import {parseIsbnSearch,checkRobots,validateMatch,research,isAccessVerificationPage} from '../scripts/research-isbnsearch-public-pages.mjs';
const isbn='9780593054703';
const html='<html><h2>Relentless</h2><p><b>ISBN-13:</b> '+isbn+
 '</p><p><b>ISBN-10:</b> 0593054709</p><p><b>Author:</b> Kernick, Simon</p>'+
 '<p><b>Binding:</b> Paperback</p><p><b>Publisher:</b> Bantam</p><p><b>Published:</b> 2006</p></html>';
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Book '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+(i+1)+'W',
 editions:[{sourceKey:'/books/OL'+(i+1)+'M',isbn13:i===0?isbn:null,format:'unknown'}]
}))});
test('parses explicit ISBN binding and factual fields',()=>{
 const r=parseIsbnSearch(html,isbn);
 assert.equal(r.format,'paperback');
 assert.equal(r.publisher,'Bantam');
 assert.equal(r.publicationDate,'2006');
 assert.equal(r.isbn13,isbn);
});
test('does not infer format for ISBN result missing Binding',()=>{
 const r=parseIsbnSearch(html.replace(/<p><b>Binding:<\/b> Paperback<\/p>/,''),isbn);
 assert.equal(r.format,null);
});
test('checks explicit robots exclusions, allowing other paths',()=>{
 const robots='User-agent: *\nDisallow: /isbn/\nAllow: /isbn/9780593054703\n';
 assert.equal(checkRobots(robots,'/isbn/'+isbn),true);
 assert.equal(checkRobots(robots,'/isbn/9781407095301'),false);
 assert.equal(checkRobots('User-agent: *\nDisallow: /\n','/isbn/'+isbn),false);
});
test('resolves local provisional candidate without editing edition',async()=>{
 const input=fixture();
 const result=await research(input,{
  getRobots:async()=> 'User-agent: *\nAllow: /isbn/\n',
  getPage:async()=>html,max:1,delay:0
 });
 assert.equal(result.totals.provisionalFormats,1);
 assert.equal(result.findings[0].format,'paperback');
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
 assert.equal(result.databaseWrites,0);
});
test('does not fetch pages when robots policy disallows them',async()=>{
 let requests=0;
 await assert.rejects(research(fixture(),{
  getRobots:async()=> 'User-agent: *\nDisallow: /isbn/\n',
  getPage:async()=>{requests++;return html},max:1,delay:0
 }),/robots policy/);
 assert.equal(requests,0);
});
test('work author mismatch prevents provisional classification',()=>{
 const parsed=parseIsbnSearch(html.replace('Kernick, Simon','Other Writer'),isbn);
 assert.equal(validateMatch(fixture().candidates[0],fixture().candidates[0]!.editions[0],parsed),'author_mismatch');
});

test('parses realistic bookinfo block and surname-first author',()=>{
 const real='<div class="bookinfo"><h1>Relentless</h1>'+
 '<p><strong>ISBN-13:</strong> 9780593054703</p>'+
 '<p><strong>ISBN-10:</strong> 0593054709</p>'+
 '<p><strong>Author:</strong> Kernick, Simon</p>'+
 '<p><strong>Binding:</strong> Paperback</p>'+
 '<p><strong>Publisher:</strong> Bantam</p>'+
 '<p><strong>Published:</strong> 2006</p></div>';
 const parsed=parseIsbnSearch(real,isbn);
 assert.equal(parsed.format,'paperback');
 assert.equal(parsed.title,'Relentless');
 assert.equal(validateMatch(fixture().candidates[0],fixture().candidates[0]!.editions[0],parsed),'provisional_binding');
});
test('report shows why pages did not produce provisional bindings',async()=>{
 const result=await research(fixture(),{
  getRobots:async()=> 'User-agent: *\nAllow: /isbn/\n',
  getPage:async()=>'<html><h1>Access unavailable</h1></html>',
  max:1,delay:0
 });
 assert.equal(result.totals.provisionalFormats,0);
 assert.equal(result.totals.statusCounts.no_structured_isbn,1);
});

test('browser verification page is not recorded as a successful lookup',async()=>{
 const challenge='<html><title>ISBN Search - Checking your browser</title></html>';
 assert.equal(isAccessVerificationPage(challenge),true);
 let requests=0;
 const result=await research(fixture(),{
  getRobots:async()=> 'User-agent: *\nAllow: /isbn/\n',
  getPage:async()=>{requests++;return challenge;},
  max:2,delay:0
 });
 assert.equal(requests,1);
 assert.equal(result.totals.checked,0);
 assert.equal(result.totals.provisionalFormats,0);
 assert.equal(result.errors[0].error,'access_verification_page');
});
