import {useEffect,useState} from 'react';
import type {BookPayload} from '../PublicBookPage';

export function RoomBookView({data,verified}:{data:BookPayload;verified:boolean}){
 const {book,editions,reviews,ratings}=data;
 const [format,setFormat]=useState('all');
 const [coverFailed,setCoverFailed]=useState(false);
 const cover=book.coverUrl||editions.find(e=>e.coverUrl)?.coverUrl;
 useEffect(()=>{setCoverFailed(false)},[book.id,cover]);
 const [shown,setShown]=useState<Record<string,boolean>>({});
 const visible=editions.filter(x=>format==='all'||x.format===format);
 const narrationByEdition=new Map(ratings.narrationByEdition.map(x=>[x.editionId,x]));
 return <div className="room-book-detail">
  <nav className="room-breadcrumb" aria-label="Breadcrumb"><a href="/books">Books</a><span aria-hidden="true">/</span><span>{book.title}</span></nav>
  <section className="room-book-banner">
    <div className="room-book-identity"><div className="room-book-placeholder room-book-cover">
      {cover&&!coverFailed
       ?<img src={cover} alt={`Cover of ${book.title}`} loading="eager" referrerPolicy="no-referrer" onError={()=>setCoverFailed(true)}/>
       :<span>Chapter<br/>&amp; Sound</span>}
     </div>
      <div><p className="eyebrow">The Reading Room / Book profile</p><h1>{book.title}</h1>
      {book.subtitle&&<p>{book.subtitle}</p>}
      <h2>{book.author||'Author unconfirmed'}</h2>
      {book.year!=null&&<p className="muted small">First published {book.year}</p>}
      <div className="room-book-actions"><a className="room-primary-link" href={verified?'/add-book':'/signin'}>{verified?'Save to my bookshelf':'Sign in to save'} →</a><a href="/reviews" className="room-outline-link">Community reviews</a></div></div>
    </div>
    <aside className="room-book-score"><p className="eyebrow">Community story rating</p><strong>{ratings.story.average!=null?'★ '+ratings.story.average.toFixed(1)+'/5':'Awaiting ratings'}</strong><p>{ratings.story.count} {ratings.story.count===1?'member rating':'member ratings'}</p><p className="muted small">One public story rating per member.</p></aside>
  </section>
  <div className="room-book-sections"><div className="room-book-main">
    <section className="room-book-panel"><h2>The story</h2><p>{book.summary||'A verified synopsis has not been added to this book yet.'}</p></section>
    <section className="room-book-panel"><div className="room-section-heading"><h2>Community reviews</h2><a href="/reviews">Browse all reviews →</a></div>
      {reviews.length?<div className="room-book-reviews">{reviews.map(r=><article className="room-book-review" key={r.id}>
        <div><span className="eyebrow">{r.format||'Book review'}</span><span className="muted small">{r.authorName}</span></div>
        <h3><a href={'/review/'+encodeURIComponent(r.id)}>{r.spoilers?'Review contains spoilers':r.title||'A reader’s thoughts'}</a></h3>
        <p>{r.spoilers&&!shown[r.id]?'This reader’s words are hidden until you choose to reveal spoilers.':r.body?.slice(0,270)||'Rating-only review.'}</p>
        {r.spoilers&&!shown[r.id]&&<button type="button" className="room-outline-link" onClick={()=>setShown(v=>({...v,[r.id]:true}))}>Reveal spoiler excerpt</button>}
        <a href={'/review/'+encodeURIComponent(r.id)} className="room-inline-cta">Read full review →</a>
      </article>)}</div>:<div className="room-book-empty">No public reviews yet. Genuine member reviews will appear here.</div>}</section>
  </div>
  <aside className="room-book-side">
    <section className="room-book-panel"><h2>Formats & editions</h2><label className="room-book-format">Choose a format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">All editions</option><option value="paperback">Paperback</option><option value="hardback">Hardback</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></label>
      {visible.length?<div className="room-edition-list">{visible.map(e=><article className="room-edition-row" key={e.id}>
        <div className="room-edition-head"><strong>{e.format.charAt(0).toUpperCase()+e.format.slice(1)}</strong><span>{e.language||'Language unconfirmed'}</span></div>
        <p>{e.publisher||'Publisher unconfirmed'}</p>
        {e.publishedAt&&<p>Published {e.publishedAt}</p>}
        {e.isbn13&&<p>ISBN-13 {e.isbn13}</p>}
        {e.pageCount!=null&&<p>{e.pageCount} pages</p>}
        {e.durationMinutes!=null&&<p>{Math.floor(e.durationMinutes/60)} hours {e.durationMinutes%60} minutes</p>}
        {e.format==='audiobook'&&e.contributors.filter(p=>p.role==='narrator').map(p=><p key={p.id}>Read by <a href={'/person/'+encodeURIComponent(p.id)}>{p.name}</a></p>)}
        {e.format==='audiobook'&&narrationByEdition.get(e.id)&&<p className="room-audio-score">Narration ★ {narrationByEdition.get(e.id)!.average?.toFixed(1)||'—'}/5</p>}
        {e.verificationStatus!=='verified'&&<small>Edition details unverified</small>}
      </article>)}</div>:<div className="room-book-empty">No matching editions available yet.</div>}
    </section>
    <section className="room-book-panel room-book-invite"><h2>Make it yours</h2><p>Keep your own reading history and personal thoughts in your private bookshelf.</p><a className="room-primary-link" href={verified?'/add-book':'/signup'}>{verified?'Add this book':'Create an account'} →</a></section>
  </aside></div>
 </div>;
}
