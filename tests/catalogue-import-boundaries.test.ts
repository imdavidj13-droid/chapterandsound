import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const admin=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');
const workbench=readFileSync(new URL('../src/site/CatalogueWorkbench.tsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/site/CatalogueImportCentre.tsx',import.meta.url),'utf8');
const preview=readFileSync(new URL('../src/worker/catalogue-import-preview.ts',import.meta.url),'utf8');

test('catalogue import endpoint is protected behind existing verified owner and role checks',()=>{
 const ownerIndex=admin.indexOf('isVerifiedSiteOwner(');
 const roleIndex=admin.indexOf("SELECT role FROM site_roles");
 const previewIndex=admin.indexOf("path==='import/preview'");
 const lookupIndex=admin.indexOf("path==='import/discover'");
 assert.ok(ownerIndex>=0&&roleIndex>ownerIndex&&previewIndex>roleIndex&&lookupIndex>roleIndex);
 assert.match(admin,/request\.method!=='GET'&&request\.headers\.get\('Origin'\)!==url\.origin/);
});
test('preview never writes to production and does not call an import endpoint',()=>{
 assert.doesNotMatch(preview,/\.run\(|\.batch\(|INSERT INTO |UPDATE |DELETE FROM /);
 assert.match(preview,/validIsbn13\(isbn13\)/);
 assert.match(preview,/validIsbn10\(isbn10\)/);
 assert.match(preview,/FROM entity_identifiers ei/);
 assert.match(preview,/FROM works w JOIN contributions c/);
 assert.match(preview,/seen\.has\(signature\)/);
 assert.match(admin,/previewCatalogueImport\(db,record\?\.candidates\)/);
});
test('owner lookup is limited, explicit, and does not assign an arbitrary ISBN to a work',()=>{
 assert.match(admin,/upstream\.searchParams\.set\('limit','10'\)/);
 assert.match(admin,/new URL\('https:\/\/openlibrary\.org\/search\.json'\)/);
 assert.match(admin,/isbn13:'',format:''/);
 assert.match(admin,/workSourceKey:key/);
 assert.match(admin,/lookupOnly:true/);
 // The old manifest UI is replaced, but the legacy internal routes remain read-only.
 assert.match(ui,/Book title, author or ISBN/);
 assert.match(ui,/Review edition/);
 assert.match(ui,/setSelected\(detail\)/);
 assert.match(ui,/simple-import\/search/);
 assert.match(ui,/simple-import\/detail/);
 assert.match(ui,/simple-import\/add/);
 assert.doesNotMatch(ui,/Paste a JSON manifest/);
 assert.match(workbench,/<CatalogueImportCentre\/>/);
});

test('import centre is a dedicated direct URL, not hidden in advanced metadata tools',()=>{
 assert.match(workbench,/path==='\/admin\/catalogue\/import'/);
 assert.match(workbench,/navigate\(catalogueUrl\('import'\)\)/);
 assert.match(workbench,/view==='import'&&<CatalogueImportCentre\/>/);
});

test('manual work enrichment fetches limited editions but never writes or treats partial sets as complete',()=>{
 const start=admin.indexOf("if(path==='import/enrich'");
 const end=admin.indexOf("if(path==='import/preview'",start);
 assert.ok(start>0&&end>start);
 const route=admin.slice(start,end);
 assert.match(route,/workKey\+'\/editions\.json\?limit=50'/);
 assert.match(route,/editionCountReported:list\.size\?\?editions\.length/);
 assert.match(route,/readOnly:true/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE |DELETE FROM |\.run\(/);
 assert.match(ui,/simple-import\/detail/);
 assert.match(ui,/Review edition/);
 assert.match(ui,/setSelected\(detail\)/);
});

test('search results use responsive two-column layout without modifying import behaviour',()=>{
 const css=readFileSync(new URL('../src/site/site.css',import.meta.url),'utf8');
 assert.match(ui,/className="cs-simple-import-grid"/);
 assert.match(css,/\.cs-simple-import-grid\s*\{/);
 assert.match(css,/@media\(min-width:1050px\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(ui,/setSelected\(detail\)/);
});

test('collapsed importer cards use equal-height rows and concise metadata',()=>{
 const css=readFileSync(new URL('../src/site/site.css',import.meta.url),'utf8');
 assert.match(css,/\.cs-simple-import-grid\s*\{[^}]*align-items:stretch/s);
 assert.match(css,/\.cs-simple-import-grid \.cs-simple-import-result\s*\{[^}]*min-height:168px/s);
 assert.match(css,/\.cs-simple-import-grid details\s*\{[^}]*margin-top:auto/s);
 assert.doesNotMatch(ui,/Edition grouping is provisional; catalogue identities are not merged\./);
 assert.match(ui,/className="cs-simple-import-grid"/);
});
