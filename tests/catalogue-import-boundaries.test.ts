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
 assert.match(admin,/isbn13:isbns\.length===1\?isbns\[0\]:''/);
 assert.match(admin,/lookupOnly:true/);
 assert.match(ui,/Find candidates/);
 assert.match(ui,/Preview batch/);
 assert.match(ui,/No database writes were performed/);
 assert.match(workbench,/<CatalogueImportCentre\/>/);
});
