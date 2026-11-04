import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../src/worker/admin-api.ts',import.meta.url),'utf8');
const consoleSource=readFileSync(new URL('../src/site/AdminConsole.tsx',import.meta.url),'utf8');
const index=readFileSync(new URL('../src/worker/index.ts',import.meta.url),'utf8');

test('admin overview counts canonical books, editions and contributors in BOOK_DB',()=>{
 assert.match(api,/BOOK_DB\?:DB/);
 assert.match(api,/env\.BOOK_DB\.prepare/);
 assert.match(api,/COUNT\(\*\) FROM works WHERE status='draft'/);
 assert.match(api,/COUNT\(\*\) FROM works WHERE status IN \('published','verified'\)/);
 assert.match(api,/bookDrafts:canonical\?\.drafts/);
 assert.match(consoleSource,/Catalogue books/);
 assert.match(consoleSource,/Book drafts/);
 assert.match(consoleSource,/Canonical catalogue/);
});
test('public search prefers the canonical row over a member-compatibility row with the same ID',()=>{
 assert.match(index,/for\(const item of newBooks\.items\)\{\s*combined\.set\(item\.id,item as /);
 assert.doesNotMatch(index,/if\(!combined\.has\(item\.id\)\)combined\.set\(item\.id/);
});
