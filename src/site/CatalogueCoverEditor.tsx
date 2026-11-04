import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet} from './api';

type Edition={id:string;format:string};
type Cover={kind:'work'|'edition';entityId:string;assetId:string};
type Metadata={editions:Edition[];covers:Cover[]};
const empty:Metadata={editions:[],covers:[]};

export function CatalogueCoverEditor({workId,imageStorage}:{workId:string;imageStorage:boolean}){
 const [data,setData]=useState<Metadata>(empty);
 const [kind,setKind]=useState<'work'|'edition'>('work'),[editionId,setEditionId]=useState('');
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  try{
   const response=await apiGet<Metadata>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata');
   setData({editions:response.editions||[],covers:response.covers||[]});
   setEditionId(v=>response.editions.some(e=>e.id===v)?v:response.editions[0]?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load linked covers')}
 },[workId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  if(!file){setPreview('');return}
  const url=URL.createObjectURL(file);setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[file]);
 const entityId=kind==='work'?workId:editionId;
 const current=data.covers.find(x=>x.kind===kind&&x.entityId===entityId);
 // During book creation the uploaded front cover is linked to the first
 // edition. Display it as the book cover when no work-level cover exists.
 // Keep this fallback read-only; never modify the original edition link.
 const firstEditionCover=kind==='work'&&!current
  ?data.editions.map(e=>data.covers.find(cover=>cover.kind==='edition'&&cover.entityId===e.id)).find((cover):cover is Cover=>!!cover)
  :undefined;
 const displayedCover=current||firstEditionCover;
 const [imageFailed,setImageFailed]=useState(false);
 useEffect(()=>{setImageFailed(false)},[displayedCover?.assetId]);
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!imageStorage||!file||!entityId)return;
  setSaving(true);setError('');setNotice('');
  try{
   if(file.size>5_000_000||file.size<100)throw Error('Choose an image smaller than 5 MB.');
   const form=new FormData();
   form.set('entityKind',kind);form.set('entityId',entityId);
   form.set('file',file);
   const response=await fetch('/api/catalogue-admin/upload-image',{method:'POST',credentials:'include',body:form});
   const result=await response.json() as {error?:string;uploaded?:boolean};
   if(!response.ok||!result.uploaded)throw Error(result.error||'The upload was not confirmed.');
   setFile(null);
   setNotice('Cover uploaded and linked to the selected catalogue record.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Cover upload failed')}
  finally{setSaving(false)}
 }
 return <section className="cs-book-cover-editor">
  <h3>Book and edition covers</h3>
  <p>Manage the representative cover of this book, or the front cover of any of its editions. Replacements retain the previous asset and rights records for audit purposes.</p>
  {!imageStorage?<p className="cs-book-storage-warning" role="status">Cloudflare R2 image storage is not connected. Cover uploads are unavailable.</p>:<>
   {error&&<p className="cs-admin-error" role="alert">{error}</p>}
   {notice&&<p className="cs-admin-success" role="status">{notice}</p>}
   <form onSubmit={submit} className="cs-book-cover-editor-grid">
    <div className="cs-book-cover-editor-form">
     <label>Cover belongs to<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="work">Book — representative cover</option><option value="edition">Edition — front cover</option></select></label>
     {kind==='edition'&&<label>Edition<select required value={editionId} onChange={e=>setEditionId(e.target.value)}><option value="">Choose edition</option>{data.editions.map(x=><option key={x.id} value={x.id}>{x.format} · {x.id.slice(0,8)}</option>)}</select></label>}
     {current&&<p className="cs-book-edit-hint">A cover is already linked to this record. Uploading another replaces its primary link without deleting the previous asset.</p>}
     {firstEditionCover&&<p className="cs-book-edit-hint">Showing the cover uploaded with this book's first edition. You can upload a separate representative book cover if needed.</p>}
     <label>Cover image (PNG, JPG, WEBP, AVIF; under 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     <small>Only upload images you are entitled to display. Copyright details are not required to save the image.</small>
     <button type="submit" disabled={saving||!file||!entityId}>{saving?'Uploading…':current?'Replace primary cover':'Upload cover'}</button>
    </div>
    <aside className="cs-book-cover-preview-panel"><h4>Cover preview</h4>
     <div className="cs-book-cover-preview">{preview?<img src={preview} alt="Cover selected for uploading"/>:displayedCover&&!imageFailed?<img src={'/api/catalogue-media/'+encodeURIComponent(displayedCover.assetId)} alt={firstEditionCover?'Cover linked to this book’s first edition':'Currently linked cover'} onError={()=>setImageFailed(true)}/>:<div className="cs-book-cover-placeholder"><span aria-hidden="true">▤</span><strong>{imageFailed?'Cover could not be loaded':'No cover yet'}</strong></div>}</div>
     <p>{preview?'Selected local file — not uploaded yet':imageFailed?'The cover link exists, but the image could not be retrieved. Check R2 storage.':firstEditionCover?'Cover from the first edition':current?'Current catalogue cover':'Select a cover to preview it here'}</p>
    </aside>
   </form>
  </>}
 </section>;
}
