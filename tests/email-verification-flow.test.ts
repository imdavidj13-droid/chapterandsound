import test from 'node:test';
import assert from 'node:assert/strict';
import {isVerificationDocumentNavigation,verifyEmailDocument,verificationResultPage} from '../src/worker/email-verification-flow.js';

test('email link navigation verifies token server side and redirects to safe result while keeping session cookie',async()=>{
 const request=new Request('https://chapterandsound.example/api/auth/verify-email?token=private-test-token&callbackURL=%2Funknown',{headers:{Accept:'text/html,application/xhtml+xml'}});
 assert.equal(isVerificationDocumentNavigation(request),true);
 let checked=false;
 const response=await verifyEmailDocument(request,async internal=>{
   checked=true;
   const u=new URL(internal.url);
   assert.equal(u.pathname,'/api/auth/verify-email');
   assert.equal(u.searchParams.get('token'),'private-test-token');
   assert.equal(u.searchParams.has('callbackURL'),false);
   assert.equal(internal.headers.get('Accept'),'application/json');
   return new Response(JSON.stringify({status:true}),{status:200,headers:{'Set-Cookie':'chapterandsound.session_token=test; Path=/; HttpOnly; Secure; SameSite=Lax','Content-Type':'application/json'}});
 });
 assert.equal(checked,true);
 assert.equal(response.status,303);
 assert.equal(response.headers.get('Location'),'/api/auth/verification-result?status=verified');
 assert.equal(response.headers.get('Set-Cookie')?.includes('chapterandsound.session_token=test'),true);
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(response.headers.get('Location')?.includes('private-test-token'),false);
});
test('invalid or expired email tokens redirect to safe retry page',async()=>{
 const request=new Request('https://chapterandsound.example/api/auth/verify-email?token=expired',{headers:{Accept:'text/html'}});
 const response=await verifyEmailDocument(request,async()=>Response.json({status:false},{status:401}));
 assert.equal(response.status,303);
 assert.equal(response.headers.get('Location'),'/api/auth/verification-result?status=invalid');
 const html=await verificationResultPage(new Request('https://chapterandsound.example/api/auth/verification-result?status=invalid'),false).text();
 assert.match(html,/Request another email/);
 assert.equal(html.includes('expired'),true); // generic expired-link description, never token value
});
test('API clients continue to use Better Auth JSON directly',()=>{
 const request=new Request('https://chapterandsound.example/api/auth/verify-email?token=x',{headers:{Accept:'application/json'}});
 assert.equal(isVerificationDocumentNavigation(request),false);
 const result=verificationResultPage(new Request('https://chapterandsound.example/api/auth/verification-result?status=verified'),true);
 assert.equal(result.headers.get('Content-Type'),'text/html; charset=utf-8');
 assert.match(result.headers.get('Content-Security-Policy')??'',/frame-ancestors 'none'/);
});

test('a forged verified result URL cannot claim success without a verified session',async()=>{
 const res=verificationResultPage(new Request('https://chapterandsound.example/api/auth/verification-result?status=verified'),false);
 const body=await res.text();
 assert.match(body,/Verification link unavailable/);
 assert.doesNotMatch(body,/Email verified\./);
});
