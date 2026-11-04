import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const profile=readFileSync(new URL('../src/site/themes/ReadingRoomAuthorProfile.tsx',import.meta.url),'utf8');
const publicApi=readFileSync(new URL('../src/worker/catalogue-public-api.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/site/themes/themes.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/site/themes/ThemeShell.tsx',import.meta.url),'utf8');

test('Reading Room author profile uses a standalone editorial author layout',()=>{
 assert.match(profile,/room-author-banner/);
 assert.match(profile,/room-author-avatar/);
 assert.match(profile,/room-author-books/);
 assert.match(profile,/room-author-book-art/);
 assert.match(profile,/room-author-aside/);
 assert.match(styles,/room-author-books\{display:grid/);
});
test('author profiles render only canonical cover and publication data, not illustrative sample titles',()=>{
 assert.match(publicApi,/SELECT w\.id,w\.canonical_title AS title,'author' AS contribution,/);
 assert.match(publicApi,/\$\{workCover\(\)\} AS coverUrl/);
 assert.match(publicApi,/\$\{synopsis\(\)\} AS summary/);
 assert.match(publicApi,/w\.status IN \('published','verified'\)/);
 assert.match(profile,/book\.coverUrl&&!failed/);
 assert.doesNotMatch(profile,/Then She Was Gone|Lisa Jewell|4\.5\/5|Gabrielle Glaister/);
});
test('on my shelf only uses actual member bookshelf records',()=>{
 assert.match(profile,/if\(!memberVerified\)/);
 assert.match(profile,/api\/member\/shelf/);
 assert.match(profile,/new Set\(data\.items\.map\(item=>item\.workId\)\)/);
 assert.match(profile,/memberVerified&&<button/);
 assert.match(profile,/books\.filter\(book=>shelf\.has\(book\.id\)\)/);
});
test('author profile is only replaced for the Reading Room theme',()=>{
 assert.match(app,/theme==='reading-room'&&path\.startsWith\('\/person\/'\)/);
 assert.match(app,/<ReadingRoomAuthorProfile id=/);
 assert.match(app,/<PeopleAndSeries path=\{path\}\/>/);
});

test('book cards show real review ratings, excerpts, editions and compact covers',()=>{
 assert.match(profile,/api\/book\//);
 assert.match(profile,/data\.ratings\.story\.count/);
 assert.match(profile,/review\?\.count/);
 assert.match(profile,/No community reviews yet/);
 assert.match(profile,/review\?\.body/);
 assert.match(profile,/book\.summary\?snippet/);
 assert.match(profile,/formats\.map\(formatLabel\)/);
 assert.match(styles,/room-author-books\{display:grid;grid-template-columns:repeat\(auto-fill/);
 assert.match(styles,/max-width:205px/);
});
test('similar authors are derived only from shared published book subjects',()=>{
 assert.match(profile,/Similar Authors/);
 assert.match(profile,/similarAuthors/);
 assert.match(publicApi,/JOIN work_subjects common ON common\.work_id=other\.id/);
 assert.match(publicApi,/COUNT\(DISTINCT common\.subject_id\) AS sharedSubjects/);
 assert.match(profile,/No similar authors can be verified/);
});
test('reading room author sidebar displays own notes and verified book-format counts',()=>{
 assert.match(profile,/room-author-notes-card/);
 assert.match(profile,/privateNote/);
 assert.match(profile,/room-author-collection-card/);
 assert.match(profile,/allFormats\.map\(formatLabel\)/);
 assert.doesNotMatch(profile,/Narrator Spotlight|Gabrielle Glaister/);
});
test('both website appearances have one real searchable header on every route',()=>{
 assert.match(shell,/function GlobalBookSearch/);
 assert.match(shell,/action="\/search" method="get" role="search"/);
 assert.match(shell,/<SiteBrand\/><GlobalBookSearch\/>/);
 assert.match(shell,/<GlobalBookSearch compact\/>/);
 assert.match(shell,/name="q"/);
});

test('mockup tabs include shelf, about, interviews and evidence-based similar authors',()=>{
 assert.match(profile,/On My Shelf/);
 assert.match(profile,/Interviews with/);
 assert.match(profile,/Similar Authors/);
 assert.match(profile,/memberVerified\?'shelf':'books'/);
 assert.match(profile,/profile\.subjects\?\.slice\(0,2\)/);
 assert.match(publicApi,/JOIN work_subjects ws ON ws\.subject_id=s\.id/);
 assert.match(publicApi,/subjects:subjects\.map\(s=>s\.label\)/);
});
