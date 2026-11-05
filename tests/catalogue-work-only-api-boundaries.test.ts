import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');
const work=readFileSync(new URL('../src/worker/catalogue-import-work-only.ts',import.meta.url),'utf8');
test('work-only endpoints run after existing owner, role, origin and BOOK_DB checks',()=>{
 const owner=api.indexOf('isVerifiedSiteOwner(session.user,env.ADMIN_EMAIL)');
 const role=api.indexOf("SELECT role FROM site_roles");
 const origin=api.indexOf("request.headers.get('Origin')!==url.origin");
 const binding=api.indexOf('const db=env.BOOK_DB');
 const route=api.indexOf("path==='import/work-only/preview'");
 assert.ok(owner>0&&role>owner&&origin>role&&binding>origin&&route>binding);
 assert.match(api,/CATALOGUE_WORK_ONLY_IMPORT_ENABLED!=='true'/);
 assert.match(api,/payload\.confirmed!==true/);
 assert.match(api,/previewWorkOnlyDraft\(db,payload\.candidate\)/);
 assert.match(api,/importWorkOnlyDraft\(db,payload\.candidate,session\.user\.id\)/);
});
test('work-only writes create only private works, source-linked authors and audit records',()=>{
 assert.match(work,/INSERT INTO works\(id,canonical_title,original_language,first_publication_date,status\) VALUES\(\?,\?,\?,\?,'draft'\)/);
 assert.match(work,/INSERT INTO contributions/);
 assert.match(work,/import_work_only_draft/);
 assert.doesNotMatch(work,/INSERT INTO editions|INSERT INTO media_links|INSERT INTO text_content/);
 assert.match(work,/await db\.batch\(statements\)/);
});
