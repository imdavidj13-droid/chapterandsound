/** R2-backed approved catalogue images.
 * No storage fallback or fake image URLs. Uploads require verified owner access
 * in catalogue-admin-api, a rights attestation and matching metadata entities.
 */
type Scalar=string|number|null;
interface Statement{bind(...args:Scalar[]):Statement;first<T>():Promise<T|null>}
interface Database{prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>}
export interface CatalogueImageBucket{
 put(key:string,value:ArrayBuffer,options?:{httpMetadata?:{contentType:string}}):Promise<unknown>;
 get(key:string):Promise<{body:ReadableStream;httpMetadata?:{contentType?:string}}|null>;
 delete(key:string):Promise<void>;
}
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId=(s:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(s);
function sniff(bytes:Uint8Array):{mime:string;ext:string}|null{
 if(bytes.length>12&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a)return {mime:'image/png',ext:'png'};
 if(bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {mime:'image/jpeg',ext:'jpg'};
 if(bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {mime:'image/webp',ext:'webp'};
 if(bytes.length>12&&String.fromCharCode(...bytes.slice(4,8))==='ftyp'&&['avif','avis'].includes(String.fromCharCode(...bytes.slice(8,12))))return {mime:'image/avif',ext:'avif'};
 return null;
}
function target(kind:string):{table:string;role:string}|null{
 switch(kind){
 case 'work':return {table:'works',role:'representative_cover'};
 case 'edition':return {table:'editions',role:'front_cover'};
 case 'person':return {table:'people',role:'portrait'};
 default:return null;
 }
}
const clean=(v:FormDataEntryValue|null,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
export async function catalogueUploadImage(request:Request,db:Database,bucket:CatalogueImageBucket|undefined,actor:string):Promise<Response>{
 if(!bucket)return json({error:'Catalogue image storage is not connected. Create and bind the dedicated R2 bucket first.'},503);
 if(Number(request.headers.get('Content-Length')||0)>7_000_000)return json({error:'Image upload exceeds 5 MB'},413);
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data'))return json({error:'Expected a multipart image upload'},415);
 const data=await request.formData().catch(()=>null);
 if(!data)return json({error:'Invalid image upload'},400);
 const kind=clean(data.get('entityKind'),20),entityId=clean(data.get('entityId'),100);
 const mapping=target(kind);
 if(!mapping||!validId(entityId))return json({error:'Choose an existing book, edition or contributor'},400);
 const rightsHolder=clean(data.get('rightsHolder'),500),licence=clean(data.get('licenceName'),250);
 const source=clean(data.get('sourceUrl'),1500);
 if(!rightsHolder||!licence||!source||!/^https:\/\//.test(source))
  return json({error:'Rights holder, image licence or permission, and an HTTPS source URL are required'},400);
 if(data.get('rightsConfirmed')!=='yes')return json({error:'Confirm that public display is permitted by the rights holder'},400);
 const exists=await db.prepare('SELECT id FROM '+mapping.table+' WHERE id=?').bind(entityId).first();
 if(!exists)return json({error:'Target catalogue record was not found'},404);
 const file=data.get('file');
 if(!(file instanceof File)||file.size<100||file.size>5_000_000)return json({error:'Choose a PNG, JPG, WEBP or AVIF image under 5 MB'},400);
 const raw=await file.arrayBuffer(),bytes=new Uint8Array(raw);
 const media=sniff(bytes);
 if(!media)return json({error:'Unsupported or invalid image format'},415);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const assetId=crypto.randomUUID(),rightsId=crypto.randomUUID(),linkId=crypto.randomUUID(),key='catalogue/'+assetId+'.'+media.ext;
 try{
  await bucket.put(key,raw,{httpMetadata:{contentType:media.mime}});
  await db.batch([
   db.prepare('INSERT INTO media_rights(id,rights_holder,licence_name,source_url,verified_by,verified_at,public_display,api_redistribution) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,1,0)').bind(rightsId,rightsHolder,licence,source,actor),
   db.prepare("INSERT INTO media_assets(id,r2_key,sha256,mime_type,size_bytes,state,approved_at,rights_id) VALUES(?,?,?,?,?,'approved',CURRENT_TIMESTAMP,?)").bind(assetId,key,hash,media.mime,raw.byteLength,rightsId),
   // Exactly one approved primary image per target and role. Replacing a link
   // does not delete or rewrite the old asset or rights evidence.
   db.prepare('DELETE FROM media_links WHERE entity_kind=? AND entity_id=? AND role=? AND is_primary=1').bind(kind,entityId,mapping.role),
   db.prepare('INSERT INTO media_links(id,asset_id,entity_kind,entity_id,role,is_primary) VALUES(?,?,?,?,?,1)').bind(linkId,assetId,kind,entityId,mapping.role),
   db.prepare('INSERT INTO catalogue_audit_log(id,actor_external_id,action,target_kind,target_id,details_json) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,'upload_media',kind,entityId,JSON.stringify({assetId,rightsId,source,rightsHolder,licence,hash}))
  ]);
  return json({uploaded:true,assetId,url:'/api/catalogue-media/'+assetId},201);
 }catch(e){
  try{await bucket.delete(key)}catch(error){console.error('R2 orphan image cleanup failed',error)}
  console.error('Catalogue image upload failed',e);
  return json({error:'The image could not be saved; database changes were not confirmed'},503);
 }
}
export async function cataloguePublicImage(request:Request,db:Database|undefined,bucket:CatalogueImageBucket|undefined):Promise<Response>{
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Method not allowed'},405);
 if(!db||!bucket)return json({error:'Image storage unavailable'},503);
 const id=new URL(request.url).pathname.slice('/api/catalogue-media/'.length);
 if(!validId(id))return json({error:'Invalid image ID'},400);
 try{
  const meta=await db.prepare(`SELECT a.r2_key AS key,a.mime_type AS mime FROM media_assets a
    JOIN media_rights r ON r.id=a.rights_id JOIN media_links l ON l.asset_id=a.id
    WHERE a.id=? AND a.state='approved' AND r.public_display=1 LIMIT 1`).bind(id).first<{key:string;mime:string}>();
  if(!meta)return json({error:'Image not available'},404);
  const item=await bucket.get(meta.key);
  if(!item)return json({error:'Image missing'},404);
  return new Response(request.method==='HEAD'?null:item.body,{
   status:200,headers:{'Content-Type':meta.mime,'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}
  });
 }catch(e){console.error('Catalogue image read failed',e);return json({error:'Image unavailable'},503)}
}
