import {AdminModeration} from './AdminModeration';
import {OnboardingWizard} from './OnboardingWizard';
import {FavouriteOrbit} from './FavouriteOrbit';
import {useEffect,useMemo,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import {apiGet,apiWrite} from './api';

type Book={id:string;title:string;author?:string;formats?:string[]};
type ShelfItem={id:string;workId:string;editionId?:string;bookTitle:string;status:string;format?:string;progressUnit?:string;progressValue?:number;privateNote?:string;privateRating?:number;finishedAt?:string};
type Review={id:string;title?:string;bookTitle:string;bookId:string;status:string;visibility:string;storyRating?:number;audioRating?:number;body?:string;spoilers?:number;editionId?:string};
type Props={path:string;books:Book[];member:{id:string;displayName:string;verified:boolean;role?:'admin'|'moderator'|null}};
const statusLabels:Record<string,string>={want_to_read:'Want to read',in_progress:'Currently reading',paused:'Paused',finished:'Finished',dnf:'Did not finish'};
const formats=['paperback','hardback','ebook','audiobook'];
const genreOptions=['Psychological thriller','Mystery','Crime','Suspense','Literary fiction','Romance','Fantasy','Science fiction','Historical fiction','Horror','Contemporary','Non-fiction'];
function Spinner(){return <p role="status" className="muted">Loading your reading world…</p>;}
function ErrorText({message}:{message:string}){return message?<div role="alert" className="notice error">{message}</div>:null;}
function Shelf({member}:{member:Props['member']}){
  const [items,setItems]=useState<ShelfItem[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('all');
  const [term,setTerm]=useState('');
  const [editing,setEditing]=useState<ShelfItem|null>(null);
  const [saving,setSaving]=useState(false);
  const [unit,setUnit]=useState('percent');
  const [value,setValue]=useState('');
  const [status,setStatus]=useState('in_progress');
  const [note,setNote]=useState('');
  const refresh=async()=>{try{
    const result=await apiGet<{items:ShelfItem[]}>('/api/member/shelf');
    setItems(result.items);
  }catch(e){setError(e instanceof Error?e.message:'Could not load shelf');}
    finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[]);
  const counts=useMemo(()=>Object.fromEntries(Object.keys(statusLabels).map(s=>[s,items.filter(i=>i.status===s).length])),[items]);
  const displayed=items.filter(i=>(filter==='all'||i.status===filter)&&i.bookTitle.toLowerCase().includes(term.toLowerCase()));
  const edit=(item:ShelfItem)=>{setEditing(item);setUnit(item.progressUnit??(item.format==='audiobook'?'audio_minutes':'pages'));
    setValue(item.progressValue==null?'':String(item.progressValue));setStatus(item.status);setNote(item.privateNote??'');};
  const save=async(e:FormEvent)=>{e.preventDefault();if(!editing)return;setSaving(true);setError('');
    try{
      await apiWrite('/api/member/shelf/'+encodeURIComponent(editing.id),'PATCH',{
        status,progressUnit:unit,progressValue:value===''?undefined:Number(value),privateNote:note
      });
      setEditing(null);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Could not save progress');}
    finally{setSaving(false);}
  };
  return <><div className="workspace-head"><div><p className="eyebrow">Your personal library</p><h1>My Bookshelf</h1><p className="intro">A quiet space for your books, your listening, and thoughts just for you.</p></div><a className="button" href="/add-book">+ Add a book</a></div>
    {busy?<Spinner/>:<><div className="shelf-tabs" role="group" aria-label="Shelf status">{[['all','All books'],...Object.entries(statusLabels)].map(([key,label])=><button className={filter===key?'selected':''} onClick={()=>setFilter(key)} key={key}>{label} <span>{key==='all'?items.length:counts[key]}</span></button>)}</div>
    <div className="filters"><label>Find a book<input value={term} placeholder="Search my shelf" onChange={e=>setTerm(e.target.value)}/></label></div>
    {displayed.length?<div className="shelf-list">{displayed.map(item=><div className="shelf-line panel" key={item.id}><div className="mini-cover">C<span>&</span>S</div><div className="shelf-copy"><h3>{item.bookTitle}</h3><span className="tag">{statusLabels[item.status]??item.status}</span>{item.format&&<span className="muted small"> {item.format}</span>}{item.progressValue!=null&&<p className="muted small">{item.progressValue} {item.progressUnit?.replace('_',' ')}</p>}</div><button className="button secondary" onClick={()=>edit(item)}>Update progress</button></div>)}</div>:<div className="empty"><span className="ornament">✦</span><h3>{items.length?'No books match that filter':'Your shelf is waiting'}</h3><p>{items.length?'Try another status or search.':'Add your first book when a verified catalogue entry is available.'}</p><a className="button secondary" href="/add-book">Find a book</a></div>}</>}
    {editing&&<div role="presentation" className="modal-backdrop"><div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="progress-title"><h2 id="progress-title">Update your progress</h2><p className="muted">{editing.bookTitle} · Private to you</p><ErrorText message={error}/><form onSubmit={save}><label>Reading status<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Tracking unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{editing.format==='audiobook'?<><option value="audio_minutes">Audio position (minutes)</option><option value="percent">Percentage</option></>:<><option value="pages">Pages</option><option value="percent">Percentage</option></>}</select></label><label>Position (optional)<input type="number" min="0" max={unit==='percent'?100:undefined} step="1" value={value} onChange={e=>setValue(e.target.value)}/></label><label>Private thoughts<textarea rows={5} value={note} onChange={e=>setNote(e.target.value)} placeholder="Only you can see this note"/></label><div className="actions"><button className="button" type="submit" disabled={saving}>{saving?'Saving…':'Save progress'}</button><button className="button secondary" type="button" onClick={()=>setEditing(null)}>Cancel</button></div></form></div></div>}
    {!editing&&<ErrorText message={error}/>}
  </>;
}
function AddBook({books}:{books:Book[]}){
  const [term,setTerm]=useState('');const [bookId,setBookId]=useState('');
  const [status,setStatus]=useState('want_to_read');const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const found=books.filter(b=>(b.title+' '+(b.author??'')).toLowerCase().includes(term.toLowerCase()));
  const chosen=books.find(b=>b.id===bookId);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!chosen){setError('Choose a book first');return;}setBusy(true);setError('');
    try{await apiWrite('/api/member/shelf','POST',{workId:chosen.id,status,privateNote:note});setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:'Could not add book');}finally{setBusy(false);}};
  return <><p className="eyebrow">Your bookshelf · Add a book</p><h1>Every story begins somewhere.</h1><p className="intro">Find the correct work, confirm its edition, then choose how it belongs on your shelf.</p>
    {saved?<div className="panel success-panel"><h2>Added to your bookshelf</h2><p>{chosen?.title} was saved to your private shelf.</p><div className="actions"><a className="button" href="/shelf">View my bookshelf</a><button className="button secondary" onClick={()=>{setBookId('');setSaved(false);setTerm('');setNote('');}}>Add another book</button></div></div>:
    <form className="wizard" onSubmit={save}><div className="panel"><p className="eyebrow">01 / Find a book</p><label>Search by title or author<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Start typing a book title…" autoFocus/></label>
      {term&&<div className="selection-list" role="group" aria-label="Matching books">{found.length?found.map(b=><label className={'candidate '+(bookId===b.id?'chosen':'')} key={b.id}><input type="radio" name="selectedBook" checked={bookId===b.id} onChange={()=>setBookId(b.id)}/><span><strong>{b.title}</strong><small>{b.author??'Author not verified'}</small></span></label>):<p className="muted">No verified book found. You can request missing catalogue entries when the catalogue management flow is connected.</p>}</div>}</div>
      <div className="panel"><p className="eyebrow">02 / My edition & reading status</p>{chosen?<p><strong>{chosen.title}</strong> · An exact edition is not yet selected. Format-specific details cannot be assumed.</p>:<p className="muted">Choose a book above to continue.</p>}
        <label>What would you like to do?<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Private note (optional)<textarea rows={4} placeholder="Only you can see this" value={note} onChange={e=>setNote(e.target.value)}/></label></div>
      <ErrorText message={error}/><button type="submit" disabled={busy||!chosen} className="button">{busy?'Saving…':'Save to my bookshelf'}</button></form>}
  </>;
}
function MyReviews(){
  const [items,setItems]=useState<Review[]>([]);const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [tab,setTab]=useState('published');
  const refresh=async()=>{try{const v=await apiGet<{items:Review[]}>('/api/member/reviews');setItems(v.items);}catch(e){setError(e instanceof Error?e.message:'Could not load reviews');}finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[]);
  const remove=async(id:string)=>{if(!window.confirm('Remove this review? This cannot be undone.'))return;try{await apiWrite('/api/member/reviews/'+id,'DELETE');await refresh();}catch(e){setError(e instanceof Error?e.message:'Could not remove review');}};
  const shown=items.filter(r=>r.status===tab);
  return <><div className="workspace-head"><div><p className="eyebrow">What you've shared</p><h1>My Reviews</h1><p className="intro">Your public reviews and private drafts, kept clearly separate.</p></div><a className="button" href="/write-review">Write a review</a></div><div className="shelf-tabs">{['published','draft'].map(k=><button key={k} className={tab===k?'selected':''} onClick={()=>setTab(k)}>{k==='published'?'Published':'Drafts'} <span>{items.filter(r=>r.status===k).length}</span></button>)}</div>
    {busy?<Spinner/>:shown.length?<div className="shelf-list">{shown.map(r=><article key={r.id} className="panel"><p className="eyebrow">{r.status==='published'?'Published to the community':'Private draft'}</p><h3>{r.title||r.bookTitle}</h3><p>{r.bookTitle}</p><p className="muted">{r.storyRating==null?'Story not rated':`Story ★ ${r.storyRating}/5`}{r.audioRating!=null?` · Narration ${r.audioRating}/5`:''}</p><div className="actions"><a className="button secondary" href={'/write-review?id='+encodeURIComponent(r.id)}>{r.status==='draft'?'Resume draft':'Edit review'}</a>{r.status==='published'&&<a href={'/review/'+r.id} className="button secondary">View public review</a>}<button className="button quiet" onClick={()=>remove(r.id)}>Remove</button></div></article>)}</div>:<div className="empty"><h3>No {tab==='draft'?'drafts':'published reviews'} yet</h3><p>Nothing is published automatically when you finish a book.</p></div>}<ErrorText message={error}/></>;
}
function ReadingYear(){
  const [year,setYear]=useState(new Date().getFullYear());const [data,setData]=useState<{uniqueBooks:number;finishedExperiences:number;items:unknown[]}|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{setLoading(true);apiGet<{uniqueBooks:number;finishedExperiences:number;items:unknown[]}>('/api/member/reading-year?year='+year)
   .then(setData).catch(e=>setError(e instanceof Error?e.message:'Could not load year')).finally(()=>setLoading(false));},[year]);
  return <><div className="workspace-head"><div><p className="eyebrow">The year in stories</p><h1>My Reading Year</h1><p className="intro">Your personal record of the stories you've finished, in every format.</p></div><label>Year<select value={year} onChange={e=>setYear(Number(e.target.value))}>{Array.from({length:7},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y}>{y}</option>)}</select></label></div>
    {loading?<Spinner/>:<div className="year-stats"><div><span>{data?.uniqueBooks??'—'}</span><p>Unique books</p></div><div><span>{data?.finishedExperiences??'—'}</span><p>Finished experiences (including rereads)</p></div></div>}
    <div className="panel"><h3>Pages, listening and editions</h3><p>Totals are shown only when the required edition and progress information is known. Published audiobook duration is not actual elapsed listening time.</p></div><ErrorText message={error}/></>;
}
function Preferences(){
  const [formats,setFormats]=useState<string[]>([]);const [genres,setGenres]=useState<string[]>([]);const [moods,setMoods]=useState<string[]>([]);const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');const [error,setError]=useState('');
  useEffect(()=>{apiGet<{item:{format_json:string;genre_json:string;mood_json:string}|null}>('/api/member/preferences').then(v=>{if(v.item){setFormats(JSON.parse(v.item.format_json));setGenres(JSON.parse(v.item.genre_json));setMoods(JSON.parse(v.item.mood_json));}}).catch(e=>setError(e instanceof Error?e.message:'Preferences unavailable'));},[]);
  const toggle=(value:string,array:string[],setter:(v:string[])=>void)=>setter(array.includes(value)?array.filter(v=>v!==value):[...array,value]);
  const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);setError('');setNotice('');try{await apiWrite('/api/member/preferences','PUT',{formats,genres,moods,completed:true,onboardingStep:5});setNotice('Your preferences were saved to your account.');}catch(e){setError(e instanceof Error?e.message:'Could not save preferences');}finally{setSaving(false);}};
  return <><p className="eyebrow">Make it yours</p><h1>Your reading world</h1><p className="intro">Choose what you enjoy. You can change this anytime, and your preferences stay private unless you share them.</p>
   <form onSubmit={save} className="wizard"><div className="panel"><h2>How do you like to read?</h2><div className="choice-grid">{formatsOptions.map(v=><label key={v} className="choice"><input type="checkbox" checked={formats.includes(v)} onChange={()=>toggle(v,formats,setFormats)}/><span>{v}</span></label>)}</div></div><div className="panel"><h2>Which genres do you enjoy?</h2><div className="choice-grid">{genreOptions.map(v=><label className="choice" key={v}><input type="checkbox" checked={genres.includes(v)} onChange={()=>toggle(v,genres,setGenres)}/><span>{v}</span></label>)}</div></div><div className="panel"><h2>Reading moods</h2><div className="choice-grid">{['Fast-paced','Thought-provoking','Atmospheric','Emotional','Dark','Cosy','Unexpected twists','Character-led'].map(v=><label key={v} className="choice"><input type="checkbox" checked={moods.includes(v)} onChange={()=>toggle(v,moods,setMoods)}/><span>{v}</span></label>)}</div></div><ErrorText message={error}/>{notice&&<div role="status" className="notice">{notice}</div>}<button disabled={saving} className="button">{saving?'Saving…':'Save my preferences'}</button></form></>;
}
const formatsOptions=['Print books','Ebooks','Audiobooks'];
function ReviewEditor({books}:{books:Book[]}){
  const query=new URLSearchParams(window.location.search);
  const id=query.get('id');
  const [bookId,setBookId]=useState(query.get('book')??'');
  const [title,setTitle]=useState('');const [body,setBody]=useState('');
  const [storyRating,setStoryRating]=useState('');const [narrationRating,setNarrationRating]=useState('');
  const [spoilers,setSpoilers]=useState(false);
  const [preview,setPreview]=useState(false);const [savedId,setSavedId]=useState(id);
  const [published,setPublished]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const book=books.find(b=>b.id===bookId);
  useEffect(()=>{if(!id)return;apiGet<{items:Review[]}>('/api/member/reviews').then(v=>{const r=v.items.find(x=>x.id===id);
    if(!r){setError('Draft not found');return;}setBookId(r.bookId);setTitle(r.title??'');setBody(r.body??'');setStoryRating(r.storyRating==null?'':String(r.storyRating));setNarrationRating(r.audioRating==null?'':String(r.audioRating));setSpoilers(Boolean(r.spoilers));}).catch(e=>setError(e instanceof Error?e.message:'Could not load draft'));},[id]);
  const record=()=>({bookId,title,body,storyRating:storyRating===''?null:Number(storyRating),
    // Edition selection is required before narration scores; never attach narration to an unverified edition.
    audioRating:null,spoilers});
  const draft=async()=>{if(!bookId){setError('Select a book before saving');return null;}setBusy(true);setError('');
    try{if(savedId){await apiWrite('/api/member/reviews/'+savedId,'PATCH',record());return savedId;}
      const v=await apiWrite<{id:string}>('/api/member/reviews','POST',record());setSavedId(v.id);return v.id;
    }catch(e){setError(e instanceof Error?e.message:'Draft save failed');return null;}finally{setBusy(false);}};
  const publish=async()=>{const key=await draft();if(!key)return;setBusy(true);try{await apiWrite('/api/member/reviews/'+key,'PATCH',{action:'publish'});setPublished(true);}catch(e){setError(e instanceof Error?e.message:'Publish failed');}finally{setBusy(false);}};
  if(published)return <div className="panel success-panel"><p className="eyebrow">Published</p><h1>Your review is now public</h1><p>It has been confirmed by the server and can be read by the community.</p><div className="actions"><a className="button" href={'/review/'+savedId}>View my review</a><a className="button secondary" href="/my-reviews">My Reviews</a></div></div>;
  return <><p className="eyebrow">Your thoughts · {preview?'Preview':'Private draft'}</p><h1>{preview?'Before you share':'Write a review'}</h1><p className="intro">A review belongs to you. Saving a draft never makes it public; publishing is a separate action.</p><ErrorText message={error}/>
    {preview?<div className="panel review-preview"><p className="eyebrow">Not published · Preview</p><h2>{title||book?.title||'Untitled review'}</h2><p className="muted">Reviewing {book?.title??'an unselected book'}</p>{storyRating&&<p className="stars">★ Story {storyRating}/5</p>}{spoilers?<details><summary>Contains spoilers — reveal review text</summary><p className="article-body">{body}</p></details>:<p className="article-body">{body}</p>}<div className="actions"><button className="button secondary" onClick={()=>setPreview(false)}>Back to editing</button><button className="button" onClick={publish} disabled={busy}>{busy?'Working…':'Publish review'}</button></div></div>:<div className="wizard"><div className="panel"><label>Book<select value={bookId} onChange={e=>setBookId(e.target.value)}><option value="">Choose a book</option>{books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label><p className="small muted">Narration rating will be available after selecting a verified audiobook recording. No audio scores are assigned to print or ebook formats.</p></div><div className="panel"><label>Story rating (optional)<select value={storyRating} onChange={e=>setStoryRating(e.target.value)}><option value="">Not rated</option>{Array.from({length:11},(_,i)=>i*.5).map(n=><option key={n} value={n}>{n}/5</option>)}</select></label><label>Review title (optional)<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="A few words to sum it up"/></label><label>Your public review (optional for rating-only)<textarea rows={10} value={body} onChange={e=>setBody(e.target.value)} placeholder="What did you think?"/></label><label className="choice"><input type="checkbox" checked={spoilers} onChange={e=>setSpoilers(e.target.checked)}/><span>This review contains spoilers</span></label></div><div className="actions"><button className="button secondary" disabled={busy} onClick={()=>{void draft();}}>Save private draft</button><button className="button" onClick={()=>setPreview(true)}>Preview review</button></div></div>}</>;
}
function AccountPanel({member}:{member:Props['member']}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const signOut=async()=>{setBusy(true);setError('');try{
    const response=await fetch('/api/auth/sign-out',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!response.ok)throw Error('Could not sign out. Please try again.');
    window.location.assign('/');
  }catch(e){setError(e instanceof Error?e.message:'Sign out failed')}finally{setBusy(false)}};
  return <section className="member-account"><p className="eyebrow">Your Chapter & Sound account</p><h1>Account & privacy</h1>
    <div className="panel"><h2>{member.displayName}</h2><p>Your email address has been verified. Your reading records are private unless you choose to publish or share them.</p>
    {member.role==='admin'&&<p><strong>Site administrator</strong> · Your verified account has administrator access.</p>}
    {member.role==='moderator'&&<p><strong>Community moderator</strong></p>}
    <div className="actions"><a className="button secondary" href="/preferences">Reading preferences</a><a className="button secondary" href="/onboarding">Personalise my account</a>{member.role&&<a className="button" href="/admin">Open administration</a>}</div>
    </div><div className="panel"><h2>Sign out</h2><p>You can safely end your current session on this device.</p>{error&&<div role="alert" className="notice error">{error}</div>}<button className="button secondary" disabled={busy} type="button" onClick={signOut}>{busy?'Signing out…':'Sign out'}</button></div>
  </section>;
}
export function MemberWorkspace({path,books,member}:Props){
  if(!member.verified)return <div className="empty"><h1>Email verification required</h1><p>Verify your address before accessing private reading records.</p><a className="button secondary" href="/verify">Check verification</a></div>;
  if(path==='/account')return <AccountPanel member={member}/>;
  if(path==='/shelf')return <Shelf member={member}/>;
  if(path==='/add-book')return <AddBook books={books}/>;
  if(path==='/my-reviews')return <MyReviews/>;
  if(path==='/reading-year')return <ReadingYear/>;
  if(path==='/onboarding')return <OnboardingWizard member={member}/>;
  if(path==='/preferences')return <><Preferences/><div className="favourite-edit"><FavouriteOrbit role="author"/><FavouriteOrbit role="narrator"/></div></>;
  if(path==='/write-review')return <ReviewEditor books={books}/>;
  if(path==='/admin')return <AdminModeration/>;
  return <div className="panel"><h1>{path==='/account'?'My Account':path==='/admin'?'Administration':'Your reading journal'}</h1><p>This section needs its remaining secure controls. Your member session is active, and private data is never exposed to anonymous visitors.</p><a className="button secondary" href="/shelf">My bookshelf</a></div>;
}
