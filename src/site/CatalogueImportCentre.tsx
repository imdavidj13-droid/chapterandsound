import {useState} from 'react';
import {apiGet,apiWrite} from './api';

type Suggestion={key:string;title:string;author:string;isbn13:string|null;publisher:string|null;
 publishedDate:string|null;pages:number|null;coverUrl:string|null;language:string|null;source:string};
type Detail=Suggestion&{synopsis:string|null;synopsisSource:'Open Library'|'Google Books'|null;
 complete:boolean;missing:string[];format:string;sourceUrl:string;
 coverKind:'work'|'edition'|null;coverWorkKey:string|null;coverId:number|null;researchOnly?:boolean;};
type SearchResponse={items:Suggestion[];sources:{google:string;openLibrary:string;isbnDb?:string}};
type SaveResponse={created:boolean;id:string;status:string;editionId?:string};
const languageLabel=(code:string|null)=>code==='en'?'English':code==='es'?'Spanish':code==='fr'?'French':code==='de'?'German':code==='it'?'Italian':code==='pt'?'Portuguese':code?code.toUpperCase():'Language unconfirmed';
const requiredLabels:Record<string,string>={isbn13:'ISBN',publisher:'publisher',
 publishedDate:'release date',pages:'page count',synopsis:'description',author:'author',title:'title',coverUrl:'cover image'};
