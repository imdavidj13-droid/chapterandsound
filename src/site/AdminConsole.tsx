import {useCallback,useEffect,useState} from 'react';
import {apiGet,apiWrite} from './api';
import {AdminModeration} from './AdminModeration';

type Tab='overview'|'members'|'books'|'editions'|'people'|'reviews'|'reports'|'community'|'requests'|'notices'|'settings'|'audit';
type Row=Record<string,unknown>;
type Overview={counts:Record<string,number>;environment:{signupMode:string;mailConfigured:boolean;origin?:string}};
const tabs:{id:Tab;name:string;symbol:string}[]=[
 {id:'overview',name:'Overview',symbol:'▦'}, {id:'members',name:'Members',symbol:'♙'},
 {id:'books',name:'Books',symbol:'▤'}, {id:'editions',name:'Editions',symbol:'▥'},
 {id:'people',name:'Authors & narrators',symbol:'♧'}, {id:'reviews',name:'Reviews',symbol:'✎'},
 {id:'reports',name:'Moderation',symbol:'⚑'}, {id:'community',name:'Community',symbol:'☷'},
 {id:'requests',name:'Book requests',symbol:'◇'}, {id:'notices',name:'Announcements',symbol:'✧'},
 {id:'settings',name:'Site settings',symbol:'⚙'}, {id:'audit',name:'Audit log',symbol:'↺'}
];
const names:Record<string,string>={members:'Members',verifiedMembers:'Verified accounts',books:'Books',editions:'Editions',contributors:'Contributors',publishedReviews:'Published reviews',openReports:'Open reports',discussions:'Discussions',clubs:'Book clubs',challenges:'Challenges',missingRequests:'Missing book requests'};
const fields:Partial<Record<Tab,string[]>>={
 members:['handle','displayName','verified','role','shelfCount','publicReviews','joinedAt'],
 books:['title','authors','editionCount','firstPublished','verificationStatus','updatedAt'],
 editions:['bookTitle','format','publisher','isbn13','language','verificationStatus'],
 people:['name','authored','narrated','biography'],
 reviews:['title','bookTitle','authorHandle','status','visibility','storyRating','publishedAt'],
 community:['kind','title','status','authorHandle','createdAt'],
 requests:['title','author','format','state','createdAt'],
 notices:['title','visibility','updatedAt'],
 settings:['key','json','updatedAt'],
 audit:['actorHandle','action','entityType','entityId','reason','createdAt'],
 reports:['contentType','contentId','state','reporterHandle','createdAt']
};
const format=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v);
const nice=(s:string)=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
export function AdminConsole(){
 const [tab,setTab]=useState<Tab>('overview'),[overview,setOverview]=useState<Overview|null>(null);
 const [items,setItems]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [notice,setNotice]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0);
 const [busy,setBusy]=useState(false),[createOpen,setCreateOpen]=useState(false),[editId,setEditId]=useState('');
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[reason,setReason]=useState('');
 const [visibility,setVisibility]=useState('draft'),[menuOpen,setMenuOpen]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   if(tab==='overview')setOverview(await apiGet<Overview>('/api/admin/overview'));
   else if(tab!=='reports'||!menuOpen){
    const qs=new URLSearchParams({limit:'40',offset:String(offset)});
    if(query&&['members','books','editions','people'].includes(tab))qs.set('q',query);
    const result=await apiGet<{items:Row[]}>('/api/admin/'+tab+'?'+qs);
    setItems(result.items||[]);
   }
  }catch(e){setError(e instanceof Error?e.message:'Unable to load administration data')}
  finally{setLoading(false)}
 },[tab,query,offset,menuOpen]);
 useEffect(()=>{void load()},[load]);
 const changeTab=(next:Tab)=>{setTab(next);setQuery('');setOffset(0);setNotice('');setEditId('');setCreateOpen(false);setMenuOpen(false)};
 async function action(section:string,method:'POST'|'PATCH',data:Record<string,unknown>,confirm?:string){
  if(confirm&&!window.confirm(confirm))return;
  setBusy(true);setError('');setNotice('');
  try{
   await apiWrite('/api/admin/'+section,method,{...data,reason});
   setNotice('Changes saved to D1 and recorded in the administration audit log.');
   setCreateOpen(false);setEditId('');setTitle('');setBody('');setReason('');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save changes')}
  finally{setBusy(false)}
 }
 const beginEdit=(row:Row)=>{setEditId(String(row.id));setTitle(String(row.title??row.name??''));setBody(String(row.body??row.biography??''));setVisibility(String(row.visibility??'draft'));setReason('')};
 const onCreate=()=>{if(tab==='books')void action('books','POST',{title});
  if(tab==='people')void action('people','POST',{name:title,biography:body});
  if(tab==='notices')void action('notices','POST',{title,body});};
 const onSave=(row:Row)=>{
  const rowId=encodeURIComponent(String(row.id));
  if(tab==='books'||tab==='editions')void action(tab+'/'+rowId,'PATCH',{verificationStatus:visibility});
  if(tab==='people')void action('people/'+rowId,'PATCH',{biography:body});
  if(tab==='requests')void action('requests/'+rowId,'PATCH',{state:visibility});
  if(tab==='notices')void action('notices/'+rowId,'PATCH',{title,body,visibility});
  if(tab==='reviews')void action('reviews/'+rowId,'PATCH',{action:'remove'},'Remove this public review? This action is audited.');
 };
 const createAllowed=['books','people','notices'].includes(tab);
 const selected=tabs.find(x=>x.id===tab)!;
 return <div className="cs-admin-shell">
  <a className="cs-admin-skip" href="#admin-main">Skip to admin content</a>
  <aside className={'cs-admin-nav'+(menuOpen?' open':'')}>
   <a className="cs-admin-brand" href="/admin">Chapter <em>&</em> Sound <small>CONTROL CENTRE</small></a>
   <p className="cs-admin-nav-label">MANAGEMENT</p>
   <nav aria-label="Administration modules">{tabs.map(x=><button type="button" key={x.id} className={tab===x.id?'active':''} aria-current={tab===x.id?'page':undefined} onClick={()=>changeTab(x.id)}><span aria-hidden="true">{x.symbol}</span>{x.name}</button>)}</nav>
   <div className="cs-admin-nav-end"><p>Owner-only access · Live database</p><a href="/account">← Return to my account</a><a href="/">View public website</a></div>
  </aside>
  {menuOpen&&<button className="cs-admin-overlay" aria-label="Close administration navigation" onClick={()=>setMenuOpen(false)}/>}
  <div className="cs-admin-workspace">
   <header className="cs-admin-topbar"><button className="cs-admin-menu" aria-label="Open administration navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>☰</button><div><strong>Chapter & Sound</strong><span> / Administration / {selected.name}</span></div><div className="cs-admin-live"><i/> Production</div><a href="/account">My account</a></header>
   <main id="admin-main" className="cs-admin-main">
    <div className="cs-admin-heading"><div><p className="cs-admin-eyebrow">SITE OPERATIONS</p><h1>{selected.name}</h1><p>Manage live Chapter & Sound content and community operations.</p></div><div className="cs-admin-actions"><button type="button" disabled={loading} onClick={()=>void load()}>↻ Refresh</button>{createAllowed&&<button className="primary" type="button" onClick={()=>{setTitle('');setBody('');setReason('');setCreateOpen(!createOpen)}}>{createOpen?'Close':'+ Add '+(tab==='books'?'book':tab==='people'?'person':'announcement')}</button>}</div></div>
    {error&&<p className="cs-admin-error" role="alert">{error}</p>}{notice&&<p className="cs-admin-success" role="status">{notice}</p>}
    {createOpen&&<section className="cs-admin-form" aria-label={'Create '+tab}><h2>Create {tab==='people'?'contributor':tab==='books'?'book record':'announcement'}</h2><p>New records are saved to the real database. Book records start unverified and notices start as drafts.</p><label>{tab==='people'?'Name':'Title'}<input value={title} maxLength={250} onChange={e=>setTitle(e.target.value)}/></label>{tab!=='books'&&<label>{tab==='people'?'Biography':'Notice text'}<textarea value={body} rows={4} maxLength={5000} onChange={e=>setBody(e.target.value)}/></label>}<label>Internal audit reason<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Why is this being added?"/></label><div className="cs-admin-actions"><button type="button" onClick={()=>setCreateOpen(false)}>Cancel</button><button className="primary" type="button" disabled={busy||title.trim().length<2} onClick={onCreate}>Save record</button></div></section>}
    {tab==='overview'?loading?<p role="status">Loading live site metrics…</p>:overview&&<><section className="cs-admin-metrics" aria-label="Live site metrics">{Object.entries(names).map(([key,label])=><div key={key} className="cs-admin-metric"><span>{label}</span><strong>{Number(overview.counts[key]??0).toLocaleString('en-GB')}</strong></div>)}</section><section className="cs-admin-quick"><div><h2>Website readiness</h2><dl><dt>Registration</dt><dd>{overview.environment.signupMode==='public'?'Public':'Owner-only'}</dd><dt>Email service</dt><dd>{overview.environment.mailConfigured?'Configured':'Not configured'}</dd><dt>Origin</dt><dd>{overview.environment.origin||'Unknown'}</dd></dl></div><div><h2>Quick access</h2>{(['members','books','reviews','reports','settings','audit'] as Tab[]).map(t=><button key={t} onClick={()=>changeTab(t)}>{tabs.find(x=>x.id===t)?.name} →</button>)}</div></section></>:null}
    {tab==='reports'&&<AdminModeration/>}
    {tab!=='overview'&&tab!=='reports'&&<>
     <div className="cs-admin-table-tools">{['members','books','editions','people'].includes(tab)&&<label>Search records<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}} placeholder="Search live records"/></label>}<span>{loading?'Loading…':items.length+' records in this page'}</span></div>
     <div className="cs-admin-data">{loading?<p role="status">Loading {selected.name.toLowerCase()}…</p>:items.length===0?<div className="cs-admin-empty"><h2>No records found</h2><p>No database records match this view.</p></div>:<div className="cs-admin-table-scroll"><table><thead><tr>{fields[tab]?.map(k=><th key={k}>{nice(k)}</th>)}{['books','editions','people','requests','notices','reviews'].includes(tab)&&<th>Manage</th>}</tr></thead><tbody>{items.map((row,i)=><tr key={String(row.id??row.key??i)}>{fields[tab]?.map(key=><td key={key}>{key==='title'&&tab==='books'?<a href={'/book/'+encodeURIComponent(String(row.id))}>{format(row[key])}</a>:key==='authorHandle'&&row[key]?<a href={'/reader/'+encodeURIComponent(String(row[key]))}>@{String(row[key])}</a>:<span title={String(row[key]??'')}>{format(row[key])}</span>}</td>)}{['books','editions','people','requests','notices','reviews'].includes(tab)&&<td><button type="button" onClick={()=>beginEdit(row)}>{editId===String(row.id)?'Close':'Manage'}</button></td>}</tr>).flatMap((row,i)=>{const item=items[i]!;return editId===String(item.id)?[row,<tr className="cs-admin-edit-row" key={String(item.id)+'-edit'}><td colSpan={(fields[tab]?.length??0)+1}><div className="cs-admin-form inline"><h3>Manage {tab==='reviews'?'review':tab.slice(0,-1)}</h3>{tab==='books'||tab==='editions'?<label>Verification status<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="unverified">Unverified</option><option value="needs_review">Needs review</option><option value="verified">Verified</option></select></label>:tab==='people'?<label>Biography<textarea rows={5} value={body} onChange={e=>setBody(e.target.value)}/></label>:tab==='requests'?<label>Request state<select value={visibility} onChange={e=>setVisibility(e.target.value)}>{['pending','reviewing','resolved','dismissed'].map(x=><option key={x}>{x}</option>)}</select></label>:tab==='notices'?<><label>Title<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Body<textarea value={body} onChange={e=>setBody(e.target.value)} rows={5}/></label><label>Publication<select value={visibility} onChange={e=>setVisibility(e.target.value)}>{['draft','published','archived'].map(x=><option key={x}>{x}</option>)}</select></label></>:<p>Removal hides this review from public pages and is recorded in the audit log.</p>}<label>Audit reason<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder={tab==='reviews'?'Required: at least 10 characters':'Optional operational note'}/></label><div className="cs-admin-actions"><button disabled={busy} onClick={()=>setEditId('')}>Cancel</button><button className="primary" disabled={busy||(tab==='reviews'&&reason.trim().length<10)} onClick={()=>onSave(item)}>{busy?'Saving…':tab==='reviews'?'Remove review':'Save changes'}</button></div></div></td></tr>]:[row]})}</tbody></table></div>}</div>
     <div className="cs-admin-pager"><button disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-40))}>← Previous</button><span>Page {Math.floor(offset/40)+1}</span><button disabled={loading||items.length<40} onClick={()=>setOffset(offset+40)}>Next →</button></div>
     {tab==='settings'&&<p className="cs-admin-hint">Sensitive runtime settings such as administrator email, authentication secrets and public registration cannot be changed here. This first console version shows current settings read-only.</p>}
    </>}
   </main>
  </div>
 </div>;
}
