import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const consoleSource=readFileSync(new URL('../src/site/AdminConsole.tsx',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');

test('admin sections use canonical deep links rather than keeping /admin unchanged',()=>{
 assert.match(consoleSource,/const adminPath=\(tab:Tab\)=>tab==='overview'\?'\/admin':'\/admin\/'\+tab/);
 assert.match(consoleSource,/href=\{adminPath\(x\.id\)\}/);
 assert.match(consoleSource,/const tab=adminTab\(path\)/);
 assert.doesNotMatch(consoleSource,/useState<Tab>\('overview'\)/);
});
test('all admin deep links mount the authenticated admin shell',()=>{
 assert.match(appSource,/path\.startsWith\('\/admin\/'\)/);
 assert.match(appSource,/<AdminConsole path=\{path\} navigate=\{navigate\}\s*\/>/);
 assert.match(appSource,/window\.addEventListener\('popstate',change\)/);
});
