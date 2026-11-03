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
 for(const table of ['user','session','account','verification','members','works','editions','people','reading_experiences','reviews','site_roles','member_theme_preferences']){
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
 console.log('PASS: '+filenames.length+' migrations, '+tables.length+' tables, foreign keys, theme choice and verified role prerequisites');
}finally{db.close()}
