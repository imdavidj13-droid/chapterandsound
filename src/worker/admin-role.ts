/**
 * Administrator bootstrap. The configured mailbox is only a candidate:
 * a trusted Better Auth session must prove the email has been verified.
 * Admin role rows are written by the server, never from registration input.
 */
export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export const isVerifiedSiteOwner=(user:{email:string;emailVerified:boolean},adminEmail?:string|null)=>
 Boolean(adminEmail?.trim()&&user.emailVerified&&normalizeEmail(user.email)===normalizeEmail(adminEmail));

interface Statement{
 bind(...values:(string|number|null)[]):Statement;
 first<T>():Promise<T|null>;
 run():Promise<unknown>;
}
interface Database{prepare(sql:string):Statement}
export type Role='admin'|'moderator'|null;
export async function syncSiteRole(db:Database,user:{id:string;email:string;emailVerified:boolean},configuredAdminEmail?:string):Promise<Role>{
  if(isVerifiedSiteOwner(user,configuredAdminEmail)){
    await db.prepare(`INSERT INTO site_roles(member_id,role,granted_by)
      VALUES(?,'admin','verified_email_bootstrap')
      ON CONFLICT(member_id) DO UPDATE SET role='admin',granted_by='verified_email_bootstrap'`)
      .bind(user.id).run();
    return 'admin';
  }
  // If the owner later changes their email, the original bootstrap grant must not survive.
  await db.prepare("DELETE FROM site_roles WHERE member_id=? AND granted_by='verified_email_bootstrap'").bind(user.id).run();
  const record=await db.prepare("SELECT role FROM site_roles WHERE member_id=?").bind(user.id).first<{role:string}>();
  return record?.role==='moderator'?'moderator':null;
}
