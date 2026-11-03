import {useEffect,useState} from 'react';
import {apiGet,apiWrite} from './api';

export type Person={id:string;name:string;role:'author'|'narrator';portraitUrl?:string};
type Props={role:'author'|'narrator';heading?:string;description?:string};
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()??'').join('')||'?';}
export function FavouriteOrbit({role,heading,description}:Props){
  const [selected,setSelected]=useState<Person[]>([]);
  const [matches,setMatches]=useState<Person[]>([]);
  const [term,setTerm]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{apiGet<{items:Person[]}>('/api/member/favourites').then(v=>setSelected(v.items.filter(p=>p.role===role))).catch(e=>setError(e instanceof Error?e.message:'Unable to load favourites')).finally(()=>setLoading(false));},[role]);
  useEffect(()=>{if(term.trim().length<2){setMatches([]);return;}let cancelled=false;const timer=setTimeout(()=>{
    apiGet<{items:Person[]}>('/api/people?role='+role+'&q='+encodeURIComponent(term.trim())+'&limit=15')
      .then(v=>{if(!cancelled)setMatches(v.items);})
      .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Search unavailable');});
  },220);return()=>{cancelled=true;clearTimeout(timer);};},[term,role]);
  const add=async(person:Person)=>{setBusy(true);setError('');try{await apiWrite('/api/member/favourites','POST',{role,personId:person.id});setSelected(s=>s.some(p=>p.id===person.id)?s:[...s,person]);}catch(e){setError(e instanceof Error?e.message:'Could not save favourite');}finally{setBusy(false);}};
  const remove=async(person:Person)=>{setBusy(true);setError('');try{await apiWrite('/api/member/favourites/'+role+'/'+encodeURIComponent(person.id),'DELETE');setSelected(s=>s.filter(p=>p.id!==person.id));}catch(e){setError(e instanceof Error?e.message:'Could not remove favourite');}finally{setBusy(false);}};
  return <div className="orbit-layout"><div className="orbit-search-column"><p className="eyebrow">Your reading world · {role==='author'?'Favourite authors':'Favourite narrators'}</p><h2>{heading??(role==='author'?'Whose stories do you love?':'Which voices stay with you?')}</h2><p className="intro">{description??'Choose as many as you like. You can come back and change these later.'}</p>
    <label>Find {role==='author'?'an author':'a narrator'}<input autoComplete="off" value={term} onChange={e=>setTerm(e.target.value)} placeholder={role==='author'?'Start typing an author…':'Start typing a narrator…'}/></label>
    <div role="status" className="sr-only" aria-live="polite">{selected.length} {role}s selected</div>
    {term.length>=2&&<div className="people-results" role="listbox" aria-label={role==='author'?'Matching authors':'Matching narrators'}>
      {matches.length?matches.map(person=>{const chosen=selected.some(x=>x.id===person.id);return <button type="button" key={person.id} className={'people-result '+(chosen?'chosen':'')} disabled={busy} aria-selected={chosen} role="option" onClick={()=>chosen?remove(person):add(person)}><span className="portrait-mini" aria-hidden="true">{initials(person.name)}</span><span className="person-name">{person.name}</span><span className="add-indicator" aria-hidden="true">{chosen?'✓ Selected':'＋'}</span></button>;}):<p className="small muted">No matching verified people. A request for a missing name can be made when the catalogue-request flow is enabled.</p>}
    </div>}
    <p className="small muted">{loading?'Loading selections…':`${selected.length} ${role}s selected · No maximum`}</p>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <div className="selected-people"><h3>Selected {role}s</h3>{selected.length?<ul>{selected.map(p=><li key={p.id}><span>{p.name}</span><button type="button" disabled={busy} onClick={()=>remove(p)} aria-label={'Remove '+p.name}>Remove ×</button></li>)}</ul>:<p className="muted small">Still discovering who you love? You can leave this empty.</p>}</div>
  </div><div className="orbit-display"><div className={'orbit-ring '+(selected.length>8?'orbit-many':'')} aria-label={`${selected.length} selected ${role}s`}>
    <div className="orbit-centre"><div className="orbit-mark">✦</div><span>Your<br/>reading world</span></div>
    {selected.slice(0,8).map((person,i)=>{const angle=(i/Math.max(Math.min(selected.length,8),1))*Math.PI*2-Math.PI/2;const x=50+Math.cos(angle)*39;const y=50+Math.sin(angle)*39;return <div className="orbit-person" style={{left:x+'%',top:y+'%'}} key={person.id}><span className="orbit-portrait" aria-hidden="true">{person.portraitUrl?<img src={person.portraitUrl} alt=""/>:initials(person.name)}</span><span className="orbit-name">{person.name}</span><button type="button" className="orbit-remove" onClick={()=>remove(person)} disabled={busy} aria-label={'Remove '+person.name}>×</button></div>;})}
  </div>{selected.length>8&&<p className="muted small orbit-extra">+ {selected.length-8} more selected. All names remain accessible in the list.</p>}</div></div>;
}
