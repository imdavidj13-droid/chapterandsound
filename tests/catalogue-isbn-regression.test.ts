import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validIsbn13,validIsbn10} from '../src/worker/catalogue-manual-api';

const admin=readFileSync(new URL('../src/worker/catalogue-admin-api.ts',import.meta.url),'utf8');

test('publisher-provided ISBN 9781407084350 is valid',()=>{
 assert.equal(validIsbn13('9781407084350'),true);
 assert.equal(validIsbn13('978-1-4070-8435-0'),true);
});
test('ISBN checks reject incorrect check digits and accept valid ISBN10',()=>{
 assert.equal(validIsbn13('9781407084351'),false);
 assert.equal(validIsbn13('9780306406157'),true);
 assert.equal(validIsbn10('0306406152'),true);
 assert.equal(validIsbn10('0306406153'),false);
});
test('canonical book creation uses the same vetted ISBN validation as manual catalogue editing',()=>{
 assert.match(admin,/import \{manualCatalogueAPI,validIsbn13,validIsbn10\}/);
 assert.match(admin,/schemeCode==='ISBN13'&&!validIsbn13\(raw\)/);
 assert.match(admin,/schemeCode==='ISBN10'&&!validIsbn10\(raw\)/);
 assert.doesNotMatch(admin,/\/\^\(978\|979\)\\\\d/);
});
