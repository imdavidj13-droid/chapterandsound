import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationLandingURL} from '../src/worker/auth.js';

test('verification emails open the working site root, not a browser navigation to an API URL',()=>{
 const actual=verificationLandingURL(
   'https://chapterandsound.imdavidj13.workers.dev',
   'https://chapterandsound.imdavidj13.workers.dev/api/auth/verify-email?token=example.secret%3D&callbackURL=%2Fonboarding'
 );
 const u=new URL(actual);
 assert.equal(u.pathname,'/');
 assert.equal(u.search,'');
 assert.equal(u.hash,'#verify-email=example.secret%3D');
 assert.equal(new URLSearchParams(u.hash.slice(1)).get('verify-email'),'example.secret=');
 assert.equal(u.href.includes('/api/auth/verify-email'),false);
});
test('fragment handoff does not double-append the slash and refuses missing tokens',()=>{
 assert.equal(verificationLandingURL('https://example.org/','https://example.org/api/auth/verify-email?token=abc'),'https://example.org/#verify-email=abc');
 assert.throws(()=>verificationLandingURL('https://example.org','https://example.org/api/auth/verify-email'),/token missing/);
});
