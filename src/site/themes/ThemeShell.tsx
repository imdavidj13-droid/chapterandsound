import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {apiGet} from '../api';

export type ThemeId='editorial'|'reading-room';
export type MemberIdentity={id:string;displayName:string;verified:boolean};
export type BookPreview={id:string;title:string;author?:string;summary?:string;coverUrl?:string};
export type ReviewPreview={id:string;title?:string;bookTitle?:string;bookId?:string;authorName?:string;storyRating?:number;body?:string;spoilers?:boolean};
export type ThemeProps={theme:ThemeId;onThemeChange:(next:ThemeId)=>void;member:MemberIdentity|null;children:ReactNode;isHome:boolean;path:string;error?:string};
const editorialNav=[['/','My Home'],['/books','Discover'],['/reviews','Reviews'],['/shelf','My Bookshelf']];
const readingNav=[['/','Home','⌂'],['/reviews','Reviews','▤'],['/shelf','Bookshelf','▥'],['/authors','Authors','♙'],['/reading-year','My Year','▥'],['/community','Community','✧'],['/account','Account','◉']];
function ThemeChoice({theme,onChange}:{theme:ThemeId;onChange:(v:ThemeId)=>void}){
 return <div className="theme-control" role="group" aria-label="Website appearance">
   <button type="button" className={theme==='editorial'?'is-selected':''} aria-pressed={theme==='editorial'} onClick={()=>onChange('editorial')}>Editorial</button>
   <button type="button" className={theme==='reading-room'?'is-selected':''} aria-pressed={theme==='reading-room'} onClick={()=>onChange('reading-room')}>Reading Room</button>
 </div>;
}
function GlobalBookSearch({compact=false}:{compact?:boolean}){
 const [query,setQuery]=useState('');
 return <form action="/search" method="get" role="search" className={compact?'room-top-search room-top-search-form':'editorial-global-search'}>
  <span aria-hidden="true" className="global-search-icon">⌕</span>
  <input type="search" name="q" value={query} onChange={e=>setQuery(e.target.value)}
   aria-label="Search books and authors" placeholder="Search books, authors or keywords…"/>
  <button type="submit" aria-label="Search catalogue">Search</button>
 </form>;
}
function ProfileMenu({member}:{member:MemberIdentity|null}){
 const initials=member?.displayName?.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'↗';
 return <details className="global-profile-menu">
  <summary aria-label={member?'Account menu for '+member.displayName:'Account menu'}>
   <span className="global-profile-avatar" aria-hidden="true">{initials}</span>
   <span className="global-profile-label">{member?.displayName||'Sign in'}</span>
   <span className="global-profile-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="global-profile-dropdown">
   {member?<><strong>{member.displayName}</strong><a href="/account">My account</a><a href="/shelf">My bookshelf</a><a href="/reading-year">My reading year</a></>:<><strong>Welcome, reader</strong><a href="/signin">Sign in</a><a href="/signup">Create account</a></>}
  </div>
 </details>;
}
function SiteBrand(){return <a href="/" className="theme-brand"><span aria-hidden="true" className="theme-book-icon">◫</span><span>Chapter <em>&</em> Sound</span></a>}
function EditorialHeader({member,theme,onThemeChange,path}:{member:MemberIdentity|null;theme:ThemeId;onThemeChange:(v:ThemeId)=>void;path:string}){
 const [open,setOpen]=useState(false);
 return <header className="editorial-header"><div className="editorial-header-inner"><SiteBrand/><GlobalBookSearch/>
  <button className="theme-menu-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Menu'} <span aria-hidden="true">☰</span></button>
  <nav className={open?'editorial-menu open':'editorial-menu'} aria-label="Editorial navigation">{editorialNav.map(([url,label])=><a key={url} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}<a href="/community">Community</a><ThemeChoice theme={theme} onChange={onThemeChange}/>
  </nav><ProfileMenu member={member}/></div></header>;
}
function RoomHeader({member,theme,onThemeChange,open,setOpen}:{member:MemberIdentity|null;theme:ThemeId;onThemeChange:(v:ThemeId)=>void;open:boolean;setOpen:(v:boolean)=>void}){
 return <header className="room-topbar"><button className="room-mobile-toggle" aria-label={open?'Close Reading Room navigation':'Open Reading Room navigation'} aria-expanded={open} onClick={()=>setOpen(!open)} type="button">☰</button><GlobalBookSearch compact/><div className="room-top-actions"><ThemeChoice theme={theme} onChange={onThemeChange}/><ProfileMenu member={member}/></div></header>;
}
export function ThemeShell({theme,onThemeChange,member,children,isHome,path,error}:ThemeProps){
 const [open,setOpen]=useState(false);
 if(theme==='editorial')return <div className="theme-editorial"><a className="skip-link" href="#main">Skip to content</a><EditorialHeader member={member} theme={theme} onThemeChange={onThemeChange} path={path}/>
 {error&&<div className="backend-alert" role="status">{error}</div>}
 <main id="main" className={isHome?'home-main':'page-container'}>{children}</main>
 <footer className="editorial-footer"><div className="editorial-footer-main"><SiteBrand/><p>Books, people, brighter days. A little home for every way of reading.</p><div className="editorial-footer-links"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/community">Community</a></div></div></footer></div>;
 return <div className="theme-reading-room"><a className="skip-link" href="#main">Skip to content</a>
  <div className="room-layout">
   <aside className={open?'room-sidebar is-open':'room-sidebar'} aria-label="Reading Room navigation">
    <SiteBrand/><p className="room-subbrand">Books. People. Brighter days.</p>
    <nav aria-label="Reading Room main navigation">{readingNav.map(([url,label,icon])=><a href={url} key={url} aria-current={path===url?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true" className="room-nav-icon">{icon}</span>{label}</a>)}</nav>
    <div className="room-sidebar-lower"><p className="room-quote">“Good stories sound even better here.”</p><ThemeChoice theme={theme} onChange={onThemeChange}/><a href="/about" className="room-small-link">About Chapter & Sound</a></div>
   </aside>
   {open&&<button className="room-sidebar-scrim" type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
   <div className="room-content"><RoomHeader member={member} theme={theme} onThemeChange={onThemeChange} open={open} setOpen={setOpen}/>
    {error&&<div className="backend-alert" role="status">{error}</div>}
    <main id="main" className={isHome?'room-home-main':path.startsWith('/person/')?'room-page-main room-author-profile-page':'room-page-main'}>{children}</main>
    <footer className="room-footer"><span>Chapter & Sound · Your reading world</span><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>
   </div>
  </div></div>;
}
export function RoomHome({member,books,reviews,presentation}:{member:MemberIdentity|null;books:BookPreview[];reviews:ReviewPreview[];presentation?:{heading:string;intro:string}}){
 return <div className="room-dashboard">
 <section className="room-welcome"><p className="eyebrow">The Reading Room / {member?'Your home':'Welcome'}</p><h1>{member?`Welcome to your reading world, ${member.displayName}.`:(presentation?.heading||'Welcome to the Reading Room.')}</h1><p>{presentation?.intro||'Honest reviews, books you read and listen to, and the stories that stay with you.'}</p><div className="room-format-strip"><span>▤ Print</span><span>▯ Ebooks</span><span>◉ Audiobooks</span></div></section>
 <div className="room-home-columns">
  <section className="room-home-panel room-latest">
   <p className="eyebrow">Latest community review</p>
   {reviews.length?<><h2><a href={'/review/'+encodeURIComponent(reviews[0]!.id)}>{reviews[0]!.spoilers?'Review contains spoilers':reviews[0]!.title||reviews[0]!.bookTitle||'A reader’s thoughts'}</a></h2><p>{reviews[0]!.authorName||'A community reader'}</p><p>{reviews[0]!.spoilers?'Open this review to choose whether to reveal spoilers.':(reviews[0]!.body?.slice(0,210)||'A published review is available.')}</p><a className="room-inline-cta" href={'/review/'+encodeURIComponent(reviews[0]!.id)}>Read full review →</a></>:<><h2>The first review is still to come.</h2><p>Only published reviews will appear here.</p><a className="room-inline-cta" href="/reviews">Explore reviews →</a></>}
  </section>
  <section className="room-home-panel"><p className="eyebrow">Your next chapter</p><h2>{member?'Keep your reading moving':'A bookshelf of your own'}</h2><p>{member?'Track your book progress, save private notes and choose when to share.':'Create a reading home that works for print, ebooks and audio.'}</p><a className="room-primary-link" href={member?'/shelf':'/signup'}>{member?'Open my bookshelf':'Join the Reading Room'} →</a><a className="room-inline-cta" href="/add-book">Add a book →</a></section>
  <section className="room-home-panel room-home-summary"><p className="eyebrow">My Reading Year</p><h2>Every book counts.</h2><p>Explore your own reading history, formats and milestones. Figures come from saved reading records.</p><a className="room-primary-link" href={member?'/reading-year':'/signin'}>{member?'View my year':'Sign in to see your year'} →</a></section>
 </div>
 <section className="room-recent-books"><div className="room-section-heading"><div><p className="eyebrow">On the bookshelf</p><h2>Stories to discover</h2></div><a href="/books">Explore books →</a></div>
 {books.length?<div className="room-book-strip">{books.slice(0,6).map(book=><a href={'/book/'+encodeURIComponent(book.id)} key={book.id} className="room-book"><div className="room-book-blank">{book.coverUrl?<img src={book.coverUrl} alt={'Cover of '+book.title}/>:<span>Chapter<br/>& Sound</span>}</div><h3>{book.title}</h3><p>{book.author||'Author to be confirmed'}</p></a>)}</div>:<div className="room-empty-shelf"><h3>Books will appear as the catalogue is verified.</h3><p>No invented book covers, reading statistics or member reviews are used in your live Reading Room.</p><a href="/books">Browse the book collection →</a></div>}
 </section>
 <section className="room-community-tiles"><a href="/discussions"><strong>Conversations</strong><span>Talk about the stories you love →</span></a><a href="/clubs"><strong>Book clubs</strong><span>Read together at your own pace →</span></a><a href="/challenges"><strong>Reading challenges</strong><span>Try something new →</span></a></section>
 </div>;
}
export function RoomShelf({member}:{member:MemberIdentity}){
 type ShelfBook={id:string;workId:string;bookTitle:string;author?:string|null;coverUrl?:string|null;status:string;format:string|null;progressValue:number|null;progressUnit:string|null;privateRating?:number|null;startedAt?:string|null;finishedAt?:string|null};
 const [items,setItems]=useState<ShelfBook[]>([]);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [status,setStatus]=useState('all'),[term,setTerm]=useState(''),[sort,setSort]=useState('recent');
 useEffect(()=>{let active=true;setLoading(true);
  apiGet<{items:ShelfBook[]}>('/api/member/shelf')
   .then(r=>{if(active){setItems(r.items);setError('')}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load shelf')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[member.id]);
 const statuses=[['all','All books'],['in_progress','Reading now'],['want_to_read','Want to read'],['finished','Finished'],['paused','Paused'],['dnf','Did not finish']] as const;
 const statusText=(value:string)=>({in_progress:'Currently reading',want_to_read:'Want to read',finished:'Finished',paused:'Paused',dnf:'Did not finish'} as Record<string,string>)[value]||value;
 const formatText=(value:string|null)=>({ebook:'Ebook',audiobook:'Audiobook',paperback:'Paperback',hardback:'Hardback'} as Record<string,string>)[value||'']||value||'Edition not specified';

 const counts={all:items.length,finished:items.filter(x=>x.status==='finished').length,reading:items.filter(x=>x.status==='in_progress').length,want:items.filter(x=>x.status==='want_to_read').length};
 const [reviews,setReviews]=useState<{id:string;bookId:string;bookTitle:string;title?:string|null;body?:string|null;storyRating?:number|null;audioRating?:number|null;status:string;visibility:string;spoilers?:boolean}[]>([]);
 const [year,setYear]=useState<{year:number;uniqueBooks:number;items:{format?:string|null}[]}|null>(null);
 const [section,setSection]=useState<'books'|'reviews'>('books');
 useEffect(()=>{let active=true;
  void Promise.allSettled([
   apiGet<{items:typeof reviews}>('/api/member/reviews'),
   apiGet<{year:number;uniqueBooks:number;items:{format?:string|null}[]}>('/api/member/reading-year')
  ]).then(([r,y])=>{if(!active)return;
   if(r.status==='fulfilled')setReviews(r.value.items.filter(x=>x.status==='published'&&x.visibility==='public'));
   if(y.status==='fulfilled')setYear(y.value);
  });
  return()=>{active=false};
 },[member.id]);
 const filtered=items.filter(x=>(status==='all'||x.status===status)&&[x.bookTitle,x.author||''].some(v=>v.toLowerCase().includes(term.trim().toLowerCase())))
  .sort((a,b)=>sort==='title'?a.bookTitle.localeCompare(b.bookTitle):sort==='author'?(a.author||'').localeCompare(b.author||''):0);
 const current=items.find(x=>x.status==='in_progress')||null;
 const listening=items.find(x=>x.status==='in_progress'&&x.format==='audiobook')||null;
 const latest=reviews[0]||null;
 const latestBook=latest?items.find(x=>x.workId===latest.bookId):null;
 const yearAudio=year?.items.filter(x=>x.format==='audiobook').length;
 const short=(value:string,max=170)=>value.length>max?value.slice(0,max).trimEnd()+'…':value;
 const Cover=({book,small=false}:{book:ShelfBook;small?:boolean})=><a className={small?'room-editorial-cover small':'room-editorial-cover'} href={'/book/'+encodeURIComponent(book.workId)} aria-label={'View '+book.bookTitle}>
  {book.coverUrl?<img src={book.coverUrl} alt={'Cover of '+book.bookTitle} loading="lazy" onError={e=>{e.currentTarget.hidden=true;e.currentTarget.parentElement?.classList.add('cover-missing')}}/>:<span className="room-editorial-cover-fallback">Chapter<br/>&amp; Sound</span>}
 </a>;
 return <div className="room-shelf room-shelf-magazine">
  <section className="room-shelf-magazine-hero">
   <div className="room-shelf-magazine-hero-copy">
    <p className="eyebrow">THE READING ROOM / MY BOOKSHELF</p>
    <h1>Welcome to my bookshelf.</h1>
    <p>Every story you read, listen to and recommend — all together in your own reading space.</p>
    <div className="room-shelf-format-row"><span>▤ &nbsp; Print</span><span>▯ &nbsp; Ebooks</span><span>◉ &nbsp; Audiobooks</span></div>
   </div>
   <div className="room-shelf-magazine-quote">Same stories.<br/>Different ways<br/>to belong.</div>
  </section>
  <div className="room-shelf-magazine-panels">
   <section className="room-magazine-panel room-magazine-feature">
    <header><h2>Latest Review</h2><a href="/reviews">All reviews →</a></header>
    {latest?<div className="room-magazine-feature-body">
     {latestBook&&<Cover book={latestBook}/>}
     <div className="room-magazine-feature-copy">
      <h3><a href={'/review/'+encodeURIComponent(latest.id)}>{latestBook?.bookTitle||latest.bookTitle}</a></h3>
      {latestBook?.author&&<p className="room-magazine-author">{latestBook.author}</p>}
      {latest.body&&!latest.spoilers&&<p className="room-magazine-excerpt">{short(latest.body)}</p>}
      {latest.storyRating!=null&&<p className="room-magazine-rating">★ {latest.storyRating.toFixed(1)} / 5 <span>Story rating</span></p>}
      <a className="room-magazine-cta" href={'/review/'+encodeURIComponent(latest.id)}>Read full review →</a>
     </div>
    </div>:<div className="room-magazine-empty"><h3>Your latest review will appear here.</h3><p>Publish a review to feature your thoughts about a book.</p><a href="/reviews">Explore reviews →</a></div>}
   </section>
   <section className="room-magazine-panel room-magazine-feature">
    <header><h2>Currently Listening</h2><a href="/shelf">My shelf →</a></header>
    {listening?<div className="room-magazine-feature-body">
      <Cover book={listening}/><div className="room-magazine-feature-copy">
       <h3><a href={'/book/'+encodeURIComponent(listening.workId)}>{listening.bookTitle}</a></h3>
       <p className="room-magazine-author">{listening.author||'Author not yet confirmed'}</p>
       <p className="room-magazine-excerpt">Your audiobook is in progress.</p>
       {listening.progressValue!=null&&<p className="room-magazine-progress">Progress: {listening.progressValue} {listening.progressUnit||''}</p>}
       <a className="room-magazine-cta" href={'/book/'+encodeURIComponent(listening.workId)}>View book details →</a>
      </div>
     </div>:<div className="room-magazine-empty"><h3>No audiobook in progress</h3><p>When you start listening to an audiobook, it will appear here with its real progress.</p><a href="/add-book">Add an audiobook →</a></div>}
   </section>
   <div className="room-magazine-side-panels">
    <section className="room-magazine-panel room-magazine-year">
     <header><h2>My Year</h2><a href="/reading-year">{year?.year||new Date().getFullYear()} →</a></header>
     <div className="room-magazine-year-grid"><div><strong>{year?.uniqueBooks??'—'}</strong><span>Books finished</span></div><div><strong>{yearAudio??'—'}</strong><span>Audiobooks finished</span></div><div><strong>{counts.all}</strong><span>Books on shelf</span></div><div><strong>{counts.reading}</strong><span>Reading now</span></div></div>
    </section>
    <section className="room-magazine-panel room-magazine-about">
     <h2>About {member.displayName}</h2>
     <div className="room-magazine-about-content"><span className="room-magazine-profile-initial" aria-hidden="true">{member.displayName.slice(0,1).toUpperCase()}</span>
      <p>Your personal corner of Chapter &amp; Sound. Keep track of the books and audiobooks that stay with you.</p></div>
     <a className="room-magazine-cta" href="/account">My account →</a>
    </section>
   </div>
  </div>
  <section className="room-magazine-lower">
   <header><div className="room-magazine-tabs" role="group" aria-label="Bookshelf content">
    <button type="button" aria-pressed={section==='books'} className={section==='books'?'active':''} onClick={()=>setSection('books')}>My Bookshelf <span>{items.length}</span></button>
    <button type="button" aria-pressed={section==='reviews'} className={section==='reviews'?'active':''} onClick={()=>setSection('reviews')}>Recent Reviews <span>{reviews.length}</span></button>
   </div><a href={section==='books'?'/add-book':'/reviews'}>{section==='books'?'Add a book':'All reviews'} →</a></header>
   {section==='books'?<>
    <nav className="room-magazine-status-tabs" aria-label="Reading status">{statuses.map(([key,label])=><button key={key} type="button" className={status===key?'selected':''} aria-pressed={status===key} onClick={()=>setStatus(key)}>{label} <span>{key==='all'?counts.all:items.filter(x=>x.status===key).length}</span></button>)}</nav>
    <div className="room-magazine-filter"><input aria-label="Search your shelf" type="search" value={term} placeholder="Search by title or author…" onChange={e=>setTerm(e.target.value)}/><select aria-label="Sort your shelf" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently added</option><option value="title">Book title</option><option value="author">Author</option></select></div>
    {loading?<p role="status">Loading your cloud bookshelf…</p>:error?<p role="alert">{error}</p>:filtered.length?<div className="room-magazine-book-grid">{filtered.map(book=><article className="room-magazine-book" key={book.id}>
     <Cover book={book} small/><h3><a href={'/book/'+encodeURIComponent(book.workId)}>{book.bookTitle}</a></h3>
     <p>{book.author||'Author not yet confirmed'}</p>
     <span className="room-magazine-book-status">{statusText(book.status)} · {formatText(book.format)}</span>
     {book.privateRating!=null&&<small>★ {book.privateRating.toFixed(1)}/5 · Your rating</small>}
    </article>)}</div>:<div className="room-magazine-empty"><h3>No matching books</h3><p>Try another filter or add a book to your shelf.</p><a href="/add-book">Add a book →</a></div>}
   </>:reviews.length?<div className="room-magazine-book-grid">{reviews.slice(0,12).map(review=>{
    const book=items.find(x=>x.workId===review.bookId);
    return <article className="room-magazine-book" key={review.id}>
     {book&&<Cover book={book} small/>}<h3><a href={'/review/'+encodeURIComponent(review.id)}>{book?.bookTitle||review.bookTitle}</a></h3>
     <p>{book?.author||'Published review'}</p><span className="room-magazine-book-status">{review.storyRating!=null?'★ '+review.storyRating.toFixed(1)+'/5':'No rating'}</span>
     <a href={'/review/'+encodeURIComponent(review.id)}>Read review →</a>
    </article>;
   })}</div>:<div className="room-magazine-empty"><h3>No published reviews yet</h3><p>When you publish a book review, it will appear here.</p><a href="/reviews">See reviews →</a></div>}
  </section>
 </div>;
}
