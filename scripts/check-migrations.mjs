import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const dir=new URL('../migrations/',import.meta.url);
const filenames=readdirSync(dir).filter(f=>/^\d{4}_[\w-]+\.sql$/.test(f)).sort();
assert.ok(filenames.length>=7,'Expected auth + application migrations');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
try{
 for(const filename of filenames){
  const sql=readFileSync(new URL(filename,dir),'utf8');
  try{db.exec(sql)}
  catch(error){throw Error('Migration '+filename+' failed: '+String(error))}
 }
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
 const usernameColumns=db.prepare('PRAGMA table_info("user")').all().map(x=>x.name);
 assert.ok(usernameColumns.includes('username'),'Better Auth username field missing');
 const usernameIndexes=db.prepare("PRAGMA index_list('user')").all();
 assert.ok(usernameIndexes.some(x=>x.name==='idx_auth_user_username'),'Case-insensitive username uniqueness index missing');
 for(const table of ['user','session','account','verification','members','works','editions','people','reading_experiences','reviews','site_roles','member_theme_preferences','admin_audit_log','admin_site_notices']){
  assert.ok(tables.includes(table),'Missing expected table '+table);
 }
 const actionsColumns=db.prepare('PRAGMA table_info(moderation_actions)').all().map(x=>x.name);
 assert.ok(actionsColumns.includes('actor_id'),'Moderation audit table must include actor_id; got '+actionsColumns.join(','));
 const mistakes=db.prepare('PRAGMA foreign_key_check').all();
 assert.equal(mistakes.length,0,'Foreign key violations following migrations');
 const user='fixture-auth-user',member='fixture-member';
 const now=Date.now();
 db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
  .run(user,'Fixture Reader','test@example.invalid',1,now,now);
 db.prepare('INSERT INTO members(id,email_normalized,display_name,email_verified_at) VALUES(?,?,?,?)')
  .run(member,'fixture@example.invalid','Fixture Reader',new Date().toISOString());
 db.prepare('INSERT INTO member_theme_preferences(member_id,theme_id) VALUES(?,?)').run(member,'reading-room');
 assert.equal(db.prepare('SELECT theme_id FROM member_theme_preferences WHERE member_id=?').get(member).theme_id,'reading-room');
 assert.throws(()=>db.prepare("INSERT INTO member_theme_preferences(member_id,theme_id) VALUES(?,?)").run('unknown-member','editorial'));
 assert.throws(()=>db.prepare("UPDATE member_theme_preferences SET theme_id='invented-theme' WHERE member_id=?").run(member));
 db.prepare("INSERT INTO site_roles(member_id,role,granted_by) VALUES(?,?,'test')").run(member,'admin');
 assert.equal(db.prepare('SELECT role FROM site_roles WHERE member_id=?').get(member).role,'admin');
 // Disposable cloud-schema integration fixtures; never added to production D1.
 db.prepare('INSERT INTO works(id,title) VALUES(?,?)').run('test-work','A Real Test Book');
 db.prepare('INSERT INTO people(id,display_name) VALUES(?,?)').run('test-author','Test Author');
 db.prepare("INSERT INTO work_contributors(work_id,person_id,role) VALUES(?,?,'author')").run('test-work','test-author');
 db.prepare("INSERT INTO editions(id,work_id,format,isbn13) VALUES(?,?,'audiobook',?)")
   .run('test-audio','test-work','9780123456789');
 db.prepare("INSERT INTO reading_experiences(id,member_id,work_id,edition_id,status) VALUES(?,?,?,?,'in_progress')")
   .run('test-reading',member,'test-work','test-audio');
 db.prepare("INSERT INTO reviews(id,member_id,book_id,edition_id,title,body,status,visibility,published_at) VALUES(?,?,?,?,?,?,'published','public',CURRENT_TIMESTAMP)")
   .run('test-review',member,'test-work','test-audio','Test opinion','A published test review');
 db.prepare("INSERT INTO missing_book_requests(id,member_id,requested_title,state) VALUES(?,?,?,'pending')")
   .run('test-request',member,'A Missing Book');
 db.prepare("INSERT INTO admin_site_notices(id,title,body,updated_by) VALUES(?,?,?,?)")
   .run('test-notice','Test notice','Stored in the database',member);
 db.prepare("INSERT INTO admin_audit_log(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)")
   .run('test-audit',member,'create','notice','test-notice');
 assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reading_experiences WHERE member_id=?").get(member).count,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE status='published' AND visibility='public'").get().count,1);
 assert.equal(db.prepare("SELECT state FROM missing_book_requests WHERE id=?").get('test-request').state,'pending');
 assert.equal(db.prepare("SELECT body FROM admin_site_notices WHERE id=?").get('test-notice').body,'Stored in the database');
 assert.equal(db.prepare("SELECT entity_id FROM admin_audit_log WHERE actor_id=?").get(member).entity_id,'test-notice');
 const catalogue=db.prepare(`SELECT w.id,w.title,
   (SELECT GROUP_CONCAT(DISTINCT e.format) FROM editions e WHERE e.work_id=w.id) AS editionFormats
   FROM works w WHERE instr(lower(w.title),lower(?))>0`).get('real test');
 assert.equal(catalogue?.editionFormats,'audiobook');
 const communityReview=db.prepare(`SELECT r.id,w.title AS bookTitle,m.display_name AS authorName
   FROM reviews r JOIN works w ON w.id=r.book_id JOIN members m ON m.id=r.member_id
   WHERE r.status='published' AND r.visibility='public'`).get();
 assert.equal(communityReview?.bookTitle,'A Real Test Book');

 console.log('PASS: '+filenames.length+' migrations, '+tables.length+' tables, foreign keys, site identity, reading records, public reviews, missing requests, audited admin writes and cloud search');
}finally{db.close()}
