import {useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';

type RequestRecord={id:string;title:string;author:string|null;format:string|null;state:string;createdAt:string};
export function MissingBookRequests({initialTitle='',compact=false}:{initialTitle?:string;compact?:boolean}){
 const [title,setTitle]=useState(initialTitle),[author,setAuthor]=useState(''),[format,setFormat]=useState('unknown');
 const [notes,setNotes]=useState(''),[saving,setSaving]=useState(false),[show,setShow]=useState(false);
 const [error,setError]=useState(''),[result,setResult]=useState(''),[items,setItems]=useState<RequestRecord[]>([]);
 const refresh=async()=>{try{const r=await apiGet<{items:RequestRecord[]}>('/api/member/missing-book-requests');setItems(r.items??[]);}catch(e){setError(e instanceof Error?e.message:'Could not load requests')}};
 async function submit(e:FormEvent){e.preventDefault();setError('');setResult('');setSaving(true);
  try{
   const res=await apiWrite<{id:string;saved?:boolean;alreadyRequested?:boolean}>('/api/member/missing-book-requests','POST',{title,author,format,notes});
   setResult(res.alreadyRequested?'You have already requested this book. Your existing request is still being reviewed.':'Your request was saved to the Chapter & Sound database for review.');
   setTitle('');setAuthor('');setNotes('');setFormat('unknown');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Could not save request')}
  finally{setSaving(false)}
 }
 return <section className={'missing-book-request'+(compact?' compact':'')}>
  <button type="button" className="inline-link" onClick={()=>{setTitle(v=>v||initialTitle);setShow(v=>!v);if(!show)void refresh()}} aria-expanded={show}>{show?'Close request form':'Can’t find your book? Request it →'}</button>
  {show&&<div className="panel missing-book-panel">
   <h2>Request a missing book</h2>
   <p>Tell us what is missing. The request is stored in your account and appears in the administrator review queue. A request does not create unverified book data automatically.</p>
   <form onSubmit={submit} className="missing-book-fields">
    <label>Book title<input required minLength={2} maxLength={250} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Exact title if known"/></label>
    <label>Author (optional)<input maxLength={180} value={author} onChange={e=>setAuthor(e.target.value)}/></label>
    <label>Format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="unknown">Not sure</option><option value="paperback">Paperback</option><option value="hardback">Hardback</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></label>
    <label>Additional details (optional)<textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Publisher, ISBN, narrator, edition or other identifying details"/></label>
    <button type="submit" disabled={saving||title.trim().length<2} className="button">{saving?'Saving…':'Submit request'}</button>
   </form>
   {error&&<p className="notice error" role="alert">{error}</p>}
   {result&&<p role="status" className="notice">{result}</p>}
   {items.length>0&&<div className="request-history"><h3>Your requests</h3><ul>{items.slice(0,10).map(x=><li key={x.id}><strong>{x.title}</strong> <span className="tag">{x.state}</span></li>)}</ul></div>}
  </div>}
 </section>;
}
