import {useEffect,useState} from 'react';
import {apiGet,apiWrite} from './api';

type Report={
 id:string;contentType:string;contentId:string;reason:string;state:string;createdAt:string;
 reporterName:string;reviewTitle:string|null;bookTitle:string|null;
};
export function AdminModeration(){
 const [reports,setReports]=useState<Report[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState<string|null>(null);
 const [note,setNote]=useState<Record<string,string>>({});
 const [completed,setCompleted]=useState(0);
 async function load(){
  try{
   const result=await apiGet<{items:Report[]}>('/api/moderation/reports');
   setReports(result.items);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load moderation reports')}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);
 async function handle(id:string,action:'dismiss'|'hide_review'){
  if(action==='hide_review'&&!window.confirm('Hide this public review? This also removes it from the author’s published reviews.'))return;
  setSaving(id);setError('');
  try{
   await apiWrite('/api/moderation/reports/'+encodeURIComponent(id),'PATCH',{action,reason:note[id]??''});
   setReports(items=>items.filter(x=>x.id!==id));setCompleted(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to handle this report')}
  finally{setSaving(null)}
 }
 return <section className="moderation-workspace">
  <div className="workspace-head"><div><p className="eyebrow">Chapter & Sound · restricted access</p><h1>Moderation</h1><p className="intro">Review reported content and record clear, auditable decisions. This area requires server-assigned moderator permission.</p></div></div>
  {loading?<p role="status">Loading moderation queue…</p>:null}
  {error&&<div className="notice error" role="alert">{error}</div>}
  {completed>0&&<div className="notice" role="status">{completed} report{completed===1?'':'s'} handled in this session.</div>}
  {!loading&&!error&&!reports.length&&<div className="empty"><h2>Nothing needs reviewing</h2><p>There are no open reports in the moderation queue.</p></div>}
  <div className="moderation-list">{reports.map(report=><article className="panel" key={report.id}>
   <p className="eyebrow">{report.contentType.replaceAll('_',' ')} · Open report</p>
   <h2>{report.reviewTitle||report.bookTitle||'Reported community content'}</h2>
   <p className="muted small">Reported by {report.reporterName} · {new Date(report.createdAt.replace(' ','T')+'Z').toLocaleDateString('en-GB')}</p>
   <blockquote>{report.reason}</blockquote>
   {report.contentType==='review'&&<p><a className="inline-link" href={'/review/'+encodeURIComponent(report.contentId)} target="_blank" rel="noopener noreferrer">Inspect the public review</a></p>}
   <label>Internal moderation note (optional)<textarea rows={3} maxLength={1000} value={note[report.id]??''} onChange={e=>setNote(notes=>({...notes,[report.id]:e.target.value}))} placeholder="Why was this decision made?"/></label>
   <div className="actions"><button type="button" className="button secondary" disabled={saving!==null} onClick={()=>handle(report.id,'dismiss')}>Dismiss report</button>
    {report.contentType==='review'&&<button type="button" className="button" disabled={saving!==null} onClick={()=>handle(report.id,'hide_review')}>Hide review</button>}
   </div>
  </article>)}</div>
 </section>;
}
