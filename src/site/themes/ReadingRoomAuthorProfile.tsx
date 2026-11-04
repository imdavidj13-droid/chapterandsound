import {useEffect,useMemo,useState} from 'react';
import {apiGet} from '../api';

type Author={id:string;name:string;biography?:string|null;portraitUrl?:string|null};
type Book={id:string;title:string;coverUrl?:string|null;summary?:string|null;formats?:string[];firstPublishedYear?:number|null};
type Recording={id:string;workId:string;title:string};
type ShelfRecord={workId:string;privateNote?:string|null;status?:string};
type SimilarAuthor={id:string;name:string;portraitUrl?:string|null;sharedSubjects:number};
type Profile={person:Author;works:Book[];recordings:Recording[];similarAuthors?:SimilarAuthor[]};
type ReviewHighlight={count:number;average:number|null;body:string|null;title:string|null};
type BookDetailResponse={reviews:{title?:string|null;body?:string|null;spoilers?:number|boolean;storyRating?:number|null}[];ratings:{story:{count:number;average:number|null}}};
type Tab='books'|'shelf'|'about'|'audio'|'similar';

const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('');
const formatLabel=(format:string)=>({
 paperback:'Paperback',hardback:'Hardback',ebook:'Ebook',audiobook:'Audiobook'
} as Record<string,string>)[format]||format.replaceAll('_',' ');

function BookCard({book,onShelf,review}:{book:Book;onShelf:boolean;review?:ReviewHighlight}){
 const [failed,setFailed]=useState(false);
 const snippet=(text:string,max:number)=>text.length>max?text.slice(0,max).trimEnd()+'…':text;
 const formats=book.formats||[];
 return <article className="room-author-book-card">
  <a href={'/book/'+encodeURIComponent(book.id)} className="room-author-book-art" aria-label={'View '+book.title}>
   {book.coverUrl&&!failed?<img src={book.coverUrl} alt={'Cover of '+book.title} loading="lazy" onError={()=>setFailed(true)}/>:<span className="room-author-book-fallback" aria-label="Cover unavailable">{book.title}</span>}
   {onShelf&&<span className="room-author-on-shelf">On my shelf</span>}
  </a>
  <div className="room-author-book-info">
   <h3><a href={'/book/'+encodeURIComponent(book.id)}>{book.title}</a></h3>
   {book.firstPublishedYear&&<p className="room-author-book-year">{book.firstPublishedYear}</p>}
   <div className="room-author-review-line">
    {review?.count?<>
     <span className="room-author-stars" aria-label={'Average story rating '+review.average?.toFixed(1)+' out of 5'}>{'★'.repeat(Math.round(review.average||0))}{'☆'.repeat(5-Math.round(review.average||0))}</span>
     <span>{review.average?.toFixed(1)}/5 · {review.count} {review.count===1?'rating':'ratings'}</span>
    </>:<span>No community reviews yet</span>}
   </div>
   <p className="room-author-book-summary">{book.summary?snippet(book.summary,125):'Description not yet available.'}</p>
   {review?.body&&<p className="room-author-review-excerpt"><strong>Reader review</strong> {snippet(review.body,95)}</p>}
   <p className="room-author-book-formats">{formats.length?formats.map(formatLabel).join('  ·  '):'Edition formats not confirmed'}</p>
   <a className="room-author-book-cta" href={'/book/'+encodeURIComponent(book.id)}>{review?.count?'Read reviews':'View book'} <span aria-hidden="true">→</span></a>
  </div>
 </article>;
}