function missingText(items:string[]){return items.map(x=>requiredLabels[x]||x).join(', ')}
export function CatalogueImportCentre(){
 const [query,setQuery]=useState('');
 const [items,setItems]=useState<Suggestion[]>([]);
 const [sourceStatus,setSourceStatus]=useState('');
 const [busy,setBusy]=useState(false),[importing,setImporting]=useState('');
 const [selected,setSelected]=useState<Detail|null>(null);
 const [originalSynopsis,setOriginalSynopsis]=useState('');
 const [reviewedFormat,setReviewedFormat]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [saved,setSaved]=useState<SaveResponse|null>(null);
 async function search(){
  if(query.trim().length<2||busy)return;
  setBusy(true);setError('');setNotice('');setSelected(null);setSaved(null);setItems([]);
  try{
   const found=await apiGet<SearchResponse>('/api/catalogue-admin/simple-import/search?q='+encodeURIComponent(query.trim()));
   setItems(found.items);
   setSourceStatus([found.sources.google==='unavailable'?'Google Books unavailable':'',
    found.sources.openLibrary==='unavailable'?'Open Library unavailable':'',
    found.sources.isbnDb==='unavailable'?'ISBNdb unavailable':found.sources.isbnDb==='rate_limited'?'ISBNdb rate-limited; other sources still available':''].filter(Boolean).join(' · '));
   if(found.items.length===0)setNotice('No matching titles were found. Try an exact ISBN or a more specific book title.');
  }catch(e){setError(e instanceof Error?e.message:'Book search failed')}
  finally{setBusy(false)}
 }
 async function save(detail:Detail,ownSynopsis='',formatChoice=''){
  setError('');setNotice('');setSaved(null);
  try{
   const response=await apiWrite<SaveResponse>('/api/catalogue-admin/simple-import/add','POST',{
    key:detail.key,isbn13:detail.isbn13,originalSynopsis:ownSynopsis,reviewedFormat:formatChoice,confirmed:true
   });
   setSaved(response);setSelected(null);
   setNotice(response.created?'Book imported as a private draft with one ISBN-identified edition.':'This book already exists. No duplicate was created.');
  }catch(e){setError(e instanceof Error?e.message:'Import failed; no save confirmed')}
 }
 async function selectAndImport(item:Suggestion){
  if(importing)return;
  setImporting(item.key);setError('');setNotice('');setSaved(null);setSelected(null);setOriginalSynopsis('');setReviewedFormat('');
  try{
   const detail=await apiGet<Detail>('/api/catalogue-admin/simple-import/detail?key='+encodeURIComponent(item.key));
   // Open Library search returns *works*, not ISBN-specific editions.
   // Always show the actual chosen edition's cover and ISBN before importing.
   const canImport=item.source!=='Open Library'&&item.source!=='ISBNdb'&&!detail.researchOnly&&detail.complete&&Boolean(detail.coverUrl)&&detail.synopsisSource==='Open Library'&&['paperback','hardback','ebook'].includes(detail.format);
   if(canImport)await save(detail);
   else setSelected(detail);
  }catch(e){setError(e instanceof Error?e.message:'Could not retrieve this book')}
  finally{setImporting('')}
 }
 const synopsisReady=selected&&(selected.synopsisSource==='Open Library'||originalSynopsis.trim().length>=30);
 const formatReady=Boolean(selected&&(['paperback','hardback','ebook'].includes(selected.format)||
  selected.format==='unknown'&&['paperback','hardback','ebook'].includes(reviewedFormat)));
 const missing=selected?.missing.filter(x=>x!=='synopsis'||!synopsisReady)||[];
 const canSave=Boolean(selected&&!selected.researchOnly&&selected.isbn13&&selected.coverUrl&&missing.length===0&&synopsisReady&&formatReady&&!importing);
 return <section className="cs-simple-import" aria-label="Search and import books">
  <div className="cs-simple-import-heading">
   <p className="cs-admin-eyebrow">CHAPTER &amp; SOUND · CATALOGUE</p>
   <h3>Find and add a book</h3>
   <p>Search by book title, author or ISBN. ISBNdb searches return multiple matching editions per request. English editions appear first when their language is known. ISBNdb-only results are research-only until rights checks are complete.</p>
  </div>
  <form className="cs-simple-import-search" onSubmit={e=>{e.preventDefault();void search()}}>
   <label htmlFor="cs-simple-query">Book title, author or ISBN</label>
   <div><input id="cs-simple-query" placeholder="e.g. Simon Kernick or 9780552156905" value={query}
    onChange={e=>setQuery(e.target.value)} autoComplete="off"/>
    <button type="submit" disabled={query.trim().length<2||busy}>{busy?'Searching…':'Search books'}</button></div>
  </form>
  {sourceStatus&&<p className="cs-simple-import-muted" role="status">{sourceStatus}. Results may be incomplete.</p>}
  {notice&&<p className="cs-admin-success" role="status">{notice}</p>}
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {saved&&<div className="cs-simple-import-success">
   <h4>{saved.created?'Book saved':'Already in your catalogue'}</h4>
   <p>{saved.created?'One work and one identified edition were saved as a private draft for review.':'We used the existing book instead of creating a duplicate.'}</p>
   <a href={'/admin/catalogue/book/'+encodeURIComponent(saved.id)}>Open book in catalogue</a>
  </div>}
  {items.length>0&&<div className="cs-simple-import-results">
   <h4>Search results <span>{items.length} found</span></h4>
   {items.map(item=><article className="cs-simple-import-result" key={item.key}>
    <div className="cs-simple-import-cover">{item.coverUrl?<img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none'}}/>:<span aria-hidden="true">No cover</span>}</div>
    <div className="cs-simple-import-description">
     <h5>{item.title}</h5><p>{item.author}</p>
     <small>{item.publisher||'Publisher to check'} · {item.publishedDate||'Date to check'} · {item.pages?item.pages+' pages':'Pages to check'}</small>
     <small>{item.isbn13?'Edition ISBN '+item.isbn13+' · ':'Book-level search result · '}{languageLabel(item.language)} · {item.source}</small>
     {!item.isbn13&&<small>The illustration represents the book, not necessarily the edition that will be chosen.</small>}
    </div>
    <button type="button" disabled={Boolean(importing)} onClick={()=>void selectAndImport(item)}>
     {importing===item.key?'Checking…':item.source==='ISBNdb'?'Review ISBNdb evidence':item.isbn13?'Import book':'Choose edition'}
    </button>
   </article>)}
  </div>}
  {selected&&<section className="cs-simple-import-review" aria-label="Missing details">
   <div className="cs-simple-import-review-heading"><div>
    <p className="cs-admin-eyebrow">BOOK DETAILS</p><h4>{selected.title}</h4><p>{selected.author}</p></div>
    <button type="button" onClick={()=>setSelected(null)}>Close</button>
   </div>
   {selected.researchOnly&&<p className="cs-simple-import-warning" role="status">ISBNdb matched this exact ISBN. Its metadata is for research only until the provider’s storage and image-use rights are reviewed. No catalogue record or cover will be saved from this result.</p>}
   <div className="cs-simple-import-chosen-cover">
    {selected.coverUrl?<img src={selected.coverUrl} alt={'Verified cover for '+selected.title} referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true}}/>:<span>No verified cover available</span>}
    <div><strong>{selected.coverKind==='work'?'Main book cover':'Selected edition cover'}</strong><p>{selected.coverKind==='work'?'This is a verified book-level cover matched to the title and author. Its edition will keep its own ISBN; no unrelated edition artwork will be assigned.':selected.coverKind==='edition'?'The cover image is available for edition ISBN '+selected.isbn13+'.':'The source did not return a usable cover. This book cannot be imported yet.'}</p></div>
   </div>
   <dl>
    <div><dt>ISBN</dt><dd>{selected.isbn13||'Missing'}</dd></div>
    <div><dt>Format</dt><dd>{selected.format==='unknown'?'Needs confirmation':selected.format}</dd></div>
    <div><dt>Cover</dt><dd>{selected.coverUrl?'Available':'Missing — import blocked'}</dd></div>
    <div><dt>Edition language</dt><dd>{languageLabel(selected.language)}</dd></div>
    <div><dt>Publisher</dt><dd>{selected.publisher||'Missing'}</dd></div>
    <div><dt>Release date</dt><dd>{selected.publishedDate||'Missing'}</dd></div>
    <div><dt>Page count</dt><dd>{selected.pages||'Missing'}</dd></div>
   </dl>
   {selected.format==='unknown'&&<label className="cs-simple-import-original">Confirm this ISBN edition's format
    <select value={reviewedFormat} onChange={e=>setReviewedFormat(e.target.value)} required>
     <option value="">Choose the correct format</option>
     <option value="paperback">Paperback</option><option value="hardback">Hardback</option><option value="ebook">Ebook</option>
    </select>
    <small>Only choose a format you have checked for this exact ISBN. The importer will not save an unknown format.</small>
   </label>}
   {selected.synopsis&&<div className="cs-simple-import-synopsis"><strong>Source description ({selected.synopsisSource})</strong><p>{selected.synopsis}</p></div>}
   {selected.synopsisSource!=='Open Library'&&<label className="cs-simple-import-original">Original or authorised synopsis
    <textarea rows={5} value={originalSynopsis} onChange={e=>setOriginalSynopsis(e.target.value)}
     placeholder="Write your own synopsis or enter text you have permission to publish."/>
    <small>Google Books descriptions are shown as a reference, not copied into the permanent catalogue automatically.</small>
   </label>}
   {(missing.length>0||!synopsisReady||!formatReady)&&<p className="cs-simple-import-warning" role="alert">Cannot import yet: {missing.length?missingText(missing):!synopsisReady?'description':'edition format'}. {selected.coverUrl?'Choose verified details for this ISBN.':'The search illustration alone does not prove that a usable cover is available. Try another edition or book result.'} Nothing has been saved.</p>}
   <div className="cs-simple-import-review-actions">
    <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>
    <button type="button" disabled={!canSave||Boolean(importing)} onClick={()=>void save(selected,originalSynopsis,reviewedFormat)}>Import this book</button>
   </div>
  </section>}
 </section>;
}
