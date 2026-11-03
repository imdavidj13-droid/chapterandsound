import type {FormEvent} from 'react';
import type {Review} from '../PublicReviewPage';
type Props={review:Review;verified:boolean;revealed:boolean;setRevealed:(v:boolean)=>void;helpful:boolean;toggleHelpful:()=>Promise<void>;reportOpen:boolean;setReportOpen:(v:boolean)=>void;submitted:boolean;reason:string;setReason:(v:string)=>void;report:(e:FormEvent<HTMLFormElement>)=>Promise<void>;busy:boolean;error:string};
export function RoomReviewView({review,verified,revealed,setRevealed,helpful,toggleHelpful,reportOpen,setReportOpen,submitted,reason,setReason,report,busy,error}:Props){
 const author=review.authorName||'A community reader';
 return <div className="room-review-detail">
  <nav className="room-breadcrumb" aria-label="Breadcrumb"><a href="/reviews">Reviews</a><span>/</span><span>{review.bookTitle}</span></nav>
  <div className="room-review-layout">
   <article className="room-review-article">
     <div className="room-review-banner"><p className="eyebrow">Reading Room · Review</p><h1>{review.title||'A reader’s thoughts'}</h1><p>Reading <a href={'/book/'+encodeURIComponent(review.bookId)}>{review.bookTitle}</a></p>
      <div className="room-review-byline"><span className="room-author-avatar">{author.charAt(0).toUpperCase()}</span><div>{review.authorHandle?<a href={'/reader/'+encodeURIComponent(review.authorHandle)}>{author}</a>:<strong>{author}</strong>}{review.publishedAt&&<small>{new Date(review.publishedAt.replace(' ','T')+'Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</small>}</div></div>
     </div>
     <div className="room-review-body">{review.spoilers&&!revealed?<section className="room-review-spoiler"><h2>Spoiler warning</h2><p>This review contains story spoilers. Its content remains hidden until you choose to reveal it.</p><button className="room-primary-link" onClick={()=>setRevealed(true)}>Reveal review</button></section>:<p>{review.body||'This member shared their rating without a written review.'}</p>}</div>
     <footer className="room-review-footer"><div>{verified?<button className="room-outline-link" aria-pressed={helpful} onClick={()=>void toggleHelpful()} disabled={busy}>{helpful?'✓ Helpful':'Mark helpful'} ({review.helpfulCount})</button>:<a href="/signin" className="room-outline-link">Sign in to mark helpful ({review.helpfulCount})</a>}</div>
     {verified?<button className="room-inline-cta room-report-button" onClick={()=>setReportOpen(!reportOpen)} aria-expanded={reportOpen}>Report review</button>:<a className="room-inline-cta" href="/signin">Sign in to report</a>}</footer>
     {reportOpen&&verified&&<div className="room-report-panel">{submitted?<p role="status">Your report has been recorded for moderation.</p>:<form onSubmit={report}><h2>Report this review</h2><label>Reason<textarea rows={4} required minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this review needs attention"/></label><div className="actions"><button className="room-primary-link" type="submit" disabled={busy}>Submit report</button><button className="room-outline-link" type="button" onClick={()=>setReportOpen(false)}>Cancel</button></div></form>}</div>}
     {error&&<div className="notice error" role="alert">{error}</div>}
   </article>
   <aside className="room-review-aside">
    <div className="room-book-panel"><h2>Your review at a glance</h2><div className="room-review-facts"><div><span>Story</span><strong>{review.storyRating==null?'Not rated':'★ '+review.storyRating.toFixed(1)+'/5'}</strong></div>{review.format==='audiobook'&&<div><span>Narration</span><strong>{review.audioRating==null?'Not rated':'★ '+review.audioRating.toFixed(1)+'/5'}</strong></div>}<div><span>Edition</span><strong>{review.format||'Unspecified'}</strong></div></div></div>
    <div className="room-book-panel"><h2>About the book</h2><p>{review.bookTitle}</p><a className="room-primary-link" href={'/book/'+encodeURIComponent(review.bookId)}>Explore this book →</a></div>
   </aside>
  </div>
 </div>;
}
