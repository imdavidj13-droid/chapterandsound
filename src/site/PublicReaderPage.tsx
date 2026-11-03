import {useEffect,useState} from 'react';
import {apiGet} from './api';

interface Reader{handle:string;displayName:string;bio:string|null}
interface Review{id:string;title:string|null;body:string|null;storyRating:number|null;audioRating:number|null;spoilers:number;publishedAt:string|null;bookId:string;bookTitle:string;format:string|null}
interface Result{reader:Reader;reviews:Review[]}
export function PublicReaderPage({handle}:{handle:string}){
 const [result,setResult]=useState<Result|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');
  apiGet<Result>('/api/reader/'+encodeURIComponent(handle)).then(x=>{if(active)setResult(x)})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Reader profile unavailable')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[handle]);
 if(loading)return <section className="reader-profile"><p role="status">Loading reader profile…</p></section>;
 if(!result)return <section className="reader-profile"><h1>Reader not found</h1><p role="alert">{error||'This reader profile is unavailable.'}</p><a className="inline-link" href="/reviews">Browse community reviews</a></section>;
 const {reader,reviews}=result;
 return <div className="reader-profile">
   <nav aria-label="Breadcrumb" className="reader-breadcrumb"><a href="/community">Community</a><span>/</span><span>Readers</span><span>/</span><strong>{reader.displayName}</strong></nav>
   <header className="reader-profile-hero"><div className="reader-avatar" aria-hidden="true">{reader.handle.charAt(0).toUpperCase()}</div><div><p className="eyebrow">Chapter & Sound · Public reader profile</p><h1>{reader.displayName}</h1><p>{reader.bio||'A reader in the Chapter & Sound community.'}</p></div><button type="button" className="button secondary" onClick={()=>navigator.clipboard.writeText(window.location.href)}>Copy profile link</button></header>
   <section className="reader-reviews"><div className="section-title"><div><p className="eyebrow">Shared with the community</p><h2>Published reviews <span className="reader-count">{reviews.length}</span></h2></div></div>
     {reviews.length?<div className="reader-review-grid">{reviews.map(r=><article className="panel reader-review" key={r.id}>
       <p className="eyebrow">{r.format||'Book review'}</p><h3><a href={'/review/'+encodeURIComponent(r.id)}>{r.spoilers?'Review contains spoilers':(r.title||r.bookTitle)}</a></h3><p>On <a href={'/book/'+encodeURIComponent(r.bookId)}>{r.bookTitle}</a></p>
       {r.storyRating!=null&&<p className="reader-rating" aria-label={'Story rated '+r.storyRating+' out of five'}>★ {r.storyRating}/5</p>}
       <p>{r.spoilers?'The review contains spoilers. Open it to choose whether to reveal the text.':r.body?.slice(0,230)||'This reader shared a rating.'}</p><a href={'/review/'+encodeURIComponent(r.id)} className="inline-link">Read full review →</a>
     </article>)}</div>:<div className="empty"><h3>No published reviews yet</h3><p>Only reviews this member chooses to publish will appear here. Their private shelf and reading notes are never displayed.</p></div>}
   </section>
 </div>;
}
