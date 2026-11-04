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
function SiteBrand(){return <a href="/" className="theme-brand"><span aria-hidden="true" className="theme-book-icon">◫</span><span>Chapter <em>&</em> Sound</span></a>}
function EditorialHeader({member,theme,onThemeChange,path}:{member:MemberIdentity|null;theme:ThemeId;onThemeChange:(v:ThemeId)=>void;path:string}){
 const [open,setOpen]=useState(false);
 return <header className="editorial-header"><div className="editorial-header-inner"><SiteBrand/><GlobalBookSearch/>
  <button className="theme-menu-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Menu'} <span aria-hidden="true">☰</span></button>
  <nav className={open?'editorial-menu open':'editorial-menu'} aria-label="Editorial navigation">{editorialNav.map(([url,label])=><a key={url} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}<a href="/community">Community</a><a href={member?'/account':'/signin'}>{member?member.displayName:'Sign in'}</a>
   <ThemeChoice theme={theme} onChange={onThemeChange}/>
  </nav></div></header>;
}
function RoomHeader({member,theme,onThemeChange,open,setOpen}:{member:MemberIdentity|null;theme:ThemeId;onThemeChange:(v:ThemeId)=>void;open:boolean;setOpen:(v:boolean)=>void}){
 return <header className="room-topbar"><button className="room-mobile-toggle" aria-label={open?'Close Reading Room navigation':'Open Reading Room navigation'} aria-expanded={open} onClick={()=>setOpen(!open)} type="button">☰</button><GlobalBookSearch compact/><div className="room-top-actions"><ThemeChoice theme={theme} onChange={onThemeChange}/><a href={member?'/account':'/signin'} className="room-person" aria-label={member?'Your account':'Sign in'}>{member?.displayName?.slice(0,1).toUpperCase()||'↗'}</a></div></header>;
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
    <main id="main" className={isHome?'room-home-main':'room-page-main'}>{children}</main>
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
 const [items,setItems]=useState<{id:string;workId:string;bookTitle:string;author?:string|null;coverUrl?:string|null;status:string;format:string|null;progressValue:number|null;progressUnit:string|null}[]>([]);
 const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [status,setStatus]=useState('all');const [term,setTerm]=useState('');
 useEffect(()=>{let active=true;apiGet<{items:typeof items}>('/api/member/shelf').then(r=>{if(active)setItems(r.items)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load shelf')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const statuses=[['all','All books'],['in_progress','In progress'],['want_to_read','Want to read'],['finished','Finished'],['paused','Paused'],['dnf','Did not finish']];
 const filtered=items.filter(x=>(status==='all'||x.status===status)&&x.bookTitle.toLowerCase().includes(term.toLowerCase()));
 return <div className="room-shelf"><div className="room-page-heading"><div><p className="eyebrow">My bookshelf</p><h1>My Bookshelf</h1><p>Stories in print, on screen and in your ears.</p></div><a href="/add-book" className="room-primary-link">+ Add a book</a></div>
 <div className="room-shelf-stats"><div><span>▤</span><strong>{items.filter(x=>x.status==='finished').length}</strong><small>Finished</small></div><div><span>◉</span><strong>{items.filter(x=>x.status==='in_progress').length}</strong><small>In progress</small></div><div><span>▧</span><strong>{items.length}</strong><small>Total records</small></div></div>
 <nav className="room-shelf-tabs" aria-label="Bookshelf status">{statuses.map(([key,label])=><button key={key} type="button" className={key===status?'selected':''} aria-pressed={key===status} onClick={()=>setStatus(key)}>{label}<span>{key==='all'?items.length:items.filter(x=>x.status===key).length}</span></button>)}</nav>
 <label className="room-shelf-search">Search your bookshelf<input type="search" placeholder="Search books on your shelf…" value={term} onChange={e=>setTerm(e.target.value)}/></label>
 {loading?<p role="status">Loading your cloud bookshelf…</p>:error?<div className="notice error" role="alert">{error}</div>:filtered.length?<div className="room-shelf-grid">{filtered.map(book=><article className="room-shelf-card" key={book.id}><div className="room-shelf-cover">{book.coverUrl?<img src={book.coverUrl} alt={`Cover of ${book.bookTitle}`} loading="lazy" onError={e=>{e.currentTarget.hidden=true;e.currentTarget.parentElement?.classList.add("room-shelf-cover-missing")}}/>:<span className="room-shelf-cover-fallback" aria-hidden="true">C&amp;S</span>}</div><div><h3><a href={'/book/'+encodeURIComponent(book.workId)}>{book.bookTitle}</a></h3>{book.author&&<p className="room-shelf-author">{book.author}</p>}<p className="room-shelf-format">{book.format||'Edition not chosen'}</p><span className="room-shelf-status">{statuses.find(([key])=>key===book.status)?.[1]||book.status}</span>{book.progressValue!=null&&<p>{book.progressValue} {book.progressUnit||'logged'}</p>}<a className="room-inline-cta" href={'/book/'+encodeURIComponent(book.workId)}>View this book →</a></div></article>)}</div>:<div className="room-empty-shelf"><h2>{items.length?'No books match these filters':'Your bookshelf starts here.'}</h2><p>{items.length?'Change your search or status to find another book.':'Add a book you are reading, listening to or saving for later.'}</p><a className="room-primary-link" href="/add-book">Add a book →</a></div>}
 </div>;
}
