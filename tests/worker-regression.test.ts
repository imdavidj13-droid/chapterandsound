import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('people search SQL binding is not overwritten by route code',()=>{
  const code=readFileSync(new URL('../src/worker/index.ts',import.meta.url),'utf8');
  const line=code.split('\n').find(x=>x.includes(".bind('%'+q.replace("));
  assert.ok(line,'People-search query should bind a sanitized search string');
  assert.equal(line.includes("if(url.pathname"),false);
  assert.equal((line.match(/\.bind\(/g)??[]).length,1);
  assert.ok(line.includes('role,role,role,limit).all()'));
});
test('website routes remain registered',()=>{
  const code=readFileSync(new URL('../src/site/App.tsx',import.meta.url),'utf8');
  for(const route of ['/books','/reviews','/add-book','/my-reviews','/community']){
    assert.ok(code.includes(route),route+' is missing');
  }
});
