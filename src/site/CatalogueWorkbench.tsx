import {CatalogueBookEditor} from './CatalogueBookEditor';
import {CatalogueManualManager} from './CatalogueManualManager';
import {CatalogueLinkedEditions} from './CatalogueLinkedEditions';
import {CatalogueCoverEditor} from './CatalogueCoverEditor';
import {CatalogueDiagnostics} from './CatalogueDiagnostics';
import {CatalogueImportCentre} from './CatalogueImportCentre';
import {CataloguePublicationAudit} from './CataloguePublicationAudit';
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
type CatalogueView='new'|'drafts'|'published'|'all'|'edit'|'import';
function viewFromPath(path:string):CatalogueView{
 if(path==='/admin/catalogue/new')return 'new';
 if(path.startsWith('/admin/catalogue/book/'))return 'edit';
 if(path==='/admin/catalogue/published')return 'published';
 if(path==='/admin/catalogue/import')return 'import';
 if(path==='/admin/catalogue/all')return 'all';
 return 'drafts';
}
const catalogueUrl=(view:'new'|'drafts'|'published'|'all'|'import')=>view==='drafts'?'/admin/catalogue/drafts':'/admin/catalogue/'+view;
export function CatalogueWorkbench({path,navigate}:{path:string;navigate:(to:string)=>void}){
 const view=viewFromPath(path);
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
 const [activeForm,setActiveForm]=useState<RecordType|null>(null);
 const [editingId,setEditingId]=useState(''),[editRevision,setEditRevision]=useState(0);
 const [editSynopsis,setEditSynopsis]=useState(''),[editCredits,setEditCredits]=useState<WorkDetails['credits']>([]);
 const [editStatus,setEditStatus]=useState('draft');
 const [opening,setOpening]=useState(false);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [listedWorks,setListedWorks]=useState<Work[]>([]);
 const [listQuery,setListQuery]=useState(''),[listPage,setListPage]=useState(0);
 const [listLoading,setListLoading]=useState(false),[listError,setListError]=useState('');
 const [listVersion,setListVersion]=useState(0);
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
   setListVersion(n=>n+1);
  }catch(e){setReady(false);setError(e instanceof Error?e.message:'Catalogue unavailable')}
  finally{setLoading(false)}
 },[]);
 // Initial page loading must be read-only. Removing the automatic contributor
 // reconciliation must never remove the catalogue's initial GET requests.
 useEffect(()=>{void load()},[load]);
 // A bookmarked draft/editor opens the same canonical record after refresh.
 useEffect(()=>{
  if(view==='edit'){
   const id=path.slice('/admin/catalogue/book/'.length);
   if(id)void openWork(id,true,true);
   else navigate(catalogueUrl('drafts'));
  }else{
   setEditingId('');
   setActiveForm(view==='new'?'works':null);
  }
 },[path]);
 useEffect(()=>{
  if(view==='new'||view==='edit'||view==='import')return;
  let active=true;
  const timer=window.setTimeout(async()=>{
   setListLoading(true);setListError('');
   try{
    const params=new URLSearchParams({limit:'50',offset:String(listPage*50)});
    if(view!=='all')params.set('status',view==='published'?'published':'draft');
    if(listQuery.trim())params.set('q',listQuery.trim());
    const response=await apiGet<{items:Work[]}>('/api/catalogue-admin/works?'+params);
    if(active)setListedWorks(response.items||[]);
   }catch(e){if(active){setListedWorks([]);setListError(e instanceof Error?e.message:'Unable to load your books')}}
   finally{if(active)setListLoading(false)}
  },180);
  return()=>{active=false;window.clearTimeout(timer)};
 },[view,listQuery,listPage,listVersion]);
 // Legacy contributor reconciliation must be an intentional maintenance action,
 // never a database write caused by simply opening the catalogue screen.
 async function reconcileLegacyContributors(){
  if(!window.confirm('Import missing existing website contributor identities into BOOK_DB? Conflicting names will be flagged for review; no authors will be merged automatically.'))return;
  setSaving(true);setError('');setNotice('');
  try{
   const result=await apiWrite<{copied:number;conflicts:number;moreMayExist:boolean}>('/api/catalogue-admin/consolidate-people','POST',{});
   setNotice(result.copied+' existing profiles preserved in the catalogue. '+result.conflicts+' identity conflicts require review.'+(result.moreMayExist?' More source records may remain.':''));
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Contributor reconciliation was not confirmed')}
  finally{setSaving(false)}
 }
 const refresh=()=>void load();
 async function openWork(workId:string,preserveNotice=false,fromRoute=false){
  if(!fromRoute){navigate('/admin/catalogue/book/'+encodeURIComponent(workId));return}
  setOpening(true);setError('');if(!preserveNotice)setNotice('');setActiveForm(null);
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

  <div className="cs-catalogue-primary-bar">
   <div><p className="cs-admin-eyebrow">BOOK CATALOGUE</p>
    <h2>{view==='edit'?'Edit and review book':view==='new'?'Create a new book':view==='drafts'?'Saved drafts':view==='published'?'Published books':view==='import'?'Import Centre':'All books'}</h2>
    <p>{view==='new'?'1. Enter details  →  2. Save draft  →  3. Review and publish':
      view==='edit'?'Review your saved details, add editions and covers, then publish when ready.':
      view==='drafts'?'Your unfinished books are kept here until you publish them. Open any draft to continue.':
      view==='published'?'Books currently available in the public catalogue.':view==='import'?'Search permitted sources, preview candidates and prevent duplicate catalogue records.':'Browse and manage all catalogue books.'}</p>
   </div>
   <div className="cs-catalogue-primary-actions" aria-label="Catalogue workflow">
    <button type="button" className={view==='new'?'selected':''} onClick={()=>navigate(catalogueUrl('new'))}>+ Create book</button>
    <button type="button" className={view==='drafts'?'selected':''} onClick={()=>navigate(catalogueUrl('drafts'))}>Drafts</button>
    <button type="button" className={view==='published'?'selected':''} onClick={()=>navigate(catalogueUrl('published'))}>Published</button>
    <button type="button" className={view==='all'?'selected':''} onClick={()=>navigate(catalogueUrl('all'))}>All books</button>
    <button type="button" className={view==='import'?'selected':''} onClick={()=>navigate(catalogueUrl('import'))}>Import Centre</button>
    <button type="button" onClick={refresh} disabled={loading}>Refresh</button>
   </div>
  </div>
  {view==='edit'&&<p className="cs-catalogue-workflow-step" role="status">Draft workflow: <strong>Book saved</strong> → Edit details, editions and cover → Review → Publish. You can return here later from Drafts.</p>}
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {notice&&<p role="status" className="cs-admin-success">{notice}</p>}
  {view==='edit'&&editingId&&tab==='works'&&<section className="cs-book-edit-workspace" aria-label="Edit catalogue book">
   <header className="cs-book-edit-heading">
    <div><p className="cs-book-eyebrow">CHAPTER & SOUND / BOOK EDITOR</p><h2>Edit book: {works.find(w=>w.id===editingId)?.title||title}</h2>
     <p>Record {short(editingId)} · Revision {editRevision} · {label(editStatus)} · Saved changes update this book.</p></div>
    <div className="cs-book-edit-publish-actions">
     {editStatus==='draft'&&<button type="button" className="cs-book-publish" disabled={saving} onClick={()=>void changePublication('published')}>Publish book</button>}
     {editStatus==='published'&&<button type="button" disabled={saving} onClick={()=>void changePublication('draft')}>Return to draft</button>}
     <button type="button" disabled={saving} onClick={()=>navigate(catalogueUrl(editStatus==='published'?'published':'drafts'))}>Back to {editStatus==='published'?'published books':'drafts'}</button>
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
  {view==='edit'&&editingId&&<CataloguePublicationAudit key={editingId+editStatus} workId={editingId} status={editStatus}/>}
  {view!=='new'&&view!=='edit'&&view!=='import'&&<div className="cs-admin-heading cs-catalogue-list-head" style={{marginTop:22}}>
   <div><h3>{view==='drafts'?'Your saved drafts':view==='published'?'Published books':'Catalogue records'}</h3><p>{view==='drafts'?'Select Continue editing to finish a draft and publish it.':'Select Edit book to view and update its details.'}</p></div>
   <label>Search books<input type="search" value={listQuery} onChange={e=>{setListQuery(e.target.value);setListPage(0)}} placeholder="Search by title"/></label>
  </div>}
  {view==='new'&&activeForm==='works'&&<CatalogueBookEditor authors={people} imageStorage={mediaReady}
     onCancel={()=>navigate(catalogueUrl('drafts'))} onEditExisting={(bookId)=>navigate('/admin/catalogue/book/'+encodeURIComponent(bookId))} onSaved={(bookId,message)=>{
      setNotice(message+' You can return to this record at any time from Drafts.');
      setListVersion(v=>v+1);void load();
      navigate('/admin/catalogue/book/'+encodeURIComponent(bookId));
     }}/>}
  {view!=='new'&&view!=='edit'&&view!=='import'&&<>
   {listError&&<p role="alert" className="cs-admin-error">{listError}</p>}
   <div className="cs-catalogue-record-list" aria-label="Saved catalogue books">
    {listedWorks.map(book=><article className="cs-catalogue-record-card" key={book.id}>
     <div><span className={'cs-catalogue-record-state '+(book.status==='draft'?'is-draft':'')}>{book.status==='draft'?'Draft':label(book.status)}</span>
      <h3>{book.title}</h3>
      <p>{book.authors||'Author not linked'} · {book.editions} {book.editions===1?'edition':'editions'} · {book.firstPublicationDate||'Publication date not set'}</p></div>
     <button type="button" disabled={opening} onClick={()=>void openWork(book.id)}>{book.status==='draft'?'Continue editing':'Edit book'}</button>
    </article>)}
    {listLoading&&<p role="status" className="cs-catalogue-list-status">Loading saved books…</p>}
    {!listLoading&&!listError&&listedWorks.length===0&&<div className="cs-catalogue-list-empty"><h3>{view==='drafts'?'No drafts yet':'No matching books'}</h3><p>{view==='drafts'?'When you save a new book as a draft, it will appear here.':'Try another title or search all books.'}</p><button type="button" onClick={()=>navigate(catalogueUrl('new'))}>Create a book</button></div>}
   </div>
   <div className="cs-admin-pager"><button disabled={listPage===0||listLoading} onClick={()=>setListPage(p=>Math.max(0,p-1))}>Previous</button><span>Page {listPage+1}</span><button disabled={listedWorks.length<50||listLoading} onClick={()=>setListPage(p=>p+1)}>Next</button></div>
  </>}
  {view==='import'&&<CatalogueImportCentre/>}
  {view==='all'&&<CatalogueDiagnostics/>}
  {view==='all'&&<section className="cs-catalogue-advanced">
   <div><h3>Advanced catalogue tools</h3><p>Manage authors, additional editions, recording credits, genres, publishers, series and identifiers without creating a second catalogue.</p></div>
   <button type="button" aria-expanded={showAdvanced} onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced tools':'Open advanced tools'}</button>
  </section>}
  {view==='all'&&showAdvanced&&<>
   <section className="cs-catalogue-advanced" aria-label="Contributor reconciliation">
    <div><h3>Legacy contributor reconciliation</h3><p>Only use this when you intentionally need to bring older author profiles into the unified catalogue. Ambiguous identities are never merged automatically.</p></div>
    <button type="button" disabled={saving} onClick={()=>void reconcileLegacyContributors()}>Review and import legacy contributors</button>
   </section>
   <CatalogueManualManager/>
  </>}
  {view==='all'&&<section id="cs-catalogue-media" className="cs-admin-form" style={{marginTop:20}}>
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
