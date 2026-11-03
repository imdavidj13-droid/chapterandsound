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
 const [query,setQuery]=useState(''),[selectedWork,setSelectedWork]=useState(''),[selectedRecording,setSelectedRecording]=useState('');
 const [title,setTitle]=useState(''),[type,setType]=useState('book'),[language,setLanguage]=useState(''),[publicationDate,setPublicationDate]=useState('');
 const [personName,setPersonName]=useState(''),[selectedPerson,setSelectedPerson]=useState(''),[creditRole,setCreditRole]=useState('author');
 const [format,setFormat]=useState('paperback'),[pageCount,setPageCount]=useState('');
 const [performance,setPerformance]=useState('unknown'),[abridgement,setAbridgement]=useState('unknown'),[durationHours,setDurationHours]=useState(''),[durationMinutes,setDurationMinutes]=useState('');
 const [activeForm,setActiveForm]=useState<RecordType|null>(null);
 const [showCredit,setShowCredit]=useState(false);
 const [editingId,setEditingId]=useState(''),[editRevision,setEditRevision]=useState(0);
 const [editSynopsis,setEditSynopsis]=useState(''),[editCredits,setEditCredits]=useState<WorkDetails['credits']>([]);
 const [opening,setOpening]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   await apiGet('/api/catalogue-admin/health');
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
 useEffect(()=>{void load()},[load]);
 const refresh=()=>void load();
 async function openWork(workId:string){
  setOpening(true);setError('');setNotice('');setActiveForm(null);
  try{
   const detail=await apiGet<WorkDetails>('/api/catalogue-admin/works/'+encodeURIComponent(workId));
   setEditingId(workId);setEditRevision(detail.work.revision);
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

 async function save(e:FormEvent){
  e.preventDefault();setSaving(true);setError('');setNotice('');
  const duration=durationHours||durationMinutes?Number(durationHours||0)*3600+Number(durationMinutes||0)*60:null;
  const payload:Record<string,unknown>=tab==='works'?{title,type,language,firstPublicationDate:publicationDate}
   :tab==='people'?{name:personName}
   :tab==='editions'?{workId:selectedWork,format,pageCount:pageCount===''?null:Number(pageCount)}
   :{workId:selectedWork,performanceType:performance,abridgement,durationSeconds:duration};
  try{
   const result=await apiWrite<{id:string;saved:boolean}>('/api/catalogue-admin/'+tab,'POST',payload);
   setNotice(label(tab.slice(0,-1))+' saved as a private catalogue draft. ID: '+result.id);
   setActiveForm(null);setTitle('');setPersonName('');setPageCount('');setDurationHours('');setDurationMinutes('');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Catalogue save failed')}
  finally{setSaving(false)}
 }
 async function saveCredit(){
  setSaving(true);setError('');setNotice('');
  try{
   const payload={personId:selectedPerson,workId:creditRole==='narrator'?'':selectedWork,
    recordingId:creditRole==='narrator'?selectedRecording:'',role:creditRole};
   const res=await apiWrite<{id:string}>('/api/catalogue-admin/contributions','POST',payload);
   setNotice('Contributor credited and saved to BOOK_DB. Credit ID: '+res.id);
   setShowCredit(false);await load();
  }catch(e){setError(e instanceof Error?e.message:'Could not assign contributor')}
  finally{setSaving(false)}
 }
 if(ready===null)return <section className="cs-admin-form"><h2>Catalogue</h2><p role="status">Checking dedicated Cloudflare catalogue database…</p></section>;
 if(ready===false)return <section className="cs-admin-form"><h2>Catalogue database setup</h2><p>The catalogue editor will become available once the separate BOOK_DB migrations are installed.</p><p role="alert" className="cs-admin-error">{error}</p><p>No member database records have been changed.</p><button type="button" onClick={refresh}>Check again</button></section>;
 return <div className="cs-catalogue">
  <div className="cs-admin-metrics">
   {([{label:'Books',value:works.length},{label:'Contributors',value:people.length},{label:'Editions',value:editions.length},{label:'Recordings',value:recordings.length}]).map(x=><div key={x.label} className="cs-admin-metric"><span>{x.label} in first 100 results</span><strong>{x.value}</strong></div>)}
  </div>
  <div className="cs-admin-heading" style={{marginTop:24}}><div><h2>Catalogue management</h2><p>Real records from the separate BOOK_DB database. New records start as private drafts.</p></div><button type="button" onClick={refresh} disabled={loading}>Refresh database</button></div>
  <div className="cs-admin-actions" role="tablist" aria-label="Catalogue data areas">
   {(['works','people','editions','recordings'] as RecordType[]).map(x=><button role="tab" aria-selected={tab===x} key={x} className={tab===x?'primary':''} type="button" onClick={()=>{setTab(x);setActiveForm(null);setEditingId('');setError('');setNotice('')}}>{x==='works'?'Books':x==='people'?'Authors & narrators':x==='recordings'?'Audiobooks':'Editions'}</button>)}
  </div>
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {notice&&<p role="status" className="cs-admin-success">{notice}</p>}
  {editingId&&tab==='works'&&<form className="cs-admin-form" onSubmit={updateWork}>
   <div className="cs-admin-heading"><div><h3>Edit book metadata</h3><p>Book ID: <code>{editingId}</code> · Revision {editRevision}. Saves to BOOK_DB; descriptions remain private until reviewed.</p></div>
   <button type="button" disabled={saving} onClick={()=>setEditingId('')}>Close editor</button></div>
   <label>Title *<input required maxLength={500} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>Type<select value={type} onChange={e=>setType(e.target.value)}>{typeLabels.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
   <label>Original language<input maxLength={40} placeholder="en-GB" value={language} onChange={e=>setLanguage(e.target.value)}/></label>
   <label>Original publication date<input maxLength={10} placeholder="YYYY, YYYY-MM or YYYY-MM-DD" value={publicationDate} onChange={e=>setPublicationDate(e.target.value)}/></label>
   <label>Editorial synopsis (private draft)<textarea rows={6} maxLength={12000} value={editSynopsis} onChange={e=>setEditSynopsis(e.target.value)} placeholder="Enter sourced or editorial book description…"/></label>
   <h4>Current contributors</h4>
   <p>{editCredits.length?editCredits.map(c=>c.name+' ('+label(c.role)+')').join(', '):'No contributor credits assigned yet. Use Assign contributor below.'}</p>
   <p>Edition-specific ISBNs, publication details, genres and cover uploads are managed in their own upcoming editor panels.</p>
   <button type="submit" className="primary" disabled={saving||!title.trim()}>{saving?'Saving…':'Save changes'}</button>
  </form>}
  <div className="cs-admin-heading" style={{marginTop:22}}><div><h3>{tab==='works'?'Books':tab==='people'?'Contributors':tab==='editions'?'Editions':'Audiobook recordings'}</h3></div>
   <button className="primary" type="button" onClick={()=>setActiveForm(v=>v===tab?null:tab)}>{activeForm===tab?'Cancel':'+ Create draft'}</button></div>
  {activeForm===tab&&<form className="cs-admin-form" onSubmit={save}>
    <h3>{tab==='works'?'New book':tab==='people'?'New contributor':tab==='editions'?'New edition':'New audiobook recording'}</h3>
    <p>Only identifying information is required. Additional metadata, covers and publication will be added through later editor stages.</p>
    {tab==='works'&&<>
     <label>Book title *<input required maxLength={500} value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label>Work type<select value={type} onChange={e=>setType(e.target.value)}>{typeLabels.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
     <label>Original language (optional)<input value={language} onChange={e=>setLanguage(e.target.value)} placeholder="en-GB" maxLength={40}/></label>
     <label>First publication date (optional)<input value={publicationDate} onChange={e=>setPublicationDate(e.target.value)} placeholder="YYYY or YYYY-MM or YYYY-MM-DD" maxLength={10}/></label>
    </>}
    {tab==='people'&&<label>Contributor name *<input required value={personName} onChange={e=>setPersonName(e.target.value)} maxLength={500}/></label>}
    {(tab==='editions'||tab==='recordings')&&<label>Book *<select required value={selectedWork} onChange={e=>setSelectedWork(e.target.value)}>
     <option value="">Select an existing book</option>{works.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}
    </select></label>}
    {tab==='editions'&&<>
     <label>Format *<select required value={format} onChange={e=>setFormat(e.target.value)}>{formats.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
     <label>Page count (optional)<input type="number" min={1} step={1} value={pageCount} onChange={e=>setPageCount(e.target.value)}/></label>
    </>}
    {tab==='recordings'&&<>
     <label>Performance type<select value={performance} onChange={e=>setPerformance(e.target.value)}>{performances.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
     <label>Abridgement<select value={abridgement} onChange={e=>setAbridgement(e.target.value)}>{abridgements.map(x=><option value={x} key={x}>{label(x)}</option>)}</select></label>
     <div className="cs-admin-actions"><label>Hours (optional)<input type="number" min={0} step={1} value={durationHours} onChange={e=>setDurationHours(e.target.value)}/></label>
     <label>Minutes (optional)<input type="number" min={0} max={59} step={1} value={durationMinutes} onChange={e=>setDurationMinutes(e.target.value)}/></label></div>
    </>}
    <button type="submit" className="primary" disabled={saving||(tab==='editions'||tab==='recordings')&&!selectedWork}>{saving?'Saving to cloud…':'Save private draft'}</button>
   </form>}
  <div className="cs-admin-data cs-admin-table-scroll">
   <table><thead><tr><th>Name or title</th><th>Status / detail</th><th>Record ID</th></tr></thead><tbody>
    {(tab==='works'?works.map(x=>({id:x.id,name:x.title,status:x.status+' · '+(x.authors||'Author not yet added')})):
     tab==='people'?people.map(x=>({id:x.id,name:x.name,status:x.status})):
     tab==='editions'?editions.map(x=>({id:x.id,name:x.title,status:x.format+' · '+x.status})):
     recordings.map(x=>({id:x.id,name:x.title,status:x.performanceType+' · '+(x.durationSeconds==null?'Runtime unknown':Math.round(x.durationSeconds/60)+' minutes')}))
    ).map(x=><tr key={x.id}><td>{x.name}</td><td>{x.status}</td><td><code title={x.id}>{short(x.id)}</code>{tab==='works'&&<button type="button" disabled={opening||saving} onClick={()=>void openWork(x.id)} style={{marginLeft:8}}>Edit</button>}</td></tr>)}
   </tbody></table>
   {!loading&&(tab==='works'?works:tab==='people'?people:tab==='editions'?editions:recordings).length===0&&<p className="cs-admin-empty">No catalogue records yet.</p>}
  </div>
  <section className="cs-admin-form" style={{marginTop:20}}>
   <div className="cs-admin-heading"><div><h3>Contributor credits</h3><p>Attach an existing person as an author of a book or narrator of a specific recording.</p></div>
    <button type="button" onClick={()=>setShowCredit(v=>!v)}>{showCredit?'Close':'Assign contributor'}</button></div>
   {showCredit&&<div className="cs-admin-form inline">
    <label>Contributor<select value={selectedPerson} onChange={e=>setSelectedPerson(e.target.value)}><option value="">Select a person</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Role<select value={creditRole} onChange={e=>setCreditRole(e.target.value)}><option value="author">Author</option><option value="coauthor">Coauthor</option><option value="narrator">Narrator</option><option value="translator">Translator</option><option value="editor">Editor</option><option value="illustrator">Illustrator</option></select></label>
    {creditRole==='narrator'?<label>Audiobook recording<select value={selectedRecording} onChange={e=>setSelectedRecording(e.target.value)}><option value="">Select a recording</option>{recordings.map(r=><option key={r.id} value={r.id}>{r.title} — {short(r.id)}</option>)}</select></label>:
      <label>Book<select value={selectedWork} onChange={e=>setSelectedWork(e.target.value)}><option value="">Select a book</option>{works.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>}
    <button type="button" className="primary" disabled={saving||!selectedPerson||(creditRole==='narrator'?!selectedRecording:!selectedWork)} onClick={()=>void saveCredit()}>{saving?'Saving…':'Save contributor credit'}</button>
   </div>}
  </section>
  <section className="cs-admin-form" style={{marginTop:20}}>
   <h3>Book-cover images · Cloudflare R2</h3>
   <p>Cover uploading needs its own private R2 bucket, rights verification and a signed upload endpoint. No upload is simulated or saved locally.</p>
   <button type="button" disabled>Upload cover — not connected yet</button>
  </section>
 </div>;
}
