import {useEffect,useState} from 'react';
import {apiGet} from './api';

interface Person{id:string;name:string;biography?:string;portraitUrl?:string|null;isAuthor?:number;isNarrator?:number;}
interface Work{id:string;title:string;contribution?:string;format?:string;workId?:string;sequenceNumber?:number;label?:string;}
type Props={path:string};
function portrait(name:string){return <div className="person-portrait" aria-hidden="true">{name.split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')}</div>;}
function Directory({role}:{role:'author'|'narrator'}){
  const [items,setItems]=useState<Person[]>([]);const [term,setTerm]=useState('');const [busy,setBusy]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{let cancelled=false;setBusy(true);const timer=setTimeout(()=>{
    apiGet<{items:Person[]}>('/api/people?role='+role+'&q='+encodeURIComponent(term)+'&limit=60')
      .then(v=>{if(!cancelled){setItems(v.items);setError('');}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Directory unavailable');})
      .finally(()=>{if(!cancelled)setBusy(false);});
  },160);return()=>{cancelled=true;clearTimeout(timer);};},[role,term]);
  return <><p className="eyebrow">The people behind the stories</p><h1>{role==='author'?'Our authors':'Our narrators'}</h1><p className="intro">{role==='author'?'Explore each author’s books, from established favourites to newly published stories.':'Discover the performers who bring audiobooks to life, and find their recordings.'}</p>
   <label className="search-field">{role==='author'?'Search authors':'Search narrators'}<input value={term} onChange={e=>setTerm(e.target.value)} placeholder={'Find a '+role+' by name'}/></label>
   {error&&<div className="notice error" role="alert">{error}</div>}
   {busy?<p role="status">Searching verified people…</p>:items.length?<div className="people-grid">{items.map(person=><a key={person.id} className="panel person-tile" href={'/person/'+encodeURIComponent(person.id)}>{portrait(person.name,person.portraitUrl)}<h3>{person.name}</h3><p>{person.isAuthor&&person.isNarrator?'Author & narrator':role==='author'?'Author':'Narrator'}</p><span className="inline-link">View profile →</span></a>)}</div>:<div className="empty"><h3>Not in the directory yet</h3><p>No verified {role}s match your search. We won't substitute someone with a similar name.</p></div>}
  </>;
}
function PersonProfile({id}:{id:string}){
  const [person,setPerson]=useState<Person|null>(null);const [works,setWorks]=useState<Work[]>([]);const [recordings,setRecordings]=useState<Work[]>([]);const [error,setError]=useState('');
  useEffect(()=>{apiGet<{person:Person;works:Work[];recordings:Work[]}>('/api/person/'+encodeURIComponent(id))
    .then(v=>{setPerson(v.person);setWorks(v.works);setRecordings(v.recordings);})
    .catch(e=>setError(e instanceof Error?e.message:'Person not found'));},[id]);
  return <><p className="eyebrow"><a href="/authors">← People directory</a></p>{person?<><div className="person-profile-hero">{portrait(person.name)}<div><p className="eyebrow">Contributor profile</p><h1>{person.name}</h1><p className="intro">{person.biography??'A verified biography has not been provided yet.'}</p></div></div><div className="section no-pad"><h2>Books by {person.name}</h2>{works.length?<div className="bibliography">{works.map(w=><a href={'/book/'+w.id} key={w.id} className="bibliography-line"><span>{w.title}</span><span className="inline-link">View book →</span></a>)}</div>:<p>No verified author credits are available.</p>}<h2 className="with-margin">Narrated editions</h2>{recordings.length?<div className="bibliography">{recordings.map(r=><a href={'/book/'+r.workId} key={r.id} className="bibliography-line"><span>{r.title} <span className="tag">Audiobook</span></span><span className="inline-link">See recording →</span></a>)}</div>:<p>No verified narrator credits are available.</p>}</div></>:<div className="empty"><h3>Profile not available</h3><p>{error||'Loading person information…'}</p></div>}</>;
}
function SeriesIndex(){
  const [items,setItems]=useState<Array<{id:string;title:string;description?:string;bookCount:number}>>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{apiGet<{items:typeof items}>('/api/series').then(v=>setItems(v.items)).catch(e=>setError(e instanceof Error?e.message:'Series unavailable')).finally(()=>setLoading(false));},[]);
  return <><p className="eyebrow">One book leads to another</p><h1>Series guides</h1><p className="intro">Follow an author's stories in their intended reading order without confusing editions or formats.</p>{loading?<p>Loading series…</p>:items.length?<div className="community-list">{items.map(s=><a key={s.id} href={'/series/'+s.id} className="panel community-item"><h3>{s.title}</h3><p>{s.description}</p><p className="muted">{s.bookCount} titles</p><span className="inline-link">View reading order →</span></a>)}</div>:<div className="empty"><h3>No verified series yet</h3><p>Series and reading orders will appear here when the catalogue is ready.</p></div>}{error&&<div className="notice error">{error}</div>}</>;
}
function SeriesDetail({id}:{id:string}){
 const [data,setData]=useState<{series:{title:string;description?:string};books:Work[]}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{apiGet<{series:{title:string;description?:string};books:Work[]}>('/api/series/'+encodeURIComponent(id)).then(setData).catch(e=>setError(e instanceof Error?e.message:'Series unavailable'));},[id]);
 return <><p className="eyebrow"><a href="/series">← Series guides</a></p>{data?<><h1>{data.series.title}</h1><p className="intro">{data.series.description??'Read the books in order.'}</p><div className="bibliography">{data.books.map(w=><a key={w.id} className="bibliography-line" href={'/book/'+w.id}><span><span className="series-order">{w.sequenceNumber??'—'}</span>{w.title} {w.label&&<span className="muted">({w.label})</span>}</span><span className="inline-link">Choose format →</span></a>)}</div></>:<div className="empty"><h3>{error||'Loading series…'}</h3></div>}</>;
}
export function PeopleAndSeries({path}:Props){
 if(path==='/authors')return <Directory role="author"/>;
 if(path==='/narrators')return <Directory role="narrator"/>;
 if(path==='/series')return <SeriesIndex/>;
 if(path.startsWith('/person/'))return <PersonProfile id={decodeURIComponent(path.slice(8))}/>;
 if(path.startsWith('/series/'))return <SeriesDetail id={decodeURIComponent(path.slice(8))}/>;
 return null;
}
