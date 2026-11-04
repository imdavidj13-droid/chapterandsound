import {CatalogueBookEditor} from './CatalogueBookEditor';
import {CatalogueManualManager} from './CatalogueManualManager';
import {CatalogueLinkedEditions} from './CatalogueLinkedEditions';
import {CatalogueCoverEditor} from './CatalogueCoverEditor';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';

type Work={id:string;title:string;type:string;status:string;revision:number;authors:string|null;editions:number;language:string|null;firstPublicationDate:string|null};
type WorkDetails={work:Work&{synopsis:string};credits:{id:string;name:string;role:string;personId:string}[]};
type Person={id:string;name:string;status:string};
type Edition={id:string;workId:string;title:string;format:string;pageCount:number|null};
type Recording={id:string;workId:string;title:string;performanceType:string;durationSeconds:number|null};
type RecordType='works'|'people'|'editions'|'recordings';
const formats=['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown'];
const typeLabels=['book','short_story','collection','graphic_novel','comic','poetry','play','reference','other'];
const performances=['unknown','single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice'];
const abridgements=['unknown','unabridged','abridged','adapted'];
const label=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const short=(id:string)=>id.slice(0,8);
export function CatalogueWorkbench(){
 const [ready,setReady]=useState<boolean|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [tab,setTab]=useState<RecordType>('works'),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
 const [works,setWorks]=useState<Work[]>([]),[people,setPeople]=useState<Person[]>([]);
 const [editions,setEditions]=useState<Edition[]>([]),[recordings,setRecordings]=useState<Recording[]>([]);
 const [query,setQuery]=useState(''),[selectedWork,setSelectedWork]=useState('');
 const [title,setTitle]=useState(''),[type,setType]=useState('book'),[language,setLanguage]=useState(''),[publicationDate,setPublicationDate]=useState('');
 const [personName,setPersonName]=useState('');
 const [authorName,setAuthorName]=useState('');
 const [format,setFormat]=useState('paperback'),[pageCount,setPageCount]=useState('');
 const [performance,setPerformance]=useState('unknown'),[abridgement,setAbridgement]=useState('unknown'),[durationHours,setDurationHours]=useState(''),[durationMinutes,setDurationMinutes]=useState('');
 const [activeForm,setActiveForm]=useState<RecordType|null>('works');
 const [editingId,setEditingId]=useState(''),[editRevision,setEditRevision]=useState(0);
 const [editSynopsis,setEditSynopsis]=useState(''),[editCredits,setEditCredits]=useState<WorkDetails['credits']>([]);
 const [editStatus,setEditStatus]=useState('draft');
 const [opening,setOpening]=useState(false);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [editView,setEditView]=useState<'details'|'editions'|'images'|'preview'>('details');
 const [mediaReady,setMediaReady]=useState(false),[mediaKind,setMediaKind]=useState<'work'|'edition'|'person'>('edition');
 const [mediaId,setMediaId]=useState(''),[mediaFile,setMediaFile]=useState<File|null>(null);
 const [rightsHolder,setRightsHolder]=useState(''),[licenceName,setLicenceName]=useState(''),[sourceUrl,setSourceUrl]=useState('');
 const [rightsConfirmed,setRightsConfirmed]=useState(false),[uploading,setUploading]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const health=await apiGet<{imageStorage?:boolean}>('/api/catalogue-admin/health');
   setMediaReady(Boolean(health.imageStorage));
   setReady(true);
   const [w,p,e,r]=await Promise.all([
    apiGet<{items:Work[]}>('/api/catalogue-admin/works?limit=100'),
    apiGet<{items:Person[]}>('/api/catalogue-admin/people?limit=100'),
    apiGet<{items:Edition[]}>('/api/catalogue-admin/editions?limit=100'),
    apiGet<{items:Recording[]}>('/api/catalogue-admin/recordings?limit=100')
   ]);
   setWorks(w.items);setPeople(p.items);setEditions(e.items);setRecordings(r.items);
  }catch(e){setReady(false);setError(e instanceof Error?e.message:'Catalogue unavailable')}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{
  // On the first catalogue visit, preserve existing website author identities
  // in BOOK_DB without deleting or relinking any legacy member records.
  void apiWrite<{copied:number;conflicts:number;moreMayExist:boolean}>('/api/catalogue-admin/consolidate-people','POST',{})
   .then(async result=>{
    await load();
    if(result.copied>0)setNotice(result.copied+' existing author profiles are now available in the catalogue.');
    if(result.conflicts>0)setNotice(v=>v+' '+result.conflicts+' ambiguous profiles need separate review; none were merged.');
   })
   .catch(()=>{void load()});
 },[load]);
 const refresh=()=>void load();
 async function openWork(workId:string){
  setOpening(true);setError('');setNotice('');setActiveForm(null);
  try{
   const detail=await apiGet<WorkDetails>('/api/catalogue-admin/works/'+encodeURIComponent(workId));
   setEditingId(workId);setEditView('details');setEditRevision(detail.work.revision);setEditStatus(detail.work.status);
   setTitle(detail.work.title);setType(detail.work.type);setLanguage(detail.work.language||'');
   setPublicationDate(detail.work.firstPublicationDate||'');setEditSynopsis(detail.work.synopsis||'');
   setEditCredits(detail.credits);
  }catch(e){setError(e instanceof Error?e.message:'Unable to open book')}
  finally{setOpening(false)}
 }
 async function updateWork(e:FormEvent){
  e.preventDefault();if(!editingId)return;
  setSaving(true);setError('');setNotice('');
  try{
   const saved=await apiWrite<{id:string;revision:number;saved:boolean}>('/api/catalogue-admin/works/'+encodeURIComponent(editingId),'PATCH',{
    title,type,language,firstPublicationDate:publicationDate,synopsis:editSynopsis,expectedRevision:editRevision
   });
   setEditRevision(saved.revision);setNotice('Book changes saved to BOOK_DB. Revision '+saved.revision+'.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Book update failed. Your unsaved changes are still in the form.')}
  finally{setSaving(false)}
 }

 async function changePublication(target:'draft'|'published'){
  if(!editingId||saving)return;
  if(target==='published'&&!window.confirm('Publish this book to the public catalogue? Make sure all details and its first edition are correct.'))return;
  if(target==='draft'&&!window.confirm('Return this book to draft and remove it from public catalogue results?'))return;
  setSaving(true);setError('');setNotice('');
  try{
   const result=await apiWrite<{saved:boolean;status:string;revision:number}>('/api/catalogue-admin/works/'+encodeURIComponent(editingId)+'/publication','PATCH',{status:target,expectedRevision:editRevision});
   setEditRevision(result.revision);setEditStatus(result.status);setNotice(target==='published'?'Book published to the public catalogue.':'Book returned to draft.');await load();
  }catch(e){setError(e instanceof Error?e.message:'Could not change publication status')}
  finally{setSaving(false)}
 }
 async function uploadMedia(e:FormEvent){
  e.preventDefault();
  if(!mediaReady||!mediaFile||!mediaId||!rightsConfirmed)return;
  setError('');setNotice('');setUploading(true);
  try{
   const data=new FormData();
   data.set('entityKind',mediaKind);data.set('entityId',mediaId);
   data.set('rightsHolder',rightsHolder);data.set('licenceName',licenceName);data.set('sourceUrl',sourceUrl);
   data.set('rightsConfirmed','yes');data.set('file',mediaFile);
   const response=await fetch('/api/catalogue-admin/upload-image',{method:'POST',credentials:'include',body:data});
   const result=await response.json() as {error?:string;assetId?:string;url?:string};
   if(!response.ok)throw new Error(result.error||'Image upload failed');
   setNotice('Image uploaded and linked to this catalogue record. Asset ID: '+result.assetId);
   setMediaFile(null);setRightsConfirmed(false);
  }catch(e){setError(e instanceof Error?e.message:'Image upload failed')}
  finally{setUploading(false)}
 }
 if(ready===null)return <section className="cs-admin-form"><h2>Catalogue</h2><p role="status">Checking dedicated Cloudflare catalogue database…</p></section>;
 if(ready===false)return <section className="cs-admin-form"><h2>Catalogue database setup</h2><p>The catalogue editor will become available once the separate BOOK_DB migrations are installed.</p><p role="alert" className="cs-admin-error">{error}</p><p>No member database records have been changed.</p><button type="button" onClick={refresh}>Check again</button></section>;
 return <div className="cs-catalogue">

  <div className="cs-catalogue-primary-bar"><div><p className="cs-admin-eyebrow">BOOK CATALOGUE</p><h2>{editingId?'Edit existing book':activeForm==='works'?'Create a new book':'Your books'}</h2><p>One catalogue. Every edition, narrator and format belongs to its book.</p></div><div className="cs-catalogue-primary-actions"><button type="button" className={activeForm==='works'?'selected':''} onClick={()=>{setEditingId('');setActiveForm('works')}}>+ New book</button><button type="button" className={!editingId&&activeForm!=='works'?'selected':''} onClick={()=>{setActiveForm(null);setEditingId('')}}>Browse books</button><button type="button" onClick={refresh} disabled={loading}>Refresh</button></div></div>
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {notice&&<p role="status" className="cs-admin-success">{notice}</p>}
  {editingId&&tab==='works'&&<section className="cs-book-edit-workspace" aria-label="Edit catalogue book">
   <header className="cs-book-edit-heading">
    <div><p className="cs-book-eyebrow">CHAPTER & SOUND / BOOK EDITOR</p><h2>Edit book: {works.find(w=>w.id===editingId)?.title||title}</h2>
     <p>Record {short(editingId)} · Revision {editRevision} · {label(editStatus)} · Saved changes update this book.</p></div>
    <div className="cs-book-edit-publish-actions">
     {editStatus==='draft'&&<button type="button" className="cs-book-publish" disabled={saving} onClick={()=>void changePublication('published')}>Publish book</button>}
     {editStatus==='published'&&<button type="button" disabled={saving} onClick={()=>void changePublication('draft')}>Return to draft</button>}
     <button type="button" disabled={saving} onClick={()=>setEditingId('')}>Close editor</button>
    </div>
   </header>
   <nav className="cs-book-edit-tabs" aria-label="Book editing sections">
    {(['details','editions','images','preview'] as const).map(view=><button type="button" key={view} aria-current={editView===view?'page':undefined} className={editView===view?'active':''} onClick={()=>setEditView(view)}>{view==='details'?'Book details':view==='editions'?'Editions & audio':view==='images'?'Cover & images':'Preview'}</button>)}
   </nav>
   {editView==='details'&&<form className="cs-book-edit-body" onSubmit={updateWork}>
    <div className="cs-book-edit-columns">
     <div className="cs-book-edit-panel">
      <h3>Book details</h3>
      <label>Title *<input required maxLength={500} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <div className="cs-book-editor-two">
       <label>Type<select value={type} onChange={e=>setType(e.target.value)}>{typeLabels.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
       <label>Original language<input maxLength={40} placeholder="en-GB" value={language} onChange={e=>setLanguage(e.target.value)}/></label>
      </div>
      <label>First publication date<input maxLength={10} placeholder="YYYY-MM-DD" value={publicationDate} onChange={e=>setPublicationDate(e.target.value)}/></label>
      <label>Description<textarea rows={7} maxLength={12000} value={editSynopsis} onChange={e=>setEditSynopsis(e.target.value)}/></label>
     </div>
     <aside className="cs-book-edit-panel">
      <h3>Linked contributors</h3>
      {editCredits.length?<ul>{editCredits.map(c=><li key={c.id}>{c.name} <span>· {label(c.role)}</span></li>)}</ul>:<p>No contributor linked yet.</p>}
      <p>Contributor relationships are preserved when book details are edited. Use detailed catalogue management to change credits.</p>
      <div className="cs-book-edit-status"><strong>Current catalogue status</strong><span>{label(works.find(w=>w.id===editingId)?.status||'unknown')}</span></div>
     </aside>
    </div>
    <footer className="cs-book-edit-footer"><button type="submit" className="primary" disabled={saving||!title.trim()}>{saving?'Saving…':'Save book changes'}</button></footer>
   </form>}
   {editView==='editions'&&<div className="cs-book-edit-body"><CatalogueLinkedEditions workId={editingId} onSaved={()=>void load()}/></div>}
   {editView==='images'&&<div className="cs-book-edit-body"><CatalogueCoverEditor workId={editingId} imageStorage={mediaReady}/></div>}
   {editView==='preview'&&<div className="cs-book-edit-body"><div className="cs-book-edit-panel">
    <p className="cs-book-eyebrow">CATALOGUE RECORD PREVIEW</p><h3>{title||'Untitled book'}</h3>
    <p><strong>Authors:</strong> {editCredits.filter(c=>['author','coauthor'].includes(c.role)).map(c=>c.name).join(', ')||'Not linked'}</p>
    <p><strong>Type:</strong> {label(type)} · <strong>Language:</strong> {language||'Unknown'} · <strong>First published:</strong> {publicationDate||'Unknown'}</p>
    <p>{editSynopsis||'No description entered.'}</p>
    <p><strong>Linked formats:</strong> {[...new Set(editions.filter(e=>e.workId===editingId).map(e=>label(e.format)))].join(', ')||'No edition in loaded results'}</p>
    <p className="cs-book-edit-hint">This is a local preview of the fields currently in the editor. Save book details before viewing the published page.</p>
    <a className="cs-book-edit-link" href={'/book/'+encodeURIComponent(editingId)}>Open public book page</a>
   </div></div>}
  </section>}
  {activeForm!=='works'&&<div className="cs-admin-heading cs-catalogue-list-head" style={{marginTop:22}}><div><h3>Books in the catalogue</h3><p>Choose a book to edit its details and linked editions.</p></div><span>{works.length} loaded books</span></div>}
  {activeForm==='works'&&<CatalogueBookEditor authors={people} imageStorage={mediaReady}
     onCancel={()=>setActiveForm(null)} onEditExisting={(bookId)=>{setActiveForm(null);void openWork(bookId)}} onSaved={(bookId,message)=>{
      setActiveForm(null);setNotice(message+' Book ID: '+bookId);void load();void openWork(bookId);
     }}/>}
  {activeForm!=='works'&&<div className="cs-admin-data cs-admin-table-scroll">
   <table><thead><tr><th>Name or title</th><th>Status / detail</th><th>Record ID</th></tr></thead><tbody>
    {(tab==='works'?works.map(x=>({id:x.id,name:x.title,status:(x.status==='draft'?'Existing unfinished record':x.status==='published'?'Saved':x.status)+' · '+(x.authors||'Author not yet added')})):
     tab==='people'?people.map(x=>({id:x.id,name:x.name,status:x.status})):
     tab==='editions'?editions.map(x=>({id:x.id,name:x.title,status:x.format+' · '+(x.status==='published'?'Saved':x.status)})):
     recordings.map(x=>({id:x.id,name:x.title,status:x.performanceType+' · '+(x.durationSeconds==null?'Runtime unknown':Math.round(x.durationSeconds/60)+' minutes')}))
    ).map(x=><tr key={x.id}><td>{x.name}</td><td>{x.status}</td><td><code title={x.id}>{short(x.id)}</code>{tab==='works'&&<button type="button" disabled={opening||saving} onClick={()=>void openWork(x.id)} style={{marginLeft:8}}>Edit</button>}</td></tr>)}
   </tbody></table>
   {!loading&&(tab==='works'?works:tab==='people'?people:tab==='editions'?editions:recordings).length===0&&<p className="cs-admin-empty">No catalogue records yet.</p>}
  </div>}
  {activeForm!=='works'&&<section className="cs-catalogue-advanced">
   <div><h3>Advanced catalogue tools</h3><p>Manage authors, additional editions, recording credits, genres, publishers, series and identifiers without creating a second catalogue.</p></div>
   <button type="button" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced tools':'Open advanced tools'}</button>
  </section>}
  {activeForm!=='works'&&showAdvanced&&<CatalogueManualManager/>}
  {activeForm!=='works'&&<section id="cs-catalogue-media" className="cs-admin-form" style={{marginTop:20}}>
   <h3>Book covers and contributor portraits</h3>
   {!mediaReady?<p>Cloudflare R2 is not connected yet. Images will be available here once the CATALOGUE_MEDIA bucket is created and bound. No files are stored in the browser.</p>:
   <form onSubmit={uploadMedia} className="cs-admin-form">
    <label>Image belongs to<select value={mediaKind} onChange={e=>{setMediaKind(e.target.value as typeof mediaKind);setMediaId('')}}>
     <option value="edition">Book edition — front cover</option><option value="work">Book — representative cover</option><option value="person">Contributor — portrait</option>
    </select></label>
    <label>Record<select required value={mediaId} onChange={e=>setMediaId(e.target.value)}><option value="">Choose existing record</option>
     {(mediaKind==='edition'?editions.map(x=>({id:x.id,name:x.title+' / '+x.format})):
       mediaKind==='work'?works.map(x=>({id:x.id,name:x.title})):
       people.map(x=>({id:x.id,name:x.name}))).map(x=><option key={x.id} value={x.id}>{x.name} ({short(x.id)})</option>)}
    </select></label>
    <label>Image file (PNG, JPG, WEBP or AVIF, maximum 5 MB)<input required type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e=>setMediaFile(e.target.files?.[0]||null)}/></label>
    <label>Rights holder<input required maxLength={500} value={rightsHolder} onChange={e=>setRightsHolder(e.target.value)}/></label>
    <label>Licence or permission<input required maxLength={250} value={licenceName} onChange={e=>setLicenceName(e.target.value)} placeholder="e.g. publisher permission or own photograph"/></label>
    <label>Source URL<input required type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..."/></label>
    <label><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> I confirm I have permission to display this image publicly on Chapter & Sound.</label>
    <button type="submit" className="primary" disabled={!mediaFile||!mediaId||!rightsConfirmed||uploading}>{uploading?'Uploading…':'Upload and link image'}</button>
   </form>}
  </section>}
 </div>;
}
