import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
const views=readFileSync(new URL('../src/site/themes/DualThemeHomes.tsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/site/themes/ThemeShell.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/site/themes/dual-home.css',import.meta.url),'utf8');

test('homepage selects distinct Editorial and Reading Room components and removes legacy generic Home',()=>{
 assert.match(app,/path==='\/'\)body=theme==='reading-room'\?<ReadingRoomHome/);
 assert.match(app,/:<EditorialHome member=/);
 assert.doesNotMatch(app,/function Home\(\{data,member,presentation\}/);
 assert.doesNotMatch(shell,/export function RoomHome\(/);
});
test('new and returning Editorial layouts have separate approved spatial structure',()=>{
 assert.match(views,/export function EditorialHome/);
 assert.match(views,/editorial-new-hero/);
 assert.match(views,/editorial-start-card/);
 assert.match(views,/editorial-taste/);
 assert.match(views,/editorial-return-grid/);
 assert.match(views,/editorial-reading-panel/);
 assert.match(views,/editorial-year-card/);
});
test('Reading Room keeps sidebar shell and different dashboard hierarchy',()=>{
 assert.match(shell,/room-sidebar/);
 assert.match(views,/export function ReadingRoomHome/);
 assert.match(views,/room-new-hero/);
 assert.match(views,/room-metrics/);
 assert.match(views,/room-progress-panels/);
 assert.match(views,/room-discovery-books/);
 assert.match(css,/\.room-progress-panels\{display:grid/);
 assert.match(css,/@media\(max-width:520px\)/);
});
test('homes use live member shelf and published reviews, not mockup statistics or covers',()=>{
 assert.match(views,/api\/member\/shelf/);
 assert.match(views,/api\/member\/reviews/);
 assert.match(views,/r\.status==='published'&&r\.visibility==='public'/);
 assert.match(views,/books\.slice\(0,4\)/);
 assert.doesNotMatch(views,/Simon Kernick|Lisa Jewell|Follow You Home|The Night She Disappeared/);
 assert.doesNotMatch(views,/1,240|36h|8,320/);
 assert.match(views,/No active reads/);
 assert.match(views,/Cover not available/);
});