export function ReadingRoomAuthorProfile({id,memberVerified}:{id:string;memberVerified:boolean}){
 const [profile,setProfile]=useState<Profile|null>(null);
 const [shelf,setShelf]=useState<Set<string>>(new Set());
 const [shelfNotes,setShelfNotes]=useState<ShelfRecord[]>([]);
 const [reviews,setReviews]=useState<Record<string,ReviewHighlight>>({});
 const [tab,setTab]=useState<Tab>('books');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setProfile(null);setTab('books');setReviews({});
  apiGet<Profile>('/api/person/'+encodeURIComponent(id))
   .then(data=>{if(active)setProfile(data)})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Author profile unavailable')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[id]);
 useEffect(()=>{
  if(!memberVerified){setShelf(new Set());setShelfNotes([]);return}
  let active=true;
  apiGet<{items:ShelfRecord[]}>('/api/member/shelf')
   .then(data=>{if(active){setShelf(new Set(data.items.map(item=>item.workId)));setShelfNotes(data.items)}})
   .catch(()=>{if(active){setShelf(new Set());setShelfNotes([])}});
  return()=>{active=false};
 },[memberVerified,id]);
 // Public reviews and rating totals come from the existing book detail API.
 // Do not invent review excerpts or scores for titles with no published reviews.
 useEffect(()=>{
  if(!profile?.works.length)return;
  let active=true;
  void Promise.all(profile.works.slice(0,40).map(async book=>{
   try{
    const data=await apiGet<BookDetailResponse>('/api/book/'+encodeURIComponent(book.id));
    const published=data.reviews||[];
    const first=published.find(review=>!review.spoilers&&Boolean(review.body?.trim()));
    return [book.id,{count:data.ratings.story.count,average:data.ratings.story.average,
     body:first?.body||null,title:first?.title||null}] as const;
   }catch{return [book.id,{count:0,average:null,body:null,title:null}] as const}
  })).then(entries=>{if(active)setReviews(Object.fromEntries(entries))});
  return()=>{active=false};
 },[profile]);
 const books=profile?.works||[];
 const onShelf=useMemo(()=>books.filter(book=>shelf.has(book.id)),[books,shelf]);
 if(loading)return <div className="room-author-profile-loading" role="status">Loading author profile…</div>;
 if(!profile)return <div className="room-author-profile-error"><h1>Author not available</h1><p role="alert">{error||'This author could not be found.'}</p><a href="/authors">Back to authors</a></div>;
 const {person,recordings}=profile;
 const hasBio=Boolean(person.biography?.trim());
 const audioBooks=books.filter(book=>recordings.some(recording=>recording.workId===book.id));
 const visible=tab==='shelf'?onShelf:tab==='audio'?audioBooks:books;
 return <div className="room-author-profile">
  <div className="room-author-breadcrumb"><a href="/authors">Authors</a><span aria-hidden="true">/</span><span>{person.name}</span></div>
  <section className="room-author-banner">
   <div className="room-author-avatar">
    <span aria-hidden="true">{initials(person.name)}</span>
    {person.portraitUrl&&<img src={person.portraitUrl} alt={'Portrait of '+person.name} onError={e=>{e.currentTarget.hidden=true}}/>}
   </div>
   <div className="room-author-banner-content">
    <p className="room-author-kicker">AUTHOR PROFILE</p>
    <h1>{person.name}</h1>
    {hasBio?<p className="room-author-intro">{person.biography}</p>:<p className="room-author-intro">Discover the books and editions by {person.name}.</p>}
    <div className="room-author-metrics"><span>{books.length} {books.length===1?'published book':'published books'}</span>{audioBooks.length>0&&<span>{audioBooks.length} {audioBooks.length===1?'book with audio':'books with audio'}</span>}</div>
   </div>
  </section>
  <div className="room-author-main-layout">
   <main className="room-author-main">
    <nav className="room-author-tabs" aria-label="Author profile sections">
     <button type="button" onClick={()=>setTab('books')} className={tab==='books'?'active':''} aria-current={tab==='books'?'page':undefined}>Books <span>{books.length}</span></button>
     {memberVerified&&<button type="button" onClick={()=>setTab('shelf')} className={tab==='shelf'?'active':''} aria-current={tab==='shelf'?'page':undefined}>On my shelf <span>{onShelf.length}</span></button>}
     <button type="button" onClick={()=>setTab('about')} className={tab==='about'?'active':''} aria-current={tab==='about'?'page':undefined}>About</button>
     {recordings.length>0&&<button type="button" onClick={()=>setTab('audio')} className={tab==='audio'?'active':''} aria-current={tab==='audio'?'page':undefined}>Audiobooks</button>}
    </nav>
    {tab==='about'?<section className="room-author-about-panel"><h2>About {person.name}</h2><p>{hasBio?person.biography:'A biography has not been added to this author profile yet.'}</p></section>:<>
     <div className="room-author-section-title">
      <div><p className="room-author-kicker">{tab==='shelf'?'YOUR COLLECTION':tab==='audio'?'LISTEN TO THEIR STORIES':'EXPLORE THE BOOKS'}</p>
      <h2>{tab==='shelf'?'Books on my shelf':tab==='audio'?'Available audiobooks':'Books by '+person.name}</h2></div>
      <span>{visible.length} {visible.length===1?'title':'titles'}</span>
     </div>
     {visible.length?<div className="room-author-books">{visible.map(book=><BookCard key={book.id} book={book} onShelf={shelf.has(book.id)}/>)}</div>:
      <div className="room-author-empty"><h3>{tab==='shelf'?'No books on your shelf yet':tab==='audio'?'No audiobook editions listed':'No published books yet'}</h3>
       <p>{tab==='shelf'?'Visit a book to add it to your shelf.':'New catalogue entries will appear here once published.'}</p></div>}
    </>}
   </main>
   <aside className="room-author-aside">
    <section className="room-author-side-card">
     <p className="room-author-kicker">AUTHOR AT A GLANCE</p>
     <h3>{person.name}</h3>
     <p>{hasBio?person.biography:'Browse the verified catalogue of published titles by this author.'}</p>
     <div className="room-author-side-stat"><strong>{books.length}</strong><span>Published {books.length===1?'title':'titles'}</span></div>
    </section>
    {audioBooks.length>0&&<section className="room-author-side-card">
      <p className="room-author-kicker">AUDIOBOOKS</p><h3>Listen to the stories</h3>
      <p>{audioBooks.length} {audioBooks.length===1?'title has':'titles have'} a linked audio recording.</p>
      <button className="room-author-side-link" type="button" onClick={()=>setTab('audio')}>View audiobooks →</button>
    </section>}
   </aside>
  </div>
 </div>;
}
