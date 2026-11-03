import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/site/ConfirmEmailPage.tsx',import.meta.url),'utf8');

test('verified email success is persistent and never automatically redirects',()=>{
 assert.match(source,/setStatus\('success'\)/);
 assert.doesNotMatch(source,/window\.location\.(replace|assign)\(['"]\/onboarding['"]\)/);
 assert.match(source,/Your email address has been verified successfully/);
});
test('confirmation gives explicit account, onboarding and sign-in choices',()=>{
 assert.match(source,/Continue to my account/);
 assert.match(source,/Personalise my account/);
 assert.match(source,/Sign in instead/);
 assert.match(source,/onClick=\{\(\)=>window\.location\.assign\('\/account'\)\}/);
});
