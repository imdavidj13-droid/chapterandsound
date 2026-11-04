import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';

type Ref={id:string;name:string};
type Edition={id:string;format:string;revision:number};
type Recording={id:string;title:string|null};
type Identifier={id:string;editionId:string;code:string;value:string};
type Event={id:string;editionId:string;type:string;date:string|null;publisherId:string|null;publisher:string|null};
type Credit={id:string;recordingId:string;personId:string;name:string;role:string};
type Genre={id:string;subjectId:string;name:string};
type Metadata={editions:Edition[];recordings:Recording[];identifiers:Identifier[];events:Event[];credits:Credit[];genres:Genre[]};
type Action='identifier'|'publication'|'credit'|'removeCredit'|'genre'|'removeGenre';
const publicationTypes=['announced','preorder','released','reprinted','revised','withdrawn','out_of_print'];
const nice=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const empty:Metadata={editions:[],recordings:[],identifiers:[],events:[],credits:[],genres:[]};

/** One book's ISBNs, release history, publisher, narration credits and genres. */
export function CatalogueBookMetadata({workId}:{workId:string}){
 const [data,setData]=useState<Metadata>(empty);
 const [editionId,setEditionId]=useState(''),[recordingId,setRecordingId]=useState('');
 const [code,setCode]=useState('ISBN13'),[identifier,setIdentifier]=useState('');
 const [eventId,setEventId]=useState(''),[eventType,setEventType]=useState('released'),[eventDate,setEventDate]=useState('');
 const [publisherId,setPublisherId]=useState(''),[publisherSearch,setPublisherSearch]=useState(''),[publishers,setPublishers]=useState<Ref[]>([]);
 const [newPublisher,setNewPublisher]=useState('');
 const [personSearch,setPersonSearch]=useState(''),[people,setPeople]=useState<Ref[]>([]),[personId,setPersonId]=useState('');
 const [role,setRole]=useState('narrator'),[genre,setGenre]=useState('');
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const result=await apiGet<Metadata>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata');
   setData(result);
   setEditionId(prev=>result.editions.some(e=>e.id===prev)?prev:result.editions[0]?.id||'');
   setRecordingId(prev=>result.recordings.some(r=>r.id===prev)?prev:result.recordings[0]?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load book metadata')}
  finally{setLoading(false)}
 },[workId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  let active=true;
  const timer=window.setTimeout(()=>{
   apiGet<{items:Ref[]}>('/api/catalogue-admin/manual/publishers?limit=100&q='+encodeURIComponent(publisherSearch))
    .then(r=>{if(active)setPublishers(r.items||[])}).catch(()=>{if(active)setPublishers([])});
  },220);
  return()=>{active=false;window.clearTimeout(timer)};
 },[publisherSearch]);
 useEffect(()=>{
  let active=true;
  const timer=window.setTimeout(()=>{
   apiGet<{items:Ref[]}>('/api/catalogue-admin/people?limit=100&q='+encodeURIComponent(personSearch))
    .then(r=>{if(active)setPeople(r.items||[])}).catch(()=>{if(active)setPeople([])});
  },220);
  return()=>{active=false;window.clearTimeout(timer)};
 },[personSearch]);
 useEffect(()=>{
  const current=data.identifiers.find(i=>i.editionId===editionId&&i.code===code);
  setIdentifier(current?.value||'');
 },[data.identifiers,editionId,code]);
 useEffect(()=>{
  if(!eventId){setEventType('released');setEventDate('');setPublisherId('');return}
  const existing=data.events.find(e=>e.id===eventId&&e.editionId===editionId);
  if(existing){setEventType(existing.type);setEventDate(existing.date||'');setPublisherId(existing.publisherId||'')}
 },[eventId,editionId,data.events]);
 async function mutate(action:Action,payload:Record<string,unknown>,message:string){
  setSaving(true);setError('');setNotice('');
  try{
   await apiWrite('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata','POST',{action,...payload});
   setNotice(message);
   await load();
  }catch(e){setError(e instanceof Error?e.message:'The server did not confirm this change')}
  finally{setSaving(false)}
 }
 function submitIdentifier(e:FormEvent){e.preventDefault();void mutate('identifier',{editionId,code,value:identifier},'Edition identifier saved.')}
 function submitEvent(e:FormEvent){e.preventDefault();void mutate('publication',{editionId,eventId,type:eventType,date:eventDate,publisherId},'Publication details saved.')}
 function submitCredit(e:FormEvent){e.preventDefault();void mutate('credit',{recordingId,personId,role},'Narrator or cast credit linked.')}
 function submitGenre(e:FormEvent){e.preventDefault();void mutate('genre',{genre},'Genre linked to this book.').then(()=>setGenre(''))}
 async function addPublisher(e:FormEvent){
  e.preventDefault();if(!newPublisher.trim())return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await apiWrite<{saved:boolean;id:string}>('/api/catalogue-admin/manual/publishers','POST',{name:newPublisher.trim()});
   if(!response.saved||!response.id)throw Error('Publisher creation was not confirmed');
   setPublisherId(response.id);setPublisherSearch(newPublisher.trim());setNewPublisher('');
   setNotice('Publisher created and selected. Save the publication event to link it.');
  }catch(err){setError(err instanceof Error?err.message:'Could not create publisher')}
  finally{setSaving(false)}
 }
 const selectedEvents=data.events.filter(e=>e.editionId===editionId);
 const selectedCredits=data.credits.filter(c=>c.recordingId===recordingId);
 return <div className="cs-book-metadata">
  <div className="cs-linked-toolbar"><div><h3>Edition metadata</h3><p>Manage identifiers, publishers, release dates, narrators and genres directly from this book.</p></div><button type="button" onClick={()=>void load()} disabled={saving||loading}>Refresh metadata</button></div>
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {notice&&<p className="cs-admin-success" role="status">{notice}</p>}
  {loading?<p role="status">Loading edition metadata…</p>:<>
   <div className="cs-book-metadata-columns">
    <section className="cs-book-metadata-panel">
     <h4>ISBNs & identifiers</h4>
     {data.editions.length?<form onSubmit={submitIdentifier}>
      <label>Book edition<select value={editionId} onChange={e=>{setEditionId(e.target.value);setEventId('')}}>{data.editions.map(e=><option value={e.id} key={e.id}>{nice(e.format)} · {e.id.slice(0,8)}</option>)}</select></label>
      <label>Identifier type<select value={code} onChange={e=>setCode(e.target.value)}><option value="ISBN13">ISBN-13</option><option value="ISBN10">ISBN-10</option><option value="ASIN">ASIN</option></select></label>
      <label>Identifier<input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Enter valid identifier" required maxLength={100}/></label>
      <button type="submit" disabled={saving||!identifier.trim()}>{data.identifiers.some(i=>i.editionId===editionId&&i.code===code)?'Update identifier':'Save identifier'}</button>
      <p className="cs-book-edit-hint">Changing an identifier preserves the edition record and checks for duplicates elsewhere in the catalogue.</p>
     </form>:<p>Add an edition above to enter its ISBNs.</p>}
    </section>
    <section className="cs-book-metadata-panel">
     <h4>Publisher & publication history</h4>
     {data.editions.length?<form onSubmit={submitEvent}>
      <label>Publication record<select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Add a publication event</option>{selectedEvents.map(x=><option key={x.id} value={x.id}>{nice(x.type)} · {x.date||'No date'} · {x.publisher||'No publisher'}</option>)}</select></label>
      <label>Event<select value={eventType} onChange={e=>setEventType(e.target.value)}>{publicationTypes.map(x=><option key={x} value={x}>{nice(x)}</option>)}</select></label>
      <label>Publication date<input value={eventDate} onChange={e=>setEventDate(e.target.value)} placeholder="YYYY, YYYY-MM or YYYY-MM-DD" maxLength={10}/></label>
      <label>Find publisher<input type="search" value={publisherSearch} onChange={e=>{setPublisherSearch(e.target.value);setPublisherId('')}} placeholder="Search registered publishers"/></label>
      <label>Publisher<select value={publisherId} onChange={e=>setPublisherId(e.target.value)}><option value="">No publisher selected</option>{publisherId&&!publishers.some(p=>p.id===publisherId)&&<option value={publisherId}>{data.events.find(e=>e.publisherId===publisherId)?.publisher||'Selected publisher'}</option>}{publishers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button type="submit" disabled={saving}>{eventId?'Update publication event':'Add publication event'}</button>
     </form>:<p>Add an edition above to enter publication history.</p>}
     <form onSubmit={addPublisher} className="cs-book-metadata-subform"><label>New publisher (only if absent)<input value={newPublisher} onChange={e=>setNewPublisher(e.target.value)} maxLength={500}/></label><button type="submit" disabled={saving||newPublisher.trim().length<2}>Create publisher</button></form>
    </section>
    <section className="cs-book-metadata-panel">
     <h4>Narrators & cast</h4>
     {data.recordings.length?<><form onSubmit={submitCredit}>
      <label>Recording<select value={recordingId} onChange={e=>{setRecordingId(e.target.value);setPersonId('')}}>{data.recordings.map(r=><option value={r.id} key={r.id}>{r.title||'Recording'} · {r.id.slice(0,8)}</option>)}</select></label>
      <label>Find contributor<input type="search" value={personSearch} onChange={e=>{setPersonSearch(e.target.value);setPersonId('')}} placeholder="Search canonical contributors"/></label>
      <label>Contributor<select value={personId} onChange={e=>setPersonId(e.target.value)} required><option value="">Select a person</option>{people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}</select></label>
      <label>Credit<select value={role} onChange={e=>setRole(e.target.value)}><option value="narrator">Narrator</option><option value="cast">Cast member</option></select></label>
      <button type="submit" disabled={saving||!personId}>Add contributor</button>
     </form><div className="cs-book-metadata-existing">{selectedCredits.map(c=><div key={c.id}><span>{c.name} · {nice(c.role)}</span><button type="button" disabled={saving} onClick={()=>{if(window.confirm('Remove this recording credit?'))void mutate('removeCredit',{creditId:c.id},'Recording credit removed.')}}>Remove</button></div>)}</div></>:<p>No recordings linked yet. Create a recording before adding narrator credits.</p>}
    </section>
    <section className="cs-book-metadata-panel">
     <h4>Book genres</h4>
     <form onSubmit={submitGenre}><label>Genre<input value={genre} onChange={e=>setGenre(e.target.value)} placeholder="e.g. Historical fiction" maxLength={120} required/></label><button type="submit" disabled={saving||genre.trim().length<2}>Add genre</button></form>
     <div className="cs-book-metadata-existing">{data.genres.map(g=><div key={g.id}><span>{g.name}</span><button type="button" disabled={saving} onClick={()=>{if(window.confirm('Remove this genre from the book?'))void mutate('removeGenre',{linkId:g.id},'Genre removed.')}}>Remove</button></div>)}</div>
    </section>
   </div>
  </>}
 </div>;
}
