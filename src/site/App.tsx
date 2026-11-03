import {ConfirmEmailPage} from './ConfirmEmailPage';
import {PublicReaderPage} from './PublicReaderPage';
import {ThemeShell,RoomHome,RoomShelf} from './themes/ThemeShell';
import type {ThemeId} from './themes/ThemeShell';
import {apiGet,apiWrite} from './api';
import {PublicBookPage} from './PublicBookPage';
import {PublicReviewPage} from './PublicReviewPage';
import {PeopleAndSeries} from './PeopleAndSeries';
import {CommunityWorkspace} from './CommunityWorkspace';
import {MemberWorkspace} from './MemberWorkspace';
import {useEffect,useMemo,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import {routes,locationPath} from './routes';

type Book = {id:string;title:string;subtitle?:string;author?:string;coverUrl?:string;summary?:string;formats?:string[];year?:number};
type Review = {id:string;title?:string;body?:string;storyRating?:number;audioRating?:number;authorName?:string;authorHandle?:string|null;bookTitle?:string;bookId?:string;format?:string;spoilers?:boolean;createdAt?:string};
type Member = {id:string;displayName:string;handle?:string|null;verified:boolean;role?:'admin'|'moderator'|null};
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
function ReviewCards({reviews}:{reviews:Review[]}){if(!reviews.length)return <Empty heading="The conversation starts here" body="No published community reviews yet. Once members publish, their own words and ratings will appear here."/>;return <div className="review-grid">{reviews.map(r=><article className="panel review-card" key={r.id}><p className="eyebrow">Community review · {r.format??'Book'}</p><h3><AppLink to={'/review/'+encodeURIComponent(r.id)}>{r.spoilers?'Review contains spoilers':(r.title||r.bookTitle||'Reader review')}</AppLink></h3><p className="muted">{r.bookTitle&&<span>{r.bookTitle} · </span>}By {r.authorHandle?<AppLink to={'/reader/'+encodeURIComponent(r.authorHandle)}>{'@'+r.authorHandle}</AppLink>:(r.authorName??'Reader')}</p>{r.storyRating!=null&&<p aria-label={`Story rating ${r.storyRating} out of 5`} className="stars">★ {r.storyRating}/5</p>}{r.spoilers?<p>Contains spoilers — open this review to reveal them.</p>:<p>{(r.body??'').slice(0,180)}</p>}<AppLink className="inline-link" to={'/review/'+encodeURIComponent(r.id)}>Read full review</AppLink></article>)}</div>;}
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
  const signUp=path==='/signup',reset=path==='/reset-password',verify=path==='/verify';
  const [name,setName]=useState('');
  const [nameStatus,setNameStatus]=useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle');
  const [email,setEmail]=useState(()=>new URLSearchParams(window.location.search).get('email')??'');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [agreed,setAgreed]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!signUp)return;
    if(!name){setNameStatus('idle');return}
    if(!/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(name)){setNameStatus('invalid');return}
    let active=true;const controller=new AbortController();
    setNameStatus('checking');
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch('/api/auth/is-username-available',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name}),signal:controller.signal});
        if(!response.ok)throw Error('Username availability cannot be checked');
        const result=await response.json() as {available:boolean};
        if(active)setNameStatus(result.available?'available':'taken');
      }catch{if(active&&!controller.signal.aborted)setNameStatus('idle')}
    },350);
    return()=>{active=false;clearTimeout(timer);controller.abort()}
  },[name,signUp]);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError('');setMessage('');
    if(signUp){
      if(!/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(name)){setError('Use 3–30 letters, numbers or underscores, starting with a letter.');return;}
      if(nameStatus==='taken'){setError('That username is already taken.');return;}
      if(password.length<12){setError('Use a password of at least 12 characters.');return;}
      if(password!==confirm){setError('Your passwords do not match.');return;}
      if(!agreed){setError('Please agree to the Terms and Privacy Policy to continue.');return;}
    }
    setLoading(true);
    const endpoint=verify?'/api/auth/send-verification-email'
      :reset?'/api/auth/request-password-reset'
      :signUp?'/api/auth/sign-up/email':'/api/auth/sign-in/email';
    const payload=verify?{email,callbackURL:'/onboarding'}
      :reset?{email,redirectTo:'/signin'}
      :signUp?{email,password,name,username:name,callbackURL:'/onboarding'}
      :{email,password};
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json() as {message?:string;error?:string;code?:string};
      if(!response.ok)throw Error(data.message??data.error??'Unable to complete this request');
      setPassword('');setConfirm('');
      if(signUp){window.location.assign('/verify?email='+encodeURIComponent(email));return;}
      if(!reset&&!verify){window.location.assign('/onboarding');return;}
      setMessage(verify?'If this address has a pending verification, an email has been requested.':'If an account matches this address, recovery instructions have been requested.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to contact the sign-in service.');}
    finally{setLoading(false);}
  };
  return <div className="auth-experience">
    <div className="auth-description">
      <p className="eyebrow">{signUp?'01 / Create account':verify?'02 / Check your email':reset?'Account recovery':'Welcome back'}</p>
      <h1>{signUp?'Your next chapter starts here.':verify?'Check your inbox.':reset?'Start again, securely.':'Welcome back to your reading world.'}</h1>
      <p className="intro">{signUp?'Keep a bookshelf of stories, review what you read and listen to, and meet fellow readers.':verify?'Open the verification link we send you before accessing your private reading records.':reset?'We will send a secure password-reset link if your address is registered.':'Sign in to the books, reviews and reading history that belong to you.'}</p>
      <div className="auth-promise-grid"><div><strong>01</strong><span>Save every format.</span></div><div><strong>02</strong><span>Track your own reading.</span></div><div><strong>03</strong><span>Share on your terms.</span></div></div>
    </div>
    <div className="auth-panel panel">
      <h2>{signUp?'Create your account':verify?'Email verification':reset?'Reset your password':'Sign in'}</h2>
      <p className="muted">{signUp?'Use a real email address. We will send you a verification link.':verify?'Your email must be verified before you can sign in.':reset?'Enter the email associated with your account.':'Access your personal bookshelf and settings.'}</p>
      {error&&<div className="notice error" role="alert">{error}</div>}
      {message&&<div className="notice" role="status">{message}</div>}
      <form className="auth-fields" onSubmit={submit}>
        {signUp&&<label>Username <span className="username-entry"><span aria-hidden="true">@</span><input name="username" autoComplete="username" required minLength={3} maxLength={30} pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}" value={name} onChange={e=>setName(e.target.value.toLowerCase())} placeholder="yourusername" aria-describedby="username-guidance username-status"/></span>
          <small id="username-guidance">Your public identity on Chapter & Sound. 3–30 letters, numbers or underscores; starts with a letter.</small>
          <span id="username-status" role="status" className={'username-status '+nameStatus}>{nameStatus==='available'?'✓ Username available':nameStatus==='taken'?'Username already taken':nameStatus==='checking'?'Checking availability…':nameStatus==='invalid'?'Invalid username format':name?'':'Your reviews and public profile will show @'+(name||'yourusername')}</span>
        </label>}
        <label>Email address<input name="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
        {!reset&&!verify&&<>
          <label>Password<input type={showPassword?'text':'password'} autoComplete={signUp?'new-password':'current-password'} required minLength={signUp?12:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder={signUp?'At least 12 characters':'Your password'}/></label>
          <label className="auth-check"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/> Show password</label>
        </>}
        {signUp&&<>
          <label>Confirm password<input type={showPassword?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Enter your password again"/></label>
          <label className="auth-check"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/><span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</span></label>
        </>}
        <button className="button" type="submit" disabled={loading}>{loading?'Please wait…':verify?'Resend verification email':reset?'Request reset link':signUp?'Create account':'Sign in'}</button>
      </form>
      <div className="auth-options">{signUp?<p>Already a member? <a href="/signin">Sign in</a></p>:verify?<p><a href="/signin">Back to sign in</a> · <a href="/signup">Use a different address</a></p>:reset?<p><a href="/signin">Back to sign in</a></p>:<><a href="/reset-password">Forgotten your password?</a><p>New to Chapter & Sound? <a href="/signup">Create an account</a></p><p><a href="/verify">Resend a verification link</a></p></>}</div>
    </div>
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
  const [theme,setTheme]=useState<ThemeId>('editorial');
  const [themeError,setThemeError]=useState('');
  const [themeReady,setThemeReady]=useState(false);
  useEffect(()=>{let cancelled=false;
    fetch('/api/me',{credentials:'include'}).then(r=>r.ok?r.json():null).then(v=>{
      if(!cancelled&&v?.member)setMember(v.member as Member);
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{let active=true;if(!member?.verified){setThemeReady(true);return()=>{active=false};}setThemeReady(false);
    apiGet<{themeId:ThemeId}>('/api/member/theme').then(v=>{if(active)setTheme(v.themeId==='reading-room'?'reading-room':'editorial')})
      .catch(()=>{if(active)setThemeError('Your saved theme could not be loaded. Editorial is shown by default.')})
      .finally(()=>{if(active)setThemeReady(true)});
    return()=>{active=false};
  },[member?.id,member?.verified]);
  async function changeTheme(next:ThemeId){
    const prior=theme;setTheme(next);setThemeError('');
    if(member?.verified){
      try{await apiWrite('/api/member/theme','PUT',{themeId:next})}
      catch(e){setTheme(prior);setThemeError(e instanceof Error?e.message:'Could not save your theme choice')}
    }
  }
  useEffect(()=>{const change=()=>setPath(locationPath());window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
  useEffect(()=>{let cancelled=false;Promise.all([fetch('/api/books').then(r=>{if(!r.ok)throw Error('books');return r.json();}),fetch('/api/reviews').then(r=>{if(!r.ok)throw Error('reviews');return r.json();})]).then(([books,reviews])=>{if(!cancelled){setApi({books:books.items??[],reviews:reviews.items??[]});setBackendStatus('ready');}}).catch(()=>{if(!cancelled)setBackendStatus('offline');});return()=>{cancelled=true;};},[]);
  const navigate=(to:string)=>{history.pushState({},'',to);setPath(locationPath());window.scrollTo(0,0);};
  useEffect(()=>{const click=(e:MouseEvent)=>{const anchor=(e.target as HTMLElement).closest('a');if(!anchor||anchor.target||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin)return;e.preventDefault();navigate(url.pathname+url.search);};document.addEventListener('click',click);return()=>document.removeEventListener('click',click);},[]);
  const query=useMemo(()=>new URLSearchParams(window.location.search),[path]);
  const args:ScreenProps={path,query,data:api,member,navigate};
  let body:ReactNode;
  if(path==='/')body=theme==='reading-room'?<RoomHome member={member} books={api.books??[]} reviews={api.reviews??[]}/>:<Home data={api} member={member}/>;
  else if(path==='/books')body=<FilteredBooks data={api}/>;
  else if(path==='/reviews')body=<Reviews data={api}/>;
  else if(path==='/search')body=<Search data={api}/>;
  else if(path.startsWith('/book/'))body=<PublicBookPage id={decodeURIComponent(path.slice(6))} verified={Boolean(member?.verified)} theme={theme}/>;
  else if(path.startsWith('/reader/'))body=<PublicReaderPage handle={decodeURIComponent(path.slice(8))}/>;
  else if(path.startsWith('/review/'))body=<PublicReviewPage id={decodeURIComponent(path.slice(8))} verified={Boolean(member?.verified)} theme={theme}/>;
  else if(['/discussions','/recommendations','/clubs','/challenges','/lists'].includes(path)||['/discussion/','/recommendation/','/club/','/challenge/','/list/'].some(p=>path.startsWith(p)))body=<CommunityWorkspace path={path} books={api.books??[]} member={member}/>;
  else if(['/authors','/narrators','/series'].includes(path)||path.startsWith('/person/')||path.startsWith('/series/'))body=<PeopleAndSeries path={path}/>;
  else if(second.includes(path)||path==='/community')body=<Discovery path={path} data={api}/>;
  else if(path==='/confirm-email'||path==='/api/auth/verify-email')body=<ConfirmEmailPage/>;
  else if(['/signin','/signup','/reset-password','/verify'].includes(path))body=<Login path={path}/>;
  else if(theme==='reading-room'&&path==='/shelf'&&member?.verified)body=<RoomShelf member={member}/>;
  else if(personal.includes(path)||['/add-book','/journal','/onboarding','/admin','/write-review'].includes(path))body=<MemberPage path={path} member={member} data={api}/>;
  else if(['/about','/privacy','/terms'].includes(path))body=<About path={path}/>;
  else body=<NotFound/>;
  return <ThemeShell theme={theme} onThemeChange={changeTheme} member={member} path={path} isHome={path==='/'} error={themeError||(!themeReady?'Loading your saved appearance…':backendStatus==='offline'?'Live catalogue and review services are not connected. Content stays empty until verified records are available.':undefined)}>{body}</ThemeShell>;
}
