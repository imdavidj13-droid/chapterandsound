import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error JavaScript runtime module.
import {classifyPage,inspectCache} from '../scripts/diagnose-isbnsearch-cache.mjs';
const isbn='9781476789583';
test('identifies record structure and non-record pages',()=>{
 assert.equal(classifyPage('<title>Stay Alive</title><div class="bookinfo">ISBN-13: '+isbn+'</div>',isbn).pageKind,'isbn_record');
 assert.equal(classifyPage('<title>ISBN Search</title><form>Search</form>',isbn).pageKind,'non_record_page');
 assert.equal(classifyPage('<title>Just a moment</title>',isbn).pageKind,'access_challenge');
 assert.equal(classifyPage('<input value="'+isbn+'">',isbn).pageKind,'isbn_mentioned_no_structured_fields');
});
test('reports missing cached edition without fetching pages',()=>{
 const input={candidates:[{editions:[{isbn13:isbn,format:'unknown'}]}]};
 const r=inspectCache(input,'/absent-directory-for-test');
 assert.equal(r.cachedCount,0);
 assert.equal(r.statusCounts.not_cached,1);
});
