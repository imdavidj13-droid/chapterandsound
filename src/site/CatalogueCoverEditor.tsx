import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';

type Edition={id:string;format:string;language?:string|null;publicationStatus?:string};
type Identifier={editionId:string;code:string;value:string};
type Cover={kind:'work'|'edition';entityId:string;assetId:string};
type Metadata={editions:Edition[];covers:Cover[];identifiers:Identifier[]};
type RepresentativeCandidate={workKey:string;coverId:number;title:string;author:string;url:string};
type RepresentativeResponse={current:{workKey:string;coverId:number}|null;candidates:RepresentativeCandidate[]};
const empty:Metadata={editions:[],covers:[],identifiers:[]};

function RepresentativeCoverChooser({workId,onCurrentChange}:{workId:string;onCurrentChange:(candidate:RepresentativeCandidate|null)=>void}){
 const [data,setData]=useState<RepresentativeResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const next=await apiGet<RepresentativeResponse>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/representative-cover');
   setData(next);
   const selected=next.candidates.find(x=>x.workKey===next.current?.workKey&&x.coverId===next.current?.coverId)||null;
   onCurrentChange(selected);
  }
  catch(e){setError(e instanceof Error?e.message:'Cover choices unavailable')}
  finally{setLoading(false)}
 },[workId,onCurrentChange]);
 useEffect(()=>{setData(null);void load()},[load]);
 async function choose(item:RepresentativeCandidate){
  if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   await apiWrite('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/representative-cover','POST',
    {workKey:item.workKey,coverId:item.coverId,confirmed:true});
   onCurrentChange(item);await load();setNotice('Representative cover saved. The public book page will show this book artwork; edition covers stay unchanged.');
  }catch(e){setError(e instanceof Error?e.message:'Could not save cover')}
  finally{setSaving(false)}
 }
 return <section className="cs-representative-cover-picker" aria-label="Choose book representative cover">
  <h4>Choose the main book cover</h4>
  <p>This is the cover readers see in book searches and the book banner. It is independent of individual ISBN edition artwork.</p>
  {loading&&<p role="status">Checking matching book covers…</p>}
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {notice&&<p className="cs-admin-success" role="status">{notice}</p>}
  {data&&<div className="cs-representative-cover-options">
   {data.candidates.map(item=><article key={item.workKey+'-'+item.coverId} className="cs-representative-cover-choice">
    <img src={item.url} alt={'Book cover for '+item.title} loading="lazy" referrerPolicy="no-referrer"/>
    <div><strong>{item.title}</strong><small>{item.author}</small>
     {data.current?.coverId===item.coverId&&data.current.workKey===item.workKey&&<small>Selected main cover</small>}
    </div>
    <button type="button" disabled={saving||data.current?.coverId===item.coverId&&data.current.workKey===item.workKey}
     onClick={()=>void choose(item)}>{data.current?.coverId===item.coverId&&data.current.workKey===item.workKey?'Selected':'Use as main cover'}</button>
   </article>)}
   {!data.candidates.length&&<p>No exact title-and-author cover matches were found in Open Library. You can still upload an authorised representative cover below.</p>}
  </div>}
 </section>;
}
export function CatalogueCoverEditor({workId,imageStorage}:{workId:string;imageStorage:boolean}){
 const [data,setData]=useState<Metadata>(empty);
 const [kind,setKind]=useState<'work'|'edition'>('work'),[editionId,setEditionId]=useState('');
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState('');
 const [selectedRepresentative,setSelectedRepresentative]=useState<RepresentativeCandidate|null>(null);
 const [coverChoice,setCoverChoice]=useState<'representative'|'upload'>('representative');
 const onRepresentativeChange=useCallback((candidate:RepresentativeCandidate|null)=>{
  setSelectedRepresentative(candidate);
  setCoverChoice('representative');
 },[]);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  try{
   const response=await apiGet<Metadata>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata');
   setData({editions:response.editions||[],covers:response.covers||[],identifiers:response.identifiers||[]});
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
 const isbnCover=(edition:string)=>data.identifiers.find(x=>x.editionId===edition&&x.code==='ISBN13'&&/^\d{13}$/.test(x.value))?.value||'';
 const published=data.editions.filter(e=>e.publicationStatus==='published');
 const orderedEdtions=[...(published.length?published:data.editions)].sort((a,b)=>{
  const lang=(e:Edition)=>e.language==='en'?0:!e.language?1:2;
  const fmt=(e:Edition)=>e.format==='paperback'?0:e.format==='hardback'?1:e.format==='ebook'?2:3;
  return lang(a)-lang(b)||fmt(a)-fmt(b);
 });
 const sourceIsbn=kind==='edition'?isbnCover(editionId):orderedEdtions.map(e=>isbnCover(e.id)).find(Boolean)||'';
 // This matches the public book page: an uploaded R2 asset takes precedence,
 // otherwise show the ISBN-specific externally hosted cover, not a false "No cover" state.
 const sourceCover=sourceIsbn?'https://covers.openlibrary.org/b/isbn/'+sourceIsbn+'-L.jpg?default=false':'';
 const [imageFailed,setImageFailed]=useState(false);
 const [sourceImageFailed,setSourceImageFailed]=useState(false);
 useEffect(()=>{setImageFailed(false);setSourceImageFailed(false)},[displayedCover?.assetId,sourceCover]);
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
   setCoverChoice('upload');
   setNotice('Cover uploaded and linked to the selected catalogue record.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Cover upload failed')}
  finally{setSaving(false)}
 }
 return <section className="cs-book-cover-editor">
  <h3>Book and edition covers</h3>
  <RepresentativeCoverChooser workId={workId} onCurrentChange={onRepresentativeChange}/>
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
     {kind==='work'&&selectedRepresentative&&<p>Selected main book cover</p>}
     <div className="cs-book-cover-preview">{preview?
      <img src={preview} alt="Cover selected for uploading"/>:
      kind==='work'&&coverChoice==='representative'&&selectedRepresentative?
       <img src={selectedRepresentative.url} alt={'Selected main cover for '+selectedRepresentative.title} referrerPolicy="no-referrer"/>:
      displayedCover&&!imageFailed?
       <img src={'/api/catalogue-media/'+encodeURIComponent(displayedCover.assetId)} alt={firstEditionCover?'Cover linked to this book’s first edition':'Currently linked cover'} onError={()=>setImageFailed(true)}/>:
      kind==='work'&&selectedRepresentative?
       <img src={selectedRepresentative.url} alt={'Selected main cover for '+selectedRepresentative.title} referrerPolicy="no-referrer"/>:
      sourceCover&&!sourceImageFailed?
       <img src={sourceCover} alt={'Source-hosted cover for ISBN '+sourceIsbn} referrerPolicy="no-referrer" onError={()=>setSourceImageFailed(true)}/>:
       <div className="cs-book-cover-placeholder"><span aria-hidden="true">▤</span><strong>No cover available</strong></div>}</div>
     <p>{preview?'Selected local file — not uploaded yet':
      kind==='work'&&coverChoice==='representative'&&selectedRepresentative?'Currently selected main book cover':
      displayedCover&&!imageFailed?'Uploaded R2 image':
      kind==='work'&&selectedRepresentative?'Currently selected main book cover':
      sourceCover&&!sourceImageFailed?'Cover displayed from Open Library for ISBN '+sourceIsbn+' (not stored in R2)':
      sourceCover?'No Open Library cover is available for this ISBN':
      imageFailed?'The uploaded cover could not be retrieved. Check R2 storage.':'No cover available for the saved ISBN'}</p>
    </aside>
   </form>
  </>}
 </section>;
}
