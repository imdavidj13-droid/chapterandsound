import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url).pathname;
function collect(dir){
 return readdirSync(dir).flatMap(name=>{
  const full=join(dir,name);
  return statSync(full).isDirectory()?collect(full):/\.(tsx?|jsx?)$/.test(name)?[full]:[];
 });
}
const paths=[...collect(join(root,'src','site')),...collect(join(root,'src','worker'))];
let checked=0;
for(const path of paths){
 const text=readFileSync(path,'utf8');
 const display=relative(root,path);
 // All durable account, book, review, preference and community records must be
 // persisted through the Cloudflare Worker, never in browser storage.
 for(const forbidden of [/\blocalStorage\b/,/\bsessionStorage\b/,/\bindexedDB\b/,/\bIDBDatabase\b/]){
  assert.doesNotMatch(text,forbidden,display+' uses browser persistence');
 }
 if(display.startsWith('src/site/')){
  assert.doesNotMatch(text,/\b(?:window\.)?fetch\(\s*['"]https?:\/\//,display+' fetches a foreign data store directly');
 }
 checked++;
}
function source(path){return readFileSync(join(root,path),'utf8')}
const worker=source('src/worker/index.ts');
const member=source('src/worker/member-api.ts');
const community=source('src/worker/community-api.ts');
const admin=source('src/worker/admin-api.ts');
const app=source('src/site/App.tsx');
const wrangler=source('wrangler.jsonc');
for(const route of ['/api/me','/api/books','/api/reviews','/api/site-presentation']){
 assert.ok(worker.includes(route),'Missing canonical Worker route '+route);
}
for(const route of ['/api/member/theme','/api/member/preferences','/api/member/favourites','/api/member/shelf','/api/member/reviews','/api/member/reading-year','/api/member/missing-book-requests']){
 assert.ok(member.includes(route),'Missing member-owned D1 endpoint '+route);
}
for(const route of ['/api/discussions','/api/recommendations','/api/clubs','/api/challenges','/api/lists']){
 assert.ok(community.includes(route),'Missing community route '+route);
}
assert.match(admin,/isVerifiedSiteOwner\(session\.user,env\.ADMIN_EMAIL\)/,'Admin must verify owner email');
assert.match(admin,/site_roles WHERE member_id=/,'Admin must verify persisted admin role');
assert.ok(admin.includes('admin_audit_log'),'Admin audit data must use D1');
assert.ok(app.includes("'/api/member/theme'"),'User theme must be loaded from D1');
const config=JSON.parse(wrangler);
assert.ok(config.d1_databases?.some(x=>x.binding==='DB'&&x.database_name==='chapterandsound-db'&&/^[0-9a-f-]{36}$/.test(x.database_id)),'Cloudflare D1 binding missing');
assert.ok(config.assets?.run_worker_first?.includes('/api/*'),'API paths must reach Worker before SPA fallback');
assert.ok(paths.length>=20,'Expected to audit the complete client and Worker source tree');
console.log('PASS: '+checked+' website/Worker files checked for browser persistence; authenticated cloud routes, D1 binding and Worker API routing intact.');
