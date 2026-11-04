import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const profile=readFileSync(new URL('../src/site/themes/ReadingRoomAuthorProfile.tsx',import.meta.url),'utf8');
const publicApi=readFileSync(new URL('../src/worker/catalogue-public-api.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/site/themes/themes.css',import.meta.url),'utf8');

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
