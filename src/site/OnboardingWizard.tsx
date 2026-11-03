import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {FavouriteOrbit} from './FavouriteOrbit';
import {apiGet,apiWrite} from './api';

const genres=['Thriller','Mystery','Crime','Fantasy','Romance','Literary fiction','Science fiction','Historical','Horror','Contemporary','Non-fiction'];
type Props={member:{displayName:string;verified:boolean}};
function toggle(current:string[],value:string,setter:(v:string[])=>void){setter(current.includes(value)?current.filter(x=>x!==value):[...current,value]);}
export function OnboardingWizard({member}:Props){
  const [step,setStep]=useState(0);
  const [name,setName]=useState(member.displayName==='New Reader'?'':member.displayName);
  const [formats,setFormats]=useState<string[]>([]);
  const [selectedGenres,setGenres]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const hasAudio=formats.includes('Audiobooks');
  const steps=['Your profile','Reading taste','Favourite authors',...(hasAudio?['Favourite narrators']:[]),'Welcome'];
  const finalIndex=steps.length-1;
  useEffect(()=>{apiGet<{item:{format_json:string;genre_json:string;onboarding_step:number;onboarding_completed_at:string|null}|null}>('/api/member/preferences').then(v=>{
    if(v.item){setFormats(JSON.parse(v.item.format_json));setGenres(JSON.parse(v.item.genre_json));setStep(Math.min(v.item.onboarding_step??0,4));}
  }).catch(()=>{}).finally(()=>setLoaded(true));},[]);
  const persist=async(next:number,complete=false)=>{
    setBusy(true);setError('');
    try{
      if(step===0&&name.trim()&&name.trim()!==member.displayName){
        await apiWrite('/api/auth/update-user','POST',{name:name.trim()});
      }
      await apiWrite('/api/member/preferences','PUT',{formats,genres:selectedGenres,moods:[],onboardingStep:next,completed:complete});
      setStep(next);
    }catch(e){setError(e instanceof Error?e.message:'Could not save your preferences. Your choices are still on this screen.');}
    finally{setBusy(false);}
  };
  const next=async()=>{await persist(Math.min(step+1,finalIndex),step+1>=finalIndex);};
  const back=()=>setStep(s=>Math.max(0,s-1));
  if(!loaded)return <p role="status">Loading your setup…</p>;
  return <div className="onboarding"><div className="onboarding-progress"><span>PERSONALISE YOUR READING WORLD</span><div className="onboarding-steps" role="progressbar" aria-valuemin={1} aria-valuemax={finalIndex} aria-valuenow={Math.min(step+1,finalIndex)} aria-label="Personalisation progress">{steps.slice(0,finalIndex).map((_,i)=><i key={i} className={i<=step?'filled':''}/>)}</div><span>{step>=finalIndex?'COMPLETE':`STEP ${step+1} OF ${finalIndex}`}</span></div>
    {step===0&&<div className="onboarding-stage"><p className="eyebrow">First, a little about you</p><h1>Make yourself at home.</h1><p className="intro">What should the community call you? This is the name shown alongside reviews you choose to publish.</p><div className="profile-preview"><div className="avatar-large">{(name.trim()||'R').slice(0,1).toUpperCase()}</div><label>Your display name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" maxLength={80}/></label></div><p className="muted small">A profile image can be added later, once secure uploads are configured.</p></div>}
    {step===1&&<div className="onboarding-stage"><p className="eyebrow">Your kind of reading</p><h1>What feels like a good story?</h1><p className="intro">Choose one or many, or leave everything blank while you discover your tastes.</p><h3>How do you like to read?</h3><div className="choice-grid">{['Print books','Ebooks','Audiobooks'].map(v=><label className="choice" key={v}><input type="checkbox" checked={formats.includes(v)} onChange={()=>toggle(formats,v,setFormats)}/>{v}</label>)}</div><h3>Genres you enjoy</h3><div className="choice-grid">{genres.map(v=><label className="choice" key={v}><input type="checkbox" checked={selectedGenres.includes(v)} onChange={()=>toggle(selectedGenres,v,setGenres)}/>{v}</label>)}</div></div>}
    {step===2&&<FavouriteOrbit role="author" heading="Whose stories do you love?"/>}
    {hasAudio&&step===3&&<FavouriteOrbit role="narrator" heading="Which voices stay with you?"/>}
    {step===finalIndex&&<div className="onboarding-stage welcome-stage"><span className="ornament">✦</span><p className="eyebrow">Your next chapter begins</p><h1>Your reading world is ready, {name||member.displayName}.</h1><p className="intro">You can keep discovering your tastes as you go. Your bookshelf starts empty until you add actual books.</p><div className="welcome-chips">{[...formats,...selectedGenres].map(v=><span className="tag" key={v}>{v}</span>)}</div><div className="actions"><a href="/shelf" className="button">Explore my homepage</a><a href="/add-book" className="button secondary">Add my first book</a><a href="/preferences" className="button quiet">Edit preferences</a></div></div>}
    {error&&<div className="notice error" role="alert">{error}</div>}
    {step<finalIndex&&<div className="onboarding-actions"><button type="button" className="button secondary" disabled={step===0||busy} onClick={back}>← Back</button><div className="onboarding-forward"><button type="button" className="button quiet" disabled={busy} onClick={()=>void next()}>Skip for now</button><button className="button" type="button" disabled={busy} onClick={()=>void next()}>{busy?'Saving…':step===finalIndex-1?'Finish setup →':'Continue →'}</button></div></div>}
  </div>;
}
