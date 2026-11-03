import {RoomBookView} from './themes/RoomBookView';
import {useEffect,useMemo,useState} from 'react';
import {apiGet} from './api';

type Book={id:string;title:string;subtitle:string|null;summary:string|null;author:string|null;year:number|null;verificationStatus:string};
type Contributor={id:string;name:string;role:string};
type Edition={id:string;format:string;publisher:string|null;publishedAt:string|null;language:string|null;pageCount:number|null;durationMinutes:number|null;abridged:number|null;isbn13:string|null;asin:string|null;verificationStatus:string;contributors:Contributor[]};
type Review={id:string;title:string|null;body:string|null;spoilers:number;storyRating:number|null;audioRating:number|null;publishedAt:string|null;editionId:string|null;format:string|null;authorName:string;authorHandle:string|null};
type Rating={average:number|null;count:number};
export type BookPayload={book:Book;editions:Edition[];reviews:Review[];ratings:{story:Rating;narrationByEdition:(Rating&{editionId:string})[]}};
const fmt:Record<string,string>={paperback:'Paperback',hardback:'Hardback',ebook:'Ebook',audiobook:'Audiobook',unknown:'Format unconfirmed'};
function secondsToHours(minutes:number){const hours=Math.floor(minutes/60),remainder=minutes%60;return [hours?hours+' hr':'',remainder?remainder+' min':''].filter(Boolean).join(' ')||'0 min';}
function RatingSummary({label,rating}:{label:string;rating:Rating}){
 return <div className="book-rating"><p className="eyebrow">{label}</p>{rating.average==null?<strong>Not rated yet</strong>:<strong>★ {rating.average.toFixed(1)} <small>/ 5</small></strong>}<p className="muted small">{rating.count} {rating.count===1?'member rating':'member ratings'}</p></div>;
}
function EditionCard({edition,rating}:{edition:Edition;rating?:Rating}){
 const narrators=edition.contributors.filter(p=>p.role==='narrator');
 return <article className="panel edition-card">
  <div className="edition-top"><span className="tag">{fmt[edition.format]??'Unknown edition'}</span><span className="muted small">{edition.language||'Language unknown'}</span></div>
  <h3>{edition.publisher||'Publisher unconfirmed'}</h3>
  <dl className="edition-facts">
   {edition.publishedAt&&<><dt>Published</dt><dd>{edition.publishedAt}</dd></>}
   {edition.pageCount!=null&&<><dt>Pages</dt><dd>{edition.pageCount.toLocaleString('en-GB')}</dd></>}
   {edition.durationMinutes!=null&&<><dt>Recording length</dt><dd>{secondsToHours(edition.durationMinutes)}</dd></>}
   {edition.format==='audiobook'&&edition.abridged!=null&&<><dt>Recording</dt><dd>{edition.abridged?'Abridged':'Unabridged'}</dd></>}
   {edition.isbn13&&<><dt>ISBN-13</dt><dd>{edition.isbn13}</dd></>}
   {edition.asin&&<><dt>ASIN</dt><dd>{edition.asin}</dd></>}
  </dl>
  {narrators.length>0&&<p className="edition-voices"><strong>{narrators.length===1?'Narrator':'Narrators'}:</strong>{' '}{narrators.map((p,i)=><span key={p.id}>{i>0?', ':''}<a href={'/person/'+encodeURIComponent(p.id)}>{p.name}</a></span>)}</p>}
  {edition.format==='audiobook'&&rating&&<RatingSummary label="Community narration rating" rating={rating}/>}
  {edition.verificationStatus!=='verified'&&<p className="small muted">Edition details have not been fully verified.</p>}
 </article>;
}
function ReviewSnippet({review}:{review:Review}){
 const [revealed,setRevealed]=useState(false);
 const spoiler=Boolean(review.spoilers);
 return <article className="panel book-review-tile">
  <div className="book-review-top"><span className="eyebrow">Community review</span><span className="muted small">{fmt[review.format??'']??'Edition not selected'}</span></div>
  <h3><a href={'/review/'+encodeURIComponent(review.id)}>{spoiler?'Review contains spoilers':(review.title||'Reader review')}</a></h3>
  <p className="muted small">By {review.authorName}{review.storyRating!=null?` · Story ★ ${review.storyRating}/5`:''}</p>
  {spoiler&&!revealed?<div className="book-spoiler"><p>Review text is hidden to protect spoilers.</p><button className="button secondary" type="button" onClick={()=>setRevealed(true)}>Reveal excerpt</button></div>:<p>{review.body?(review.body.length>220?review.body.slice(0,220)+'…':review.body):'Rating only — no written review.'}</p>}
  <a className="inline-link" href={'/review/'+encodeURIComponent(review.id)}>Read full review →</a>
 </article>;
}
export function PublicBookPage({id,verified,theme='editorial'}:{id:string;verified:boolean;theme?:'editorial'|'reading-room'}){
 const [data,setData]=useState<BookPayload|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [tab,setTab]=useState<'overview'|'reviews'|'editions'>('overview');
 const [filter,setFilter]=useState('all');
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');setTab('overview');setFilter('all');
  apiGet<BookPayload>('/api/book/'+encodeURIComponent(id)).then(v=>{if(!cancelled)setData(v)})
   .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Unable to load this book')})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[id]);
 const editions=useMemo(()=>data?.editions.filter(e=>filter==='all'||e.format===filter)??[],[data,filter]);
 if(loading)return <p role="status">Loading book details…</p>;
 if(!data)return <section className="empty"><h1>Book not available</h1><p role="alert">{error||'This book could not be found.'}</p><a className="button secondary" href="/books">Browse books</a></section>;
 if(theme==='reading-room')return <RoomBookView data={data} verified={verified}/>;
 const {book,ratings,reviews}=data;
 const ratingsByEdition=new Map(ratings.narrationByEdition.map(r=>[r.editionId,r]));
 return <div className="public-book-page">
  <div className="public-book-hero"><div className="book-cover book-detail-cover"><span className="cover-mark" aria-hidden="true">C<span>&</span>S</span></div>
   <div className="public-book-copy">
    <p className="eyebrow">Book overview · Chapter & Sound</p><h1>{book.title}</h1>
    {book.subtitle&&<p className="intro">{book.subtitle}</p>}
    <p className="book-author-line">By <strong>{book.author||'Author not yet confirmed'}</strong>{book.year?<> · First published {book.year}</>:null}</p>
    <p>{book.summary||'A verified synopsis has not yet been added to this record.'}</p>
    <div className="actions"><a className="button" href={verified?'/add-book':'/signin'}>{verified?'Add to my bookshelf':'Sign in to add'}</a><a href={verified?'/write-review?book='+encodeURIComponent(book.id):'/signin'} className="button secondary">{verified?'Write a review':'Sign in to review'}</a></div>
    {book.verificationStatus!=='verified'&&<p className="muted small">Book metadata awaits verification.</p>}
   </div>
   <aside><RatingSummary label="Community story rating" rating={ratings.story}/><p className="muted small">Based on at most one public story rating per member.</p></aside>
  </div>
  <nav className="shelf-tabs book-tabs" aria-label="Book sections">{[['overview','Overview'],['reviews','Community reviews'],['editions','Editions']].map(([key,label])=><button type="button" key={key} className={tab===key?'selected':''} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key as typeof tab)}>{label}{key==='reviews'&&<span>{reviews.length}</span>}{key==='editions'&&<span>{data.editions.length}</span>}</button>)}</nav>
  {tab==='overview'&&<><section className="book-section"><h2>About this book</h2><p>{book.summary||'No verified description is available yet.'}</p></section><section className="book-section"><div className="section-title"><h2>Read or listen</h2><button type="button" className="inline-link tab-switch" onClick={()=>setTab('editions')}>View all editions →</button></div>{data.editions.length?<div className="edition-grid">{data.editions.slice(0,3).map(e=><EditionCard key={e.id} edition={e} rating={ratingsByEdition.get(e.id)}/>)}</div>:<div className="empty"><h3>No editions confirmed</h3><p>Paperback, hardback, ebook and audio candidates will appear when confirmed.</p></div>}</section><section className="book-section"><div className="section-title"><h2>From the community</h2><button type="button" className="inline-link tab-switch" onClick={()=>setTab('reviews')}>View all reviews →</button></div>{reviews.length?<div className="review-grid">{reviews.slice(0,3).map(r=><ReviewSnippet review={r} key={r.id}/>)}</div>:<div className="empty"><h3>No reviews yet</h3><p>Be the first to share a genuine review of this book.</p></div>}</section></>}
  {tab==='reviews'&&<section className="book-section"><h2>Community reviews</h2><p className="intro">Reader opinions are personal. Spoilers are hidden unless you choose to view them.</p>{reviews.length?<div className="review-grid">{reviews.map(r=><ReviewSnippet key={r.id} review={r}/>)}</div>:<div className="empty"><h3>There are no published reviews yet.</h3></div>}</section>}
  {tab==='editions'&&<section className="book-section"><div className="section-title"><div><h2>Choose an edition</h2><p>Every recording and format is distinct. Missing details stay unknown.</p></div></div><div className="filters"><label>Format<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All formats</option>{Object.entries(fmt).filter(([k])=>k!=='unknown').map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div>{editions.length?<div className="edition-grid">{editions.map(e=><EditionCard edition={e} key={e.id} rating={ratingsByEdition.get(e.id)}/>)}</div>:<div className="empty"><h3>No matching editions</h3><p>The selected format has not been confirmed for this book.</p></div>}</section>}
 </div>;
}
