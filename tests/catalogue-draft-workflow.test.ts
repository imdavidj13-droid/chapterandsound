import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';

const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/site/AdminConsole.tsx',import.meta.url),'utf8');
const workbench=readFileSync(new URL('../src/site/CatalogueWorkbench.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');

test('saved book workflow has direct routes for drafts, published, creation and editing',()=>{
 assert.match(workbench,/\/admin\/catalogue\/drafts/);
 assert.match(workbench,/\/admin\/catalogue\/published/);
 assert.match(workbench,/\/admin\/catalogue\/new/);
 assert.match(workbench,/\/admin\/catalogue\/book\//);
 assert.match(workbench,/Continue editing/);
 assert.match(workbench,/navigate\('\/admin\/catalogue\/book\/'\+encodeURIComponent\(bookId\)\)/);
});
test('nested catalogue URLs are routed through the authenticated admin shell',()=>{
 assert.match(admin,/path\.slice\('\/admin\/'.length\)\.split\('\/'\)\[0\]/);
 assert.match(admin,/<CatalogueWorkbench path=\{path\} navigate=\{navigate\}\/>/);
 assert.match(app,/path\.startsWith\('\/admin\/'\)/);
});
test('server filters drafts and published books from canonical BOOK_DB',()=>{
 assert.match(api,/if\(status&&!\['draft','published'\]\.includes\(status\)\)/);
 assert.match(api,/AND \(\?='' OR w\.status=\?\)/);
 assert.match(api,/\.bind\(q,q,status,status,l,o\)/);
});
test('saved book editor supports publication audit and never auto-publishes a new book',()=>{
 assert.match(workbench,/<CataloguePublicationAudit/);
 assert.match(api,/status:'draft'/);
 assert.match(api,/INSERT INTO works\(id,canonical_title,work_type,original_language,first_publication_date,status\)/);
 assert.match(workbench,/setPublicationConfirmation\('published'\)/);
});

test('publishing and returning drafts use the themed accessible confirmation instead of native browser dialogs',()=>{
 const publicationHandler=workbench.slice(workbench.indexOf('async function changePublication'),workbench.indexOf('async function uploadMedia'));
 assert.doesNotMatch(publicationHandler,/window\.confirm\(/);
 assert.match(workbench,/role="alertdialog"/);
 assert.match(workbench,/aria-modal="true"/);
 assert.match(workbench,/setPublicationConfirmation\('published'\)/);
 assert.match(workbench,/setPublicationConfirmation\('draft'\)/);
 assert.match(workbench,/onClick=\{\(\)=>void changePublication\(publicationConfirmation\)\}/);
});
