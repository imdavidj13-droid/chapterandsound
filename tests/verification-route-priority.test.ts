import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('email verification branch is exclusive and cannot be overwritten by homepage rendering',()=>{
 const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
 assert.match(app,/if\(verifyFromEmail\)body=<ConfirmEmailPage\/>;\s*else if\(path==='\/'\)/);
 assert.doesNotMatch(app,/if\(verifyFromEmail\)body=<ConfirmEmailPage\/>;\s*if\(path==='\/'\)/);
});
test('homepage fragment is detected before normal routing and handed to confirmation',()=>{
 const app=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
 assert.match(app,/window\.location\.hash/);
 assert.match(app,/has\('verify-email'\)/);
 const emailPage=readFileSync(new URL('../src/site/ConfirmEmailPage.tsx',import.meta.url),'utf8');
 assert.match(emailPage,/fragment\.get\('verify-email'\)/);
 assert.match(emailPage,/fetch\(url,\{method:'GET'/);
});
