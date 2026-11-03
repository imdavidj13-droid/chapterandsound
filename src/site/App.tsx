import {MemberWorkspace} from './MemberWorkspace';
import {useEffect,useMemo,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import {routes,locationPath} from './routes';

type Book = {id:string;title:string;subtitle?:string;author?:string;coverUrl?:string;summary?:string;formats?:string[];year?:number};
type Review = {id:string;title?:string;body?:string;storyRating?:number;audioRating?:number;authorName?:string;bookTitle?:string;bookId?:string;format?:string;spoilers?:boolean;createdAt?:string};
type Member = {id:string;displayName:string;verified:boolean};
type ApiData = {books?:Book[];reviews?:Review[]};
type ScreenProps={path:string;query:URLSearchParams;data:ApiData;member:Member|null;navigate:(path:string)=>void};
const nav = ['/', '/books','/reviews','/community','/lists'];
const second = ['/authors','/narrators','/series','/recommendations','/discussions','/clubs','/challenges'];
const personal=['/shelf','/reading-year','/my-reviews','/preferences','/account'];
const A=(props:{href:string;children:ReactNode;className?:string})=><a className={props.className} href={props.href}>{props.children}</a>;
const title=(path:string)=>routes.find(r=>r.path===path)?.label??'Discover';
const cover=(b:Book)=><div className="book-cover">{b.coverUrl?<img src={b.coverUrl} alt={`Cover of ${b.title}`} loading="lazy"/>:<span aria-hidden="true" className="cover-mark">C<span>&</span>S</span>}</div>;

function AppLink({to,children,className}:{to:string;children:ReactNode;className?:string}){return <A href={to} className={className}>{children}</A>;}
function Tag({children}:{children:ReactNode}){return <span className="tag">{children}</span>;}
function Empty({heading,body,action,href}:{heading:string;body:string;action?:string;href?:string}){return <div className="empty"><span className="ornament" aria-hidden="true">✦</span><h3>{heading}</h3><p>{body}</p>{action&&href&&<AppLink className="button secondary" to={href}>{action}</AppLink>}</div>;}
function BookGrid({books}:{books:Book[]}){if(!books.length)return <Empty heading="The shelves are being prepared" body="Books will appear here when verified catalogue entries are available. Nothing has been invented to fill the space."/>;return <div className="book-grid">{books.map(b=><AppLink className="book-tile" to={'/book/'+encodeURIComponent(b.id)} key={b.id}>{cover(b)}<h3>{b.title}</h3><p>{b.author??'Author not yet confirmed'}</p><div className="small muted">{b.formats?.join(' · ')??'Editions being verified'}</div></AppLink>)}</div>;}
function ReviewCards({reviews}:{reviews:Review[]}){if(!reviews.length)return <Empty heading="The conversation starts here" body="No published community reviews yet. Once members publish, their own words and ratings will appear here."/>;return <div className="review-grid">{reviews.map(r=><article className="panel review-card" key={r.id}><p className="eyebrow">Community review · {r.format??'Book'}</p><h3><AppLink to={'/review/'+encodeURIComponent(r.id)}>{r.title||r.bookTitle||'Reader review'}</AppLink></h3><p className="muted">{r.bookTitle&&<span>{r.bookTitle} · </span>}By {r.authorName??'Reader'}</p>{r.storyRating!=null&&<p aria-label={`Story rating ${r.storyRating} out of 5`} className="stars">★ {r.storyRating}/5</p>}{r.spoilers?<p>Contains spoilers — open this review to reveal them.</p>:<p>{(r.body??'').slice(0,180)}</p>}<AppLink className="inline-link" to={'/review/'+encodeURIComponent(r.id)}>Read full review</AppLink></article>)}</div>;}
function Header({member}:{member:Member|null}){const [open,setOpen]=useState(false);return <header className="site-header"><div className="header-inner"><AppLink to="/" className="brand"><span className="brand-icon">✦</span><span>chapter <i>&</i> sound</span></AppLink><button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-menu" onClick={()=>setOpen(!open)}>{open?'Close':'Menu'} <span aria-hidden="true">{open?'×':'☰'}</span></button><nav className={open?'nav open':'nav'} id="main-menu" aria-label="Main navigation">{nav.map(path=><AppLink key={path} className={locationPath()===path?'active':''} to={path}>{path==='/'?'Home':title(path)}</AppLink>)}<AppLink to="/search">Search</AppLink>{member?<AppLink className="account-link" to="/shelf">My bookshelf</AppLink>:<AppLink className="account-link" to="/signup">Join the community</AppLink>}</nav></div></header>;}
function Footer(){return <footer className="site-footer"><div className="footer-inner"><div><div className="brand footer-brand">chapter <i>&</i> sound</div><p>Stories are better when shared. A home for every way of reading.</p></div><nav aria-label="Footer navigation">{['/about','/privacy','/terms','/authors','/narrators','/challenges'].map(p=><AppLink key={p} to={p}>{title(p)}</AppLink>)}</nav></div><div className="footer-last">© {new Date().getFullYear()} Chapter & Sound · Built for readers and listeners.</div></footer>;}
function PageHead({eyebrow,heading,intro,action}:{eyebrow?:string;heading:string;intro?:string;action?:ReactNode}){return <div className="page-head"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{heading}</h1>{intro&&<p className="intro">{intro}</p>}</div>{action&&<div>{action}</div>}</div>;}
function Home({data,member}:{data:ApiData;member:Member|null}){return <><section className="hero"><div className="hero-inner"><div className="hero-copy"><p className="eyebrow">A reading community for everyone</p><h1>Every story leaves <em>something behind.</em></h1><p>For the books you hold, the stories you read on screen, and the voices you carry with you. Discover, track, review and talk about what moves you.</p><div className="actions"><AppLink className="button" to={member?'/shelf':'/signup'}>{member?'My reading world':'Find your reading world'} <span aria-hidden="true">↗</span></AppLink><AppLink className="button quiet" to="/books">Explore books</AppLink></div></div><div className="hero-art" aria-label="Illustrated decorative book stack"><div className="art-arch"><div className="art-book one">CHAPTER</div><div className="art-book two">AND</div><div className="art-book three">SOUND</div><div className="art-sun">✧</div></div><div className="art-caption">A place for every kind of reader</div></div></div></section><section className="section"><div className="section-title"><div><p className="eyebrow">Find something worth reading</p><h2>Between these pages</h2></div><AppLink className="inline-link" to="/books">Browse all books →</AppLink></div><BookGrid books={(data.books??[]).slice(0,6)}/></section><section className="sage-band"><div className="section sage-content"><p className="eyebrow">Your story, your pace</p><h2>One bookshelf. Every format.</h2><p>Keep track of books, ebooks and audiobooks. Record your progress privately, revisit favourites, and share a review only when you're ready.</p><div className="feature-tiles">{[['01','Collect','Keep an organised bookshelf that belongs to you.'],['02','Reflect','Save personal notes, ratings and reading milestones.'],['03','Connect','Share reviews, join discussions and meet other readers.']].map(([n,h,d])=><div key={n}><span>{n}</span><h3>{h}</h3><p>{d}</p></div>)}</div></div></section><section className="section"><div className="section-title"><div><p className="eyebrow">From the community</p><h2>What readers are saying</h2></div><AppLink className="inline-link" to="/reviews">All reviews →</AppLink></div><ReviewCards reviews={(data.reviews??[]).slice(0,3)}/></section><section className="section"><div className="section-title"><div><p className="eyebrow">Beyond the last chapter</p><h2>Read together</h2></div></div><div className="three-cards"><AppLink to="/discussions" className="feature-card"><span>✳</span><h3>Discussions</h3><p>Conversations about stories, characters and the books that stay with us.</p><b>Explore discussions →</b></AppLink><AppLink to="/clubs" className="feature-card"><span>❦</span><h3>Book clubs</h3><p>Read alongside other people and discuss at your own pace.</p><b>Find a book club →</b></AppLink><AppLink to="/challenges" className="feature-card"><span>◇</span><h3>Reading challenges</h3><p>Discover new authors, genres and formats without the pressure.</p><b>See challenges →</b></AppLink></div></section></>;}
function FilteredBooks({data}:{data:ApiData}){const [term,setTerm]=useState('');const [format,setFormat]=useState('all');const results=(data.books??[]).filter(b=>(b.title+' '+(b.author??'')).toLowerCase().includes(term.toLowerCase())&&(format==='all'||b.formats?.includes(format)));return <><PageHead eyebrow="The catalogue" heading="Explore books" intro="One book, many ways to experience it. Discover works and choose the edition that's right for you."/><div className="filters"><label>Search books<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Title or author"/></label><label>Format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">All formats</option><option value="paperback">Paperback</option><option value="hardback">Hardback</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></label></div><BookGrid books={results}/><div className="notice">Can't find a book? Members will be able to request catalogue additions. Unverified editions are never substituted silently.</div></>;}
function Reviews({data}:{data:ApiData}){const [term,setTerm]=useState('');const [format,setFormat]=useState('all');const selected=(data.reviews??[]).filter(r=>((r.title??'')+' '+(r.bookTitle??'')+' '+(r.authorName??'')).toLowerCase().includes(term.toLowerCase())&&(format==='all'||r.format===format));return <><PageHead eyebrow="Thoughts worth sharing" heading="Community reviews" intro="Every opinion belongs to its reader. Explore spoiler-conscious reviews across print, ebooks and audio."/><div className="filters"><label>Search reviews<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Book, review or member"/></label><label>Format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="all">All formats</option><option>paperback</option><option>hardback</option><option>ebook</option><option>audiobook</option></select></label></div><ReviewCards reviews={selected}/></>;}
function Discovery({path,data}:{path:string;data:ApiData}){const config:Record<string,[string,string]> = {'/authors':['The people behind the pages','Explore authors, their work and complete bibliographies as their identities are verified.'],'/narrators':['The voices behind the stories','Discover narrators and the recordings they bring to life.'],'/series':['Find the next chapter','Explore series in reading order, including editions across formats.'],'/lists':['Handpicked for your next read','Discover member-created and curated book lists.'],'/recommendations':['What should I read next?','Ask the community for recommendations and share the reason behind your choices.'],'/discussions':['Good stories start conversations','Talk about a theme, a character or the ending you cannot stop thinking about.'],'/clubs':['Read along, together','Find a reading club with spoiler-aware discussion spaces.'],'/challenges':['A little adventure for your bookshelf','Gentle reading goals, new discoveries and progress at your own pace.'],'/community':['The reading room','The conversations, book clubs and shared reading adventures that bring us together.']};const [heading,intro]=config[path]??['Discover',''];const links=path==='/community'?['/discussions','/recommendations','/clubs','/challenges']:path==='/lists'?['/books','/reviews']:path==='/authors'||path==='/narrators'||path==='/series'?['/books','/search']:['/community','/books'];return <><PageHead eyebrow="Chapter & Sound" heading={heading} intro={intro}/><div className="two-column"><div className="panel large"><p className="eyebrow">{title(path)}</p><Empty heading="Nothing published here yet" body="This page is ready for real member content. No fictional members, conversations, challenges or books have been added." action="Explore the community" href="/community"/></div><aside className="panel sidebar"><h3>Explore more</h3><div className="side-links">{links.map(p=><AppLink key={p} to={p}>{title(p)} <span>↗</span></AppLink>)}</div>{data.books?.length?<p>Browse books from the verified catalogue.</p>:<p>Verified catalogue entries will appear when source integration is complete.</p>}</aside></div></>;}
function Search({data}:{data:ApiData}){const [search,setSearch]=useState(new URLSearchParams(window.location.search).get('q')??'');const matched=(data.books??[]).filter(b=>(b.title+' '+(b.author??'')).toLowerCase().includes(search.toLowerCase()));return <><PageHead eyebrow="Explore the library" heading="Find your next story" intro="Search the shared catalogue without duplicate entries for every review or format."/><label className="search-field">Title or author<input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="What are you looking for?"/></label>{search?<BookGrid books={matched}/>:<Empty heading="A story is waiting" body="Enter a book title or author to start searching."/>}</>;}
function BookDetail({data,id}:{data:ApiData;id:string}){const book=(data.books??[]).find(b=>b.id===id);if(!book)return <Empty heading="Book not found" body="This book may not have been added to the verified catalogue yet." action="Back to books" href="/books"/>;const reviews=(data.reviews??[]).filter(r=>r.bookId===id);return <><div className="detail-hero">{cover(book)}<div><p className="eyebrow">A book in the shared catalogue</p><h1>{book.title}</h1><p className="intro">{book.author??'Author unconfirmed'}</p><p>{book.summary??'A verified synopsis has not been added yet.'}</p><div className="actions"><AppLink to="/add-book" className="button">Add to my bookshelf</AppLink><AppLink to="/reviews" className="button secondary">Community reviews</AppLink></div></div></div><div className="section"><div className="section-title"><h2>Community reviews</h2></div><ReviewCards reviews={reviews}/></div></>;}
function ReviewDetail({data,id}:{data:ApiData;id:string}){const review=(data.reviews??[]).find(r=>r.id===id);const [reveal,setReveal]=useState(false);if(!review)return <Empty heading="Review not found" body="This review is not available or has not been published." action="All reviews" href="/reviews"/>;return <article className="reading-article"><p className="eyebrow">Community review · {review.format??'Book'}</p><h1>{review.title??review.bookTitle??'A reader’s thoughts'}</h1><p className="muted">By {review.authorName??'A community member'}</p>{review.storyRating!=null&&<p className="stars">★ Story {review.storyRating}/5</p>}{review.format==='audiobook'&&review.audioRating!=null&&<p>♪ Narration {review.audioRating}/5</p>}{review.spoilers&&!reveal?<div className="panel"><h3>Contains spoilers</h3><p>Review text is hidden until you choose to reveal it.</p><button type="button" className="button secondary" onClick={()=>setReveal(true)}>Reveal spoilers</button></div>:<p className="article-body">{review.body??'No written review.'}</p>}<AppLink to="/reviews" className="inline-link">← Back to community reviews</AppLink></article>;}
function Login({path}:{path:string}){
  const signUp=path==='/signup';
  const reset=path==='/reset-password';
  const verify=path==='/verify';
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    setLoading(true);setMessage('');setError('');
    const endpoint=verify?'/api/auth/send-verification-email'
      :reset?'/api/auth/request-password-reset'
      :signUp?'/api/auth/sign-up/email':'/api/auth/sign-in/email';
    const payload=verify?{email,callbackURL:'/onboarding'}:reset?{email,redirectTo:'/signin'}
      :signUp?{email,password,name:'New Reader'}:{email,password};
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json() as {message?:string;error?:string};
      if(!response.ok)throw Error(data.message??data.error??'Unable to complete this request');
      if(!signUp&&!reset&&!verify){window.location.assign('/shelf');return;}
      setMessage(signUp?'Check your inbox for a verification link. Your account is not verified yet.'
        :verify?'If the account is eligible, a new verification email has been requested.'
        :'If that address belongs to an account, password recovery instructions have been requested.');
      setPassword('');
    }catch(e){setError(e instanceof Error?e.message:'Request failed');}
    finally{setLoading(false);}
  };
  return <div className="auth-page"><p className="eyebrow">Chapter & Sound</p>
    <h1>{verify?'Check your inbox':signUp?'Your next chapter starts here':reset?'Reset your password':'Welcome back'}</h1>
    <p>{verify?'Request another secure verification link.':signUp?'Create an account. After verifying your email, make your reading world your own.':reset?'Enter the email used for your account.':'Sign in to your bookshelf, reading history and community.'}</p>
    {message&&<div className="notice" role="status">{message}</div>}
    {error&&<div className="notice error" role="alert">{error}</div>}
    <form className="panel auth-form" onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
      {!reset&&!verify&&<label>Password
        <input type={showPassword?'text':'password'} autoComplete={signUp?'new-password':'current-password'}
          minLength={signUp?8:undefined} required value={password} onChange={e=>setPassword(e.target.value)}
          placeholder={signUp?'Choose a secure password':'Your password'}/>
        <span className="toggle-password"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/> Show password</span>
      </label>}
      {signUp&&<p className="small">By creating an account you agree to our <AppLink to="/terms">Terms</AppLink> and <AppLink to="/privacy">Privacy Policy</AppLink>. Your reading history is private by default.</p>}
      <button disabled={loading} className="button" type="submit">{loading?'Working…':verify?'Resend verification':reset?'Request reset link':signUp?'Create account':'Sign in'}</button>
    </form>
    <p>{signUp?<AppLink to="/signin">Already a member? Sign in</AppLink>:
      <><AppLink to="/signup">Create an account</AppLink> · <AppLink to="/reset-password">Forgot password?</AppLink> · <AppLink to="/verify">Verify email</AppLink></>}</p>
  </div>;
}
function MemberPage({path,member,data}:{path:string;member:Member|null;data:ApiData}){
  if(!member)return <><PageHead eyebrow="Your reading world" heading={title(path)} intro="Your books, reflections and preferences are private unless you explicitly share them."/><Empty heading="Sign in to continue" body="Your personal reading world is linked to your verified cloud account. Please sign in to access it." action="Sign in" href="/signin"/></>;
  return <MemberWorkspace path={path} books={data.books??[]} member={member}/>;
}
function About({path}:{path:string}){return <><PageHead eyebrow="The little details" heading={title(path)}/><div className="reading-article">{path==='/about'?<><h2>Every way of reading counts.</h2><p>Chapter & Sound is being built as a public community for book reviews, reading tracking, discussions, book clubs and challenges. Ratings are member opinions, with story and audiobook narration scored separately.</p><h3>Our rating guide</h3><p>Members may leave a rating or a written review, or neither. Private ratings and notes are not public reviews.</p></>:<><h2>{path==='/privacy'?'Privacy principles':'Terms of service'}</h2><p>This page is a development placeholder, not a published legal policy. Account registration and public participation must remain disabled until the appropriate legal text, moderation rules and operational processes have been completed.</p></>}</div></>;}
function NotFound(){return <><PageHead heading="This page has wandered off" intro="The page you requested isn't available."/><Empty heading="Find your way back" body="There are plenty of stories to discover." action="Return home" href="/"/></>;}
export function App(){
  const [path,setPath]=useState(locationPath());
  const [api,setApi]=useState<ApiData>({books:[],reviews:[]});
  const [backendStatus,setBackendStatus]=useState<'loading'|'ready'|'offline'>('loading');
  const [member,setMember]=useState<Member|null>(null);
  useEffect(()=>{let cancelled=false;
    fetch('/api/me',{credentials:'include'}).then(r=>r.ok?r.json():null).then(v=>{
      if(!cancelled&&v?.member)setMember(v.member as Member);
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{const change=()=>setPath(locationPath());window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
  useEffect(()=>{let cancelled=false;Promise.all([fetch('/api/books').then(r=>{if(!r.ok)throw Error('books');return r.json();}),fetch('/api/reviews').then(r=>{if(!r.ok)throw Error('reviews');return r.json();})]).then(([books,reviews])=>{if(!cancelled){setApi({books:books.items??[],reviews:reviews.items??[]});setBackendStatus('ready');}}).catch(()=>{if(!cancelled)setBackendStatus('offline');});return()=>{cancelled=true;};},[]);
  const navigate=(to:string)=>{history.pushState({},'',to);setPath(locationPath());window.scrollTo(0,0);};
  useEffect(()=>{const click=(e:MouseEvent)=>{const anchor=(e.target as HTMLElement).closest('a');if(!anchor||anchor.target||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin)return;e.preventDefault();navigate(url.pathname+url.search);};document.addEventListener('click',click);return()=>document.removeEventListener('click',click);},[]);
  const query=useMemo(()=>new URLSearchParams(window.location.search),[path]);
  const args:ScreenProps={path,query,data:api,member,navigate};
  let body:ReactNode;
  if(path==='/')body=<Home data={api} member={member}/>;
  else if(path==='/books')body=<FilteredBooks data={api}/>;
  else if(path==='/reviews')body=<Reviews data={api}/>;
  else if(path==='/search')body=<Search data={api}/>;
  else if(path.startsWith('/book/'))body=<BookDetail data={api} id={decodeURIComponent(path.slice(6))}/>;
  else if(path.startsWith('/review/'))body=<ReviewDetail data={api} id={decodeURIComponent(path.slice(8))}/>;
  else if(second.includes(path)||['/community','/lists'].includes(path))body=<Discovery path={path} data={api}/>;
  else if(['/signin','/signup','/reset-password','/verify'].includes(path))body=<Login path={path}/>;
  else if(personal.includes(path)||['/add-book','/journal','/onboarding','/admin','/write-review'].includes(path))body=<MemberPage path={path} member={member} data={api}/>;
  else if(['/about','/privacy','/terms'].includes(path))body=<About path={path}/>;
  else body=<NotFound/>;
  return <><a className="skip-link" href="#main">Skip to content</a><Header member={member}/>{backendStatus==='offline'&&<div className="backend-alert" role="status">Live catalogue and review services are not connected. Content areas will remain empty rather than showing invented data.</div>}<main id="main" className={path==='/'?'home-main':'page-container'}>{body}</main><Footer/></>;
}
