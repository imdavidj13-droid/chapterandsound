import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';

test('Book Catalogue automatically initiates its read-only initial API load',()=>{
 const source=readFileSync(new URL('../src/site/CatalogueWorkbench.tsx',import.meta.url),'utf8');
 assert.match(source,/useEffect\(\(\)=>\{void load\(\)\},\[load\]\)/,
  'CatalogueWorkbench must call load() on mount or it remains stuck on the database-check screen');
 assert.doesNotMatch(source,/useEffect\(\(\)=>\{[\s\S]*?apiWrite[^\n]*consolidate-people/,
  'Automatic contributor reconciliation must not run when the page mounts');
});
