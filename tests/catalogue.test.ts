import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMatch,normalizeName,sameVerifiedEdition,titleSimilarity} from '../src/catalogue/matching.js';

test('normalisation handles case, punctuation and diacritics',()=>{
  assert.equal(normalizeName('  Émile, AND  the BOOK! '),'emile and the book');
});
test('exact matching author and title stays a candidate, not automatic merge',()=>{
  const result=assessMatch('Then She Was Gone','Lisa Jewell',{
    provider:'openlibrary',sourceId:'OL1W',title:'Then She Was Gone',
    authors:[{name:'Lisa Jewell',role:'author'}],editions:[],
    attribution:{provider:'openlibrary',sourceId:'OL1W',retrievedAt:'2026-11-03T00:00:00Z'}
  });
  assert.equal(result.decision,'strong_candidate');
  assert.equal(result.score,100);
});
test('different author prevents confident book identity',()=>{
  const result=assessMatch('The Witness','Simon Kernick',{
    provider:'openlibrary',sourceId:'OL2W',title:'The Witness',
    authors:[{name:'Someone Else',role:'author'}],editions:[],
    attribution:{provider:'openlibrary',sourceId:'OL2W',retrievedAt:'2026-11-03T00:00:00Z'}
  });
  assert.notEqual(result.decision,'strong_candidate');
});
test('editions only deterministically join via verified shared identifiers',()=>{
  assert.equal(sameVerifiedEdition({isbn13:'9780000000001'},{isbn13:'9780000000001'}),true);
  assert.equal(sameVerifiedEdition({isbn13:'9780000000001'},{isbn13:'9780000000002'}),false);
  assert.equal(sameVerifiedEdition({},{}),false);
});
test('blank titles never match',()=>assert.equal(titleSimilarity('','Book'),0));
