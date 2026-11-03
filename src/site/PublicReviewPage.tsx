import {useEffect,useState} from 'react';
import {apiGet,apiWrite} from './api';

interface Review {
 id:string;title:string|null;body:string|null;storyRating:number|null;audioRating:number|null;
 spoilers:number;publishedAt:string|null;bookId:string;editionId:string|null;
 bookTitle:string;format:string|null;authorId:string;authorHandle:string|null;
 authorName:string;helpfulCount:number;
}
interface DetailResponse {item:Review;viewerHelpful:boolean}
interface ActionResponse {helpful:boolean;helpfulCount:number}
export function PublicReviewPage({id,verified}:{id:string;verified:boolean}){
 const [review,setReview]=useState<Review|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [revealed,setRevealed]=useState(false);
 const [helpful,setHelpful]=useState(false);
 const [reportOpen,setReportOpen]=useState(false);
 const [reason,setReason]=useState('');
 const [submitted,setSubmitted]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');setRevealed(false);
  apiGet<DetailResponse>('/api/public-reviews/'+encodeURIComponent(id)).then(data=>{
   if(!cancelled){setReview(data.item);setHelpful(data.viewerHelpful);}
  }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Review unavailable')})
  .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[id]);
 async function toggleHelpful(){
  if(!review||busy)return;
  setBusy(true);setError('');
  try{
   const result=await apiWrite<ActionResponse>('/api/public-reviews/'+encodeURIComponent(review.id)+'/helpful',helpful?'DELETE':'POST');
   setHelpful(result.helpful);setReview({...review,helpfulCount:result.helpfulCount});
  }catch(e){setError(e instanceof Error?e.message:'Unable to update your helpful vote');}
  finally{setBusy(false);}
 }
 async function report(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!review||busy)return;
  setBusy(true);setError('');
  try{
   await apiWrite('/api/public-reviews/'+encodeURIComponent(review.id)+'/report','POST',{reason});
   setSubmitted(true);setReason('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to send report')}
  finally{setBusy(false);}
 }
 if(loading)return <section className="reading-article"><p role="status">Loading review…</p></section>;
 if(!review)return <section className="reading-article"><h1>Review not available</h1><p role="alert">{error||'This review is not publicly accessible.'}</p><a className="inline-link" href="/reviews">Return to community reviews</a></section>;
 return <article className="reading-article public-review">
  <p className="eyebrow"><a href="/reviews">Community reviews</a> · {review.format??'Unspecified format'}</p>
  <h1>{review.title||review.bookTitle}</h1>
  <p className="review-byline">A review of <a href={'/book/'+encodeURIComponent(review.bookId)}>{review.bookTitle}</a> by{' '}
    {review.authorHandle?<a href={'/reader/'+encodeURIComponent(review.authorHandle)}>{review.authorName}</a>:review.authorName}
  </p>
  {review.publishedAt&&<p className="muted small">Published {new Date(review.publishedAt.replace(' ','T')+'Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>}
  <div className="review-scores">
   {review.storyRating!=null&&<div><span>Story</span><strong aria-label={`Story rating ${review.storyRating} of 5`}>★ {review.storyRating}/5</strong></div>}
   {review.format==='audiobook'&&review.audioRating!=null&&<div><span>Narration</span><strong aria-label={`Narration rating ${review.audioRating} of 5`}>★ {review.audioRating}/5</strong></div>}
  </div>
  {review.spoilers&&!revealed?<section className="panel spoiler-warning"><h2>Contains spoilers</h2><p>The review text is hidden until you choose to reveal it.</p><button className="button secondary" onClick={()=>setRevealed(true)}>Reveal review</button></section>:<p className="article-body">{review.body||'This member shared a rating without a written review.'}</p>}
  <div className="review-interactions">
    <div>
     {verified?<button className="button secondary" type="button" disabled={busy} aria-pressed={helpful} onClick={toggleHelpful}>{helpful?'✓ Marked helpful':'Mark helpful'} ({review.helpfulCount})</button>:
     <a href="/signin" className="button secondary">Sign in to mark helpful ({review.helpfulCount})</a>}
    </div>
    {verified?<button type="button" className="review-report-link" onClick={()=>setReportOpen(!reportOpen)} aria-expanded={reportOpen}>Report review</button>:<a href="/signin" className="review-report-link">Sign in to report</a>}
  </div>
  {reportOpen&&verified&&<section className="panel review-report-panel" aria-label="Report review">
    {submitted?<p role="status">Your report has been recorded for moderation. Thank you.</p>:
    <form onSubmit={report}><h2>Report this review</h2><p>Tell the moderators why this content needs attention. Reports are private.</p>
      <label>Reason<textarea rows={4} minLength={10} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="What concerns you about this review?"/></label>
      <div className="actions"><button disabled={busy} className="button" type="submit">{busy?'Sending…':'Submit report'}</button><button className="button secondary" type="button" onClick={()=>setReportOpen(false)}>Cancel</button></div>
    </form>}
  </section>}
  {error&&<div className="notice error" role="alert">{error}</div>}
  <p className="review-back"><a className="inline-link" href="/reviews">← All community reviews</a></p>
 </article>;
}
