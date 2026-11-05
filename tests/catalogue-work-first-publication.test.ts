import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const pub=readFileSync(new URL('../src/worker/catalogue-public-api.ts',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/site/CatalogueWorkbench.tsx',import.meta.url),'utf8');
const meta=readFileSync(new URL('../src/worker/catalogue-book-metadata-api.ts',import.meta.url),'utf8');
test('public detail only returns public editions, not all editions on a published work',()=>{
 assert.match(pub,/FROM editions e WHERE e\.work_id=\? AND e\.publication_status='published' ORDER BY e\.created_at/);
 assert.match(pub,/e\.publication_status='published' AND e\.format=\?/);
 assert.match(pub,/e\.publication_status='published'\) AS editions/);
});
test('publication requires explicit owner review and exact valid ISBN for all editions',()=>{
 assert.match(admin,/body\.publishReviewedEditions!==true/);
 assert.match(admin,/validIsbn13\(e\.isbn13\)/);
 assert.match(admin,/eligible\.length!==editionRows\.length/);
 assert.match(admin,/editionIdsToPublish\.map\(id=>/);
 assert.match(admin,/reviewedEditionIds:editionIdsToPublish/);
 assert.match(ui,/publishReviewedEditions:target==='published'/);
});
test('public audit can distinguish public editions from saved private drafts',()=>{
 assert.match(meta,/publication_status AS publicationStatus/);
});
