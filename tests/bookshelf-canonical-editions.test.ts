import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../src/worker/index.ts',import.meta.url),'utf8');
const bookshelf=readFileSync(new URL('../src/site/MemberWorkspace.tsx',import.meta.url),'utf8');

test('bookshelf edition selector queries published BOOK_DB editions, not just legacy DB',()=>{
 const start=worker.indexOf("if(url.pathname==='/api/editions')");
 const end=worker.indexOf("if(url.pathname==='/api/books')",start);
 assert.ok(start>=0&&end>start,'editions endpoint should exist before books search');
 const route=worker.slice(start,end);
 assert.match(route,/if\(env\.BOOK_DB\)/);
 assert.match(route,/\/api\/catalogue-public\/book\//);
 assert.match(route,/canonical\.editions\.map/);
 assert.match(route,/isbn13:e\.isbn13/);
 assert.match(route,/publisher:e\.publisher/);
 assert.match(route,/catalogueResponse\.status!==404/);
 assert.ok(route.indexOf('if(env.BOOK_DB)')<route.indexOf('FROM editions e WHERE e.work_id=?'),
  'canonical catalogue must be consulted before legacy edition fallback');
});
test('member add book displays canonical ebook format and edition ISBN',()=>{
 assert.match(bookshelf,/api\/editions\?workId=/);
 assert.match(bookshelf,/ISBN '\+e\.isbn13/);
 assert.match(bookshelf,/editionId:editionId\|\|undefined/);
});
