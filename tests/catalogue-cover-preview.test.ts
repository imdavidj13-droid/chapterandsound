import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/site/CatalogueCoverEditor.tsx',import.meta.url),'utf8');

test('main-cover chooser reports the saved selected candidate to its parent',()=>{
 assert.match(ui,/onCurrentChange:\(candidate:RepresentativeCandidate\|null\)=>void/);
 assert.match(ui,/next\.candidates\.find\(x=>x\.workKey===next\.current\?\.workKey&&x\.coverId===next\.current\?\.coverId\)/);
 assert.match(ui,/onCurrentChange\(selected\)/);
 assert.match(ui,/onCurrentChange\(item\);await load\(\)/);
 assert.match(ui,/<RepresentativeCoverChooser workId=\{workId\} onCurrentChange=\{onRepresentativeChange\}\/>/);
});
test('preview uses selected representative for work and prioritises pending upload',()=>{
 const panel=ui.slice(ui.indexOf('<aside className="cs-book-cover-preview-panel">'));
 assert.match(panel,/\{preview\?/);
 assert.match(panel,/kind==='work'&&coverChoice==='representative'&&selectedRepresentative/);
 assert.match(panel,/selectedRepresentative\.url/);
 assert.match(panel,/kind==='work'&&selectedRepresentative\?/);
 assert.match(ui,/setCoverChoice\('upload'\)/);
 assert.match(ui,/URL\.createObjectURL\(file\)/);
 assert.match(ui,/URL\.revokeObjectURL\(url\)/);
});
test('representative cover never replaces edition-specific preview',()=>{
 const panel=ui.slice(ui.indexOf('<aside className="cs-book-cover-preview-panel">'));
 assert.match(panel,/kind==='work'&&selectedRepresentative/);
 assert.match(panel,/displayedCover&&!imageFailed/);
 assert.match(panel,/sourceCover&&!sourceImageFailed/);
});
