import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {apiGet} from '../api';

export type HomeMember={id:string;displayName:string;verified:boolean}|null;
export type HomeBook={id:string;title:string;author?:string;coverUrl?:string|null;formats?:string[]};
export type HomeReview={id:string;title?:string|null;bookTitle?:string;bookId?:string;authorName?:string;authorHandle?:string|null;storyRating?:number|null;body?:string|null;spoilers?:boolean};
type ShelfBook={id:string;workId:string;bookTitle:string;author?:string|null;coverUrl?:string|null;status:string;format?:string|null;progressValue?:number|null;progressUnit?:string|null};
type MemberReview={id:string;bookId:string;bookTitle:string;title?:string|null;body?:string|null;storyRating?:number|null;status:string;visibility:string;spoilers?:boolean};
type HomeRecords={shelf:ShelfBook[];ownReviews:MemberReview[];loading:boolean;error:string};
type HomeProps={member:HomeMember;books:HomeBook[];reviews:HomeReview[];presentation?:{heading:string;intro:string}};
const label=(format?:string|null)=>({audiobook:'Audiobook',ebook:'Ebook',paperback:'Paperback',hardback:'Hardback',audio_cd:'Audio CD'} as Record<string,string>)[format||'']||format||'Edition not selected';
const href=(id:string)=>'/book/'+encodeURIComponent(id);
function useHomeRecords(member:HomeMember):HomeRecords{
 const [state,setState]=useState<HomeRecords>({shelf:[],ownReviews:[],loading:Boolean(member?.verified),error:''});
 useEffect(()=>{
  if(!member?.verified){setState({shelf:[],ownReviews:[],loading:false,error:''});return}
  let active=true;
  setState({shelf:[],ownReviews:[],loading:true,error:''});
  void Promise.allSettled([
   apiGet<{items:ShelfBook[]}>('/api/member/shelf'),
   apiGet<{items:MemberReview[]}>('/api/member/reviews')
  ]).then(([shelf,reviews])=>{
   if(!active)return;
   setState({
    shelf:shelf.status==='fulfilled'&&Array.isArray(shelf.value.items)?shelf.value.items:[],
    ownReviews:reviews.status==='fulfilled'&&Array.isArray(reviews.value.items)
     ?reviews.value.items.filter(r=>r.status==='published'&&r.visibility==='public'):[],
    loading:false,
    error:shelf.status==='rejected'?'Your bookshelf could not be loaded. Try again later.':''
   });
  });
  return()=>{active=false};
 },[member?.id,member?.verified]);
 return state;
}
function Cover({url,title}:{url?:string|null;title:string}){
 return <div className="dual-home-cover">{url?<img loading="lazy" src={url} alt={'Cover of '+title}/>:<span className="dual-home-cover-placeholder" aria-label="Cover not available">C<span>&amp;</span>S</span>}</div>;
}
function LinkedBook({book}:{book:HomeBook}){
 return <article className="dual-book-pick"><a href={href(book.id)}><Cover url={book.coverUrl} title={book.title}/></a><div className="dual-book-pick-copy"><h3><a href={href(book.id)}>{book.title}</a></h3><p>{book.author||'Author not confirmed'}</p><a href={href(book.id)} className="dual-text-link">Explore editions →</a></div></article>;
}
function ReviewsRow({reviews,own=false}:{reviews:HomeReview[];own?:boolean}){
 if(!reviews.length)return <div className="dual-empty">No published reviews to show yet. <a href="/reviews">Explore community reviews →</a></div>;
 return <div className="dual-home-reviews">{reviews.slice(0,3).map(review=><article className="dual-review" key={review.id}><p className="dual-kicker">{own?'Your published review':'Community review'}</p><h3><a href={'/review/'+encodeURIComponent(review.id)}>{review.spoilers?'Review contains spoilers':review.title||review.bookTitle||'Reader review'}</a></h3>{review.bookTitle&&<p>{review.bookTitle}</p>}{review.storyRating!=null&&<p aria-label={'Rated '+review.storyRating+' out of five'} className="dual-review-rating">★ {review.storyRating}/5</p>}<p className="dual-review-excerpt">{review.spoilers?'Open this review to choose whether to reveal spoilers.':(review.body||'A published review is available.').slice(0,145)}</p><a className="dual-text-link" href={'/review/'+encodeURIComponent(review.id)}>Read review →</a></article>)}</div>;
}
function HomeSection({title,action,href:destination,children}:{title:string;action:string;href:string;children:ReactNode}){
 return <section className="dual-home-section"><div className="dual-section-heading"><h2>{title}</h2><a href={destination}>{action} →</a></div>{children}</section>;
}
function Progress({item}:{item:ShelfBook}){
 return <div className="dual-progress-copy">{item.progressValue!=null&&<p className="dual-progress-label">{item.progressUnit==='percent'?item.progressValue+'% complete':(item.progressUnit==='pages'?'Page ':item.progressUnit==='audio_minutes'?'Audio minute ':'Position ')+item.progressValue}</p>}{item.progressUnit==='percent'&&item.progressValue!=null&&<div className="dual-progress-track" role="progressbar" aria-label={'Reading progress for '+item.bookTitle} aria-valuenow={Math.min(100,Math.max(0,item.progressValue))} aria-valuemin={0} aria-valuemax={100}><span style={{width:Math.min(100,Math.max(0,item.progressValue))+'%'}}/></div>}</div>;
}
export function EditorialHome({member,books,reviews,presentation}:HomeProps){
 const {shelf,ownReviews,loading,error}=useHomeRecords(member);
 const verified=Boolean(member?.verified);
 const newMember=!verified||(!loading&&shelf.length===0);
 const current=shelf.filter(item=>item.status==='in_progress').slice(0,2);
 const saved=shelf.find(item=>item.status==='want_to_read');
 const finished=shelf.filter(item=>item.status==='finished').length;
 const firstName=member?.displayName?.trim().split(/\s+/)[0]||'reader';
 const own=ownReviews.map(r=>({...r,spoilers:Boolean(r.spoilers)}));
 return <div className="dual-editorial-home">
  {loading&&<p className="dual-loading" role="status">Opening your reading world…</p>}
  {error&&<p role="alert" className="dual-error">{error}</p>}
  {newMember?<section className="editorial-new-hero">
   <div className="editorial-start-card"><p className="dual-kicker">A bookshelf of your own</p><h2>Your bookshelf starts here.</h2><p>Add a book you're reading, listening to or saving for later.</p><span className="editorial-book-art" aria-hidden="true">▥　▤　▯　❦</span></div>
   <div className="editorial-intro"><p className="dual-kicker">A / {verified?'New member':'Welcome'}</p><h1>{verified?'Welcome to your reading world, '+firstName+'.':presentation?.heading||'Welcome to your reading world.'}</h1><p>Let's find your next favourite story.</p><a className="dual-primary" href={verified?'/add-book':'/signup'}>{verified?'Add your first book':'Create your reading space'} <span aria-hidden="true">→</span></a></div>
   <aside className="editorial-taste"><h2>Your reading taste</h2><p>{verified?'Build your preferences to shape your recommendations.':'A place for your books, favourite authors and listening discoveries.'}</p><div className="editorial-taste-links"><a href={verified?'/preferences':'/signup'}>Set reading preferences →</a><a href="/authors">Explore authors →</a><a href="/narrators">Meet narrators →</a></div></aside>
  </section>:<><header className="editorial-return-hero"><p className="dual-kicker">B / Your reading world</p><h1>Welcome back, {firstName}.</h1><p>A little further into a good story.</p><a href="/add-book" className="dual-primary">+ Add a book</a></header>
  <div className="editorial-return-grid"><section className="editorial-reading-panel"><div className="dual-section-heading"><h2>Continue your chapter</h2><a href="/shelf">View all my books →</a></div>{current.length?current.map(item=><article className="editorial-reading-row" key={item.id}><a href={href(item.workId)}><Cover url={item.coverUrl} title={item.bookTitle}/></a><div><h3><a href={href(item.workId)}>{item.bookTitle}</a></h3><p>{item.author||'Author not confirmed'}</p><span className="dual-format">{label(item.format)}</span><Progress item={item}/></div><a href="/shelf" className="dual-small-action">Update progress</a></article>):<div className="dual-empty">No books currently in progress. <a href="/shelf">Open your bookshelf →</a></div>}</section>
   <aside className="editorial-year-card"><h2>Your year so far</h2><div className="editorial-year-number"><strong>{finished}</strong><span>Books marked finished</span></div><div className="editorial-year-number"><strong>{shelf.length}</strong><span>Books on your shelf</span></div><div className="editorial-year-number"><strong>{ownReviews.length}</strong><span>Published reviews</span></div><a href="/reading-year">View my year →</a></aside>
  </div></>}
  <HomeSection title={newMember?'A few places to begin':'Picked for you'} action="Explore books" href="/books">
   {books.length?<div className="editorial-book-row">{books.slice(0,4).map(book=><LinkedBook key={book.id} book={book}/>)}</div>:<div className="dual-empty">The verified book collection is being prepared. <a href="/books">Browse the catalogue →</a></div>}
  </HomeSection>
  {!newMember&&<section className="editorial-saved"><div><p className="dual-kicker">Next on your shelf</p><h2>{saved?saved.bookTitle:'Your next great read'}</h2><p>{saved?(saved.author||'Saved to read later'):'Keep books you want to read in one place.'}</p></div><a href={saved?href(saved.workId):'/books'} className="dual-primary">{saved?'View saved book':'Find a book'} →</a></section>}
  <HomeSection title={own.length?'Your latest reviews':'Latest from the community'} action="See all reviews" href="/reviews"><ReviewsRow reviews={own.length?own:reviews}/></HomeSection>
 </div>;
}
export function ReadingRoomHome({member,books,reviews}:HomeProps){
 const {shelf,ownReviews,loading,error}=useHomeRecords(member);
 const verified=Boolean(member?.verified);
 const newMember=!verified||(!loading&&!error&&shelf.length===0);
 const firstName=member?.displayName?.trim().split(/\s+/)[0]||'reader';
 const finished=shelf.filter(item=>item.status==='finished').length;
 const current=shelf.filter(item=>item.status==='in_progress').slice(0,2);
 const saved=shelf.find(item=>item.status==='want_to_read');
 return <div className="dual-room-home">
  {loading&&<p className="dual-loading" role="status">Loading your bookshelf…</p>}
  {error&&<p className="dual-error" role="alert">{error}</p>}
  {newMember?<><section className="room-new-hero"><div><p className="dual-kicker">A / Your personal reading space</p><h1>Your reading room awaits.</h1><p>Build your bookshelf, keep track of the stories you love and discover your next read.</p><div className="room-home-actions"><a href={verified?'/add-book':'/signup'} className="room-home-primary">{verified?'Add your first book':'Create your account'}</a><a href="/books" className="room-home-outline">Explore books</a></div></div><span className="room-hero-illustration" aria-hidden="true">▤　▥　❦</span></section>
    <div className="room-home-shortcuts"><a href="/books"><strong>Discover books</strong><span>Find your next read →</span></a><a href="/preferences"><strong>Your reading taste</strong><span>Personalise your space →</span></a><a href="/community"><strong>Community</strong><span>Meet other readers →</span></a></div></>
   :<><header className="room-return-heading"><p className="dual-kicker">B / Your personal reading space</p><h1>Welcome back, {firstName}.</h1><p>Let's pick up where you left off.</p></header>
    <div className="room-metrics"><a href="/reading-year"><strong>{finished}</strong><span>Books finished</span></a><a href="/shelf"><strong>{shelf.filter(item=>item.status==='in_progress').length}</strong><span>Currently reading</span></a><a href="/shelf"><strong>{shelf.length}</strong><span>On your bookshelf</span></a><a href="/my-reviews"><strong>{ownReviews.length}</strong><span>Published reviews</span></a></div>
    <div className="room-progress-panels"><section className="room-dashboard-card"><div className="room-card-heading"><h2>Continue reading</h2><a href="/shelf">View my books →</a></div>{current.length?current.map(item=><article className="room-current-book" key={item.id}><a href={href(item.workId)}><Cover url={item.coverUrl} title={item.bookTitle}/></a><div><h3><a href={href(item.workId)}>{item.bookTitle}</a></h3><p>{item.author||'Author not confirmed'}</p><span className="dual-format">{label(item.format)}</span><Progress item={item}/><a href="/shelf" className="room-home-inline">Update progress →</a></div></article>):<div className="dual-empty">No active reads. <a href="/shelf">Start a book from your shelf →</a></div>}</section><section className="room-dashboard-card room-saved-card"><div className="room-card-heading"><h2>Next on your shelf</h2></div>{saved?<article className="room-current-book"><a href={href(saved.workId)}><Cover url={saved.coverUrl} title={saved.bookTitle}/></a><div><h3>{saved.bookTitle}</h3><p>{saved.author||'Saved to read later'}</p><a href={href(saved.workId)} className="room-home-primary">View book →</a></div></article>:<div className="dual-empty">Save books for later and they'll appear here. <a href="/books">Find a book →</a></div>}</section></div></>}
  <section className="room-dashboard-card room-discovery"><div className="room-card-heading"><h2>{newMember?'Recommended places to begin':'Discover your next story'}</h2><a href="/books">See more →</a></div>{books.length?<div className="room-discovery-books">{books.slice(0,5).map(book=><LinkedBook key={book.id} book={book}/>)}</div>:<div className="dual-empty">The catalogue is being verified. <a href="/books">Browse books →</a></div>}</section>
  <div className="room-footer-panels"><section className="room-dashboard-card"><div className="room-card-heading"><h2>Community reviews</h2><a href="/reviews">All reviews →</a></div><ReviewsRow reviews={reviews}/></section><section className="room-dashboard-card room-community-actions"><h2>Explore together</h2><a href="/discussions">Discussions →</a><a href="/clubs">Book clubs →</a><a href="/challenges">Reading challenges →</a></section></div>
 </div>;
}
