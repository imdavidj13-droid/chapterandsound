import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';
import {CatalogueBookMetadata} from './CatalogueBookMetadata';

type Edition={id:string;workId:string;format:string;title:string|null;statement:string|null;language:string|null;pages:number|null;revision:number};
type Recording={id:string;workId:string;title:string|null;language:string|null;abridgement:string;performance:string;seconds:number|null;recordedDate:string|null;revision:number};
type Result={editions:Edition[];recordings:Recording[]};
const formats=['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown'];
const performances=['unknown','single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice'];
const abridgements=['unknown','unabridged','abridged','adapted'];
const label=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

/** Existing-book edition editor. All writes target records belonging to the supplied work ID. */
export function CatalogueLinkedEditions({workId,onSaved}:{workId:string;onSaved:()=>void}){
 const [data,setData]=useState<Result>({editions:[],recordings:[]});
 const [selected,setSelected]=useState<{kind:'editions'|'recordings';id:string}|null>(null);
 const [values,setValues]=useState<Record<string,string>>({});
 const [revision,setRevision]=useState(0);
 const [adding,setAdding]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const next=await apiGet<Result>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/linked');setData(next)}
  catch(e){setError(e instanceof Error?e.message:'Could not load this book’s editions')}
  finally{setLoading(false)}
 },[workId]);
 useEffect(()=>{void load()},[load]);
 function editEdition(e:Edition){
  setAdding(false);setSelected({kind:'editions',id:e.id});setRevision(e.revision);
  setValues({format:e.format,title:e.title||'',statement:e.statement||'',language:e.language||'',pages:e.pages==null?'':String(e.pages)});
  setError('');setNotice('');
 }
 function editRecording(r:Recording){
  setAdding(false);setSelected({kind:'recordings',id:r.id});setRevision(r.revision);
  setValues({title:r.title||'',language:r.language||'',abridgement:r.abridgement,performance:r.performance,seconds:r.seconds==null?'':String(r.seconds),recordedDate:r.recordedDate||''});
  setError('');setNotice('');
 }
 function set(key:string,value:string){setValues(old=>({...old,[key]:value}))}
 async function save(e:FormEvent){
  e.preventDefault();if(!selected&&!adding)return;
  setSaving(true);setError('');setNotice('');
  try{
   const target=adding?'editions':selected!.kind;
   const endpoint=adding?'/api/catalogue-admin/manual/editions':'/api/catalogue-admin/manual/'+target+'/'+encodeURIComponent(selected!.id);
   const result=await apiWrite<{saved:boolean;revision?:number}>(endpoint,adding?'POST':'PATCH',
    {...values,...(adding?{workId}:{expectedRevision:revision})});
   if(!result.saved)throw Error('The server did not confirm the save');
   setSelected(null);setAdding(false);setNotice(adding?'Edition added to this book.':'Existing record updated.');
   await load();onSaved();
  }catch(err){setError(err instanceof Error?err.message:'Could not save linked record. No changes were confirmed.')}
  finally{setSaving(false)}
 }
 const busy=loading||saving;
 return <div className="cs-linked-editor">
  <div className="cs-linked-toolbar"><div><h3>Editions and audiobook recordings</h3><p>All formats stay linked to this book. Select a record to edit it without leaving this workspace.</p></div>
   <button type="button" disabled={busy} onClick={()=>{setSelected(null);setAdding(true);setValues({format:'paperback',title:'',statement:'',language:'en',pages:''});setError('');setNotice('')}}>+ Add edition</button></div>
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {notice&&<p role="status" className="cs-admin-success">{notice}</p>}
  {loading?<p role="status">Loading this book’s linked records…</p>:<>
   <div className="cs-linked-entries">
    {data.editions.map(e=><div key={e.id} className="cs-linked-entry"><div><strong>{label(e.format)}</strong><span>{e.title||'Standard edition'} · {e.pages?e.pages+' pages · ':''}ID {e.id.slice(0,8)}</span>{e.format==='unknown'&&<small className="cs-simple-import-warning">Format not confirmed — this edition cannot be published yet. Edit this edition and choose its verified format.</small>}</div><button type="button" onClick={()=>editEdition(e)}>{e.format==='unknown'?'Fix edition format':'Edit edition'}</button></div>)}
    {!data.editions.length&&<p>No editions linked to this book yet.</p>}
   </div>
   <h4>Audiobook recordings</h4>
   <div className="cs-linked-entries">
    {data.recordings.map(r=><div key={r.id} className="cs-linked-entry"><div><strong>{r.title||'Audiobook recording'}</strong><span>{label(r.performance)} · {r.seconds==null?'Duration unknown':Math.round(r.seconds/60)+' min'} · ID {r.id.slice(0,8)}</span></div><button type="button" onClick={()=>editRecording(r)}>Edit recording</button></div>)}
    {!data.recordings.length&&<p>No recordings linked to this book yet.</p>}
   </div>
  </>}
  {(selected||adding)&&<form className="cs-linked-form" onSubmit={save}>
   <div className="cs-linked-toolbar"><h4>{adding?'Add an edition':selected?.kind==='editions'?'Edit edition':'Edit audiobook recording'}</h4><button type="button" onClick={()=>{setSelected(null);setAdding(false)}}>Close</button></div>
   {(adding||selected?.kind==='editions')?<div className="cs-book-editor-two">
    <label>Format<select value={values.format||'paperback'} onChange={e=>set('format',e.target.value)}>{formats.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
    <label>Language<input value={values.language||''} onChange={e=>set('language',e.target.value)} maxLength={40}/></label>
    <label>Edition title<input value={values.title||''} onChange={e=>set('title',e.target.value)} maxLength={500}/></label>
    <label>Edition statement<input value={values.statement||''} onChange={e=>set('statement',e.target.value)} maxLength={500}/></label>
    <label>Page count<input type="number" min="1" max="100000" value={values.pages||''} onChange={e=>set('pages',e.target.value)}/></label>
   </div>:<div className="cs-book-editor-two">
    <label>Recording title<input value={values.title||''} onChange={e=>set('title',e.target.value)} maxLength={500}/></label>
    <label>Narration language<input value={values.language||''} onChange={e=>set('language',e.target.value)} maxLength={40}/></label>
    <label>Performance<select value={values.performance||'unknown'} onChange={e=>set('performance',e.target.value)}>{performances.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
    <label>Abridgement<select value={values.abridgement||'unknown'} onChange={e=>set('abridgement',e.target.value)}>{abridgements.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
    <label>Runtime (seconds)<input type="number" min="1" value={values.seconds||''} onChange={e=>set('seconds',e.target.value)}/></label>
    <label>Recorded date<input placeholder="YYYY-MM-DD" value={values.recordedDate||''} onChange={e=>set('recordedDate',e.target.value)}/></label>
   </div>}
   {selected?.kind==='editions'&&values.format==='unknown'&&<p className="cs-simple-import-warning">This edition has an unknown format. Choose Paperback, Hardback or Ebook only if it is correct for the saved ISBN. Save this edition before trying Publish book again.</p>}
   <p className="cs-book-edit-hint">ISBNs, publisher details, narrators and genres can be edited in the metadata panels below.</p>
   <button type="submit" className="primary" disabled={saving}>{saving?'Saving…':adding?'Add edition':'Save changes'}</button>
  </form>}
  <CatalogueBookMetadata workId={workId}/>
 </div>;
}
