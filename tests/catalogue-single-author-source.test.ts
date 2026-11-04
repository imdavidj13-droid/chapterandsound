import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const api=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');
const manager=readFileSync(new URL('../src/site/CatalogueManualManager.tsx',import.meta.url),'utf8');

test('author suggestions come from the one canonical BOOK_DB catalogue only',()=>{
 const start=api.indexOf("if(path==='author-suggestions')");
 const end=api.indexOf("if(path==='legacy-people')",start);
 assert.ok(start>=0&&end>start);
 const route=api.slice(start,end);
 assert.match(route,/FROM people WHERE identity_status/);
 assert.doesNotMatch(route,/env\.DB|existing|legacy/);
});
test('author deletion is owner-protected and refuses linked contributor records',()=>{
 const start=api.indexOf("if(request.method==='DELETE'&&segments.length===2&&segments\[0\]==='people')".replace('\\[','[').replace('\\]',']'));
 assert.ok(start>=0,'owner-guarded DELETE people route exists');
 const route=api.slice(start,api.indexOf("if(path==='diagnostics'",start));
 assert.match(route,/FROM contributions WHERE person_id=/);
 assert.match(route,/FROM person_names WHERE person_id=/);
 assert.match(route,/FROM entity_identifiers/);
 assert.match(route,/FROM media_links/);
 assert.match(route,/return json\(\{error:.*relations\},409\)/);
 assert.match(route,/delete_unused_contributor/);
 assert.match(manager,/deleteUnusedContributor/);
 assert.match(manager,/window\.confirm\(/);
});
