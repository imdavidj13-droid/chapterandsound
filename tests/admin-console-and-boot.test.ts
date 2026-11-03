import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker/admin-api.ts',import.meta.url),'utf8');

test('website refresh waits for session and theme before painting themed or signed-out views',()=>{
 assert.match(app,/const \[bootReady,setBootReady\]=useState\(false\)/);
 assert.match(app,/fetch\('\/api\/me'/);
 assert.match(app,/await apiGet<\{themeId:ThemeId\}>\('\/api\/member\/theme'\)/);
 assert.match(app,/if\(!bootReady&&!verifyFromEmail\)return/);
 assert.doesNotMatch(app,/const \[themeReady,setThemeReady\]/);
});
test('verification token is not delayed by session/theme loading gate',()=>{
 assert.match(app,/if\(verifyFromEmail\)body=<ConfirmEmailPage\/>/);
 assert.match(app,/if\(!bootReady&&!verifyFromEmail\)/);
});
test('admin shell is independent and only mounted for a verified role',()=>{
 assert.match(app,/path==='\/admin'&&member\?\.verified&&member\.role==='admin'/);
 assert.match(app,/<AdminConsole\/>/);
});
test('administrative API refuses unverified or mismatched owner and checks persisted role',()=>{
 assert.match(worker,/if\(!session\?\.user\.emailVerified\)return fail/);
 assert.match(worker,/isVerifiedSiteOwner\(session\.user,env\.ADMIN_EMAIL\)/);
 assert.match(worker,/SELECT role FROM site_roles WHERE member_id=\? AND role='admin'/);
 assert.match(worker,/if\(!assigned\)return fail/);
 assert.match(worker,/request\.headers\.get\('Origin'\)!==url\.origin/);
});
