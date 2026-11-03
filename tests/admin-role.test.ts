import test from 'node:test';
import assert from 'node:assert/strict';
import {isVerifiedSiteOwner,normalizeEmail,syncSiteRole} from '../src/worker/admin-role.js';

test('administrator email comparison is normalised but requires verification',()=>{
 assert.equal(normalizeEmail('  IMDavidJ13@GMAIL.com '),'imdavidj13@gmail.com');
 assert.equal(isVerifiedSiteOwner({email:'imdavidj13@gmail.com',emailVerified:false},'imdavidj13@gmail.com'),false);
 assert.equal(isVerifiedSiteOwner({email:'imdavidj13@gmail.com',emailVerified:true},'imdavidj13@gmail.com'),true);
 assert.equal(isVerifiedSiteOwner({email:'other@gmail.com',emailVerified:true},'imdavidj13@gmail.com'),false);
 assert.equal(isVerifiedSiteOwner({email:'imdavidj13@gmail.com',emailVerified:true},undefined),false);
});
test('verified site-owner bootstrap writes only a server-issued administrator role',async()=>{
 const writes:Array<{sql:string;values:(string|number|null)[]}>=[];let statement='';
 const db={prepare(sql:string){
  statement=sql;return{
   bind(...values:(string|number|null)[]){writes.push({sql:statement,values});return this},
   async first<T>():Promise<T|null>{return null},
   async run(){return {}}
  };
 }};
 const role=await syncSiteRole(db,{id:'verified-owner',email:'imdavidj13@gmail.com',emailVerified:true},'imdavidj13@gmail.com');
 assert.equal(role,'admin');assert.equal(writes.length,1);
 assert.ok(writes[0]!.sql.includes("VALUES(?,'admin','verified_email_bootstrap')"));
 assert.deepEqual(writes[0]!.values,['verified-owner']);
});
test('non-owner cannot receive bootstrap role',async()=>{
 const writes:string[]=[];
 const db={prepare(sql:string){
  writes.push(sql);return{bind(){return this},async first<T>():Promise<T|null>{return null},async run(){return {}}};
 }};
 const role=await syncSiteRole(db,{id:'another-user',email:'other@example.com',emailVerified:true},'imdavidj13@gmail.com');
 assert.equal(role,null);
 assert.ok(writes.every(x=>!x.includes("VALUES(?,'admin'")));
});
