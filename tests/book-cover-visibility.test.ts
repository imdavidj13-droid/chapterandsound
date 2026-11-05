import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';

const memberApi=readFileSync(new URL('../src/worker/member-api.ts',import.meta.url),'utf8');
const memberUi=readFileSync(new URL('../src/site/MemberWorkspace.tsx',import.meta.url),'utf8');
const room=readFileSync(new URL('../src/site/themes/RoomBookView.tsx',import.meta.url),'utf8');
const roomShell=readFileSync(new URL('../src/site/themes/ThemeShell.tsx',import.meta.url),'utf8');
const publicApi=readFileSync(new URL('../src/worker/catalogue-public-api.ts',import.meta.url),'utf8');

test('Reading Room displays the canonical cover rather than a permanent placeholder',()=>{
 assert.match(room,/new Set\(\[book\.coverUrl,\.\.\.editions\.map\(e=>e\.coverUrl\)\]/);
 assert.match(room,/onError=\{\(\)=>setCoverIndex\(i=>i\+1\)\}/);
 assert.match(room,/<img src=\{/);
});
test('member shelf reads canonical cover and author by work ID',()=>{
 assert.match(memberApi,/if\(!env\.BOOK_DB\|\|results\.length===0\)/);
 assert.match(memberApi,/SELECT w\.id AS workId,/);
 assert.match(memberApi,/AS coverUrl,/);
 assert.match(memberApi,/AS author/);
 assert.match(memberApi,/coverUrl:byWork\.get\(item\.workId\)\?\.coverUrl/);
 assert.match(memberUi,/item\.coverUrl\?<img/);
 assert.match(memberUi,/item\.author&&/);
});
test('add-book edition selection focuses on artwork and format, not ISBN or publisher',()=>{
 const section=memberUi.slice(memberUi.indexOf('{step===2&&'),memberUi.indexOf('{step===3&&'));
 assert.match(section,/chosen\.coverUrl\?<img/);
 assert.match(section,/chosen\.author/);
 assert.match(section,/formatName\(e\.format\)/);
 assert.doesNotMatch(section,/e\.isbn13|e\.publisher/);
});
test('public catalogue uses linked first-edition image when book has no representative cover',()=>{
 assert.match(publicApi,/function workCover\(hasRepresentativeCovers=false\)/);
 assert.match(publicApi,/l\.role='front_cover'/);
 assert.match(publicApi,/l\.is_primary=1/);
});

test('Reading Room bookshelf uses live cover URLs instead of a hardcoded C&S placeholder',()=>{
 const start=roomShell.indexOf('export function RoomShelf(');
 assert.ok(start>=0);
 const component=roomShell.slice(start);
 assert.match(component,/coverUrl\?:string\|null/);
 assert.match(component,/book\.coverUrl\?<img/);
 assert.match(component,/alt=\{'Cover of '\+book\.bookTitle\}/);
 assert.match(component,/book\.author/);
 assert.doesNotMatch(component,/className="room-shelf-cover" aria-hidden="true">C/);
});

test('Reading Room uses a real cover-led magazine layout with live bookshelf records',()=>{
 const start=roomShell.indexOf('export function RoomShelf(');
 const component=roomShell.slice(start);
 assert.match(component,/room-shelf-magazine/);
 assert.match(component,/room-shelf-magazine-hero/);
 assert.match(component,/room-magazine-feature/);
 assert.match(component,/room-magazine-book-grid/);
 assert.match(component,/api\/member\/shelf/);
 assert.match(component,/api\/member\/reviews/);
 assert.match(component,/api\/member\/reading-year/);
 assert.match(component,/status==='all'\|\|x\.status===status/);
 assert.match(component,/book\.coverUrl\?<img/);
 assert.match(component,/book\.author/);
 assert.match(component,/section==='reviews'/);
});

test('shared header has a round member profile control on every public page',()=>{
 assert.match(roomShell,/function ProfileMenu/);
 assert.match(roomShell,/className="global-profile-avatar"/);
 assert.match(roomShell,/<ProfileMenu member=\{member\}\/>/);
 assert.match(roomShell,/className="global-profile-dropdown"/);
 assert.match(roomShell,/href="\/account"/);
});
