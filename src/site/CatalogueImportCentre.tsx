import {useState} from 'react';
import {apiGet,apiWrite} from './api';
import {groupCoverCandidates,groupSearchResults,type SearchGroup} from './catalogue-search-grouping';

type Suggestion={key:string;title:string;author:string;isbn13:string|null;publisher:string|null;
 publishedDate:string|null;pages:number|null;coverUrl:string|null;previewCoverUrl?:string|null;language:string|null;source:string};
type Detail=Suggestion&{synopsis:string|null;synopsisSource:'Open Library'|'Google Books'|null;
 complete:boolean;missing:string[];format:string;sourceUrl:string;
 coverKind:'work'|'edition'|null;coverWorkKey:string|null;coverId:number|null;researchOnly?:boolean;};
type SearchResponse={items:Suggestion[];sources:{google:string;openLibrary:string;isbnDb?:string};diagnostics?:{googleCandidates:number;openLibraryCandidates:number;isbnDbCandidates:number;isbnDbNewEditions:number;isbnDbReason?:string|null}};
type SaveResponse={created:boolean;id:string;status:string;editionId?:string};
const languageLabel=(code:string|null)=>code==='en'?'English':code==='es'?'Spanish':code==='fr'?'French':code==='de'?'German':code==='it'?'Italian':code==='pt'?'Portuguese':code?code.toUpperCase():'Language unconfirmed';
const requiredLabels:Record<string,string>={isbn13:'ISBN',publisher:'publisher',
 publishedDate:'release date',pages:'page count',synopsis:'description',author:'author',title:'title',coverUrl:'cover image'};
function missingText(items:string[]){return items.map(x=>requiredLabels[x]||x).join(', ')}
function SearchCover({group}:{group:SearchGroup}){
 const options=groupCoverCandidates(group);
 const [current,setCurrent]=useState(0);
 const choice=options[current];
 return <div className="cs-simple-import-cover" title={choice?choice.label+' (preview only)':'No image supplied by the available sources'}>
  {choice?<img src={choice.url} alt="" loading="lazy" referrerPolicy="no-referrer"
   onError={()=>setCurrent(index=>index+1)}/>:<span aria-hidden="true">No cover</span>}
 </div>;
}
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
   setSourceStatus([
    'ISBNdb: '+(found.sources.isbnDb||'not reported')+
      (found.diagnostics?' · '+found.diagnostics.isbnDbCandidates+' candidates, '+found.diagnostics.isbnDbNewEditions+' additional editions':'')+
      (found.diagnostics?.isbnDbReason?' ('+found.diagnostics.isbnDbReason+')':''),
    'Google Books: '+found.sources.google+(found.diagnostics?' · '+found.diagnostics.googleCandidates+' candidates':''),
    'Open Library: '+found.sources.openLibrary+(found.diagnostics?' · '+found.diagnostics.openLibraryCandidates+' candidates':'')
   ].join(' | '));
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
   setNotice(response.created?'Book saved as a private draft with one ISBN-identified edition. Cover review may still be required.':'This book already exists. No duplicate was created.');
  }catch(e){setError(e instanceof Error?e.message:'Import failed; no save confirmed')}
 }
 async function selectAndImport(item:Suggestion){
  if(importing)return;
  setImporting(item.key);setError('');setNotice('');setSaved(null);setSelected(null);setOriginalSynopsis('');setReviewedFormat('');
  try{
   const detail=await apiGet<Detail>('/api/catalogue-admin/simple-import/detail?key='+encodeURIComponent(item.key));
   // Open Library search returns *works*, not ISBN-specific editions.
   // Always show the actual chosen edition's cover and ISBN before importing.
   // Reviewing a search result never writes to BOOK_DB. Save requires explicit confirmation.
   setSelected(detail);
  }catch(e){setError(e instanceof Error?e.message:'Could not retrieve this book')}
  finally{setImporting('')}
 }
 const synopsisReady=selected&&(selected.synopsisSource==='Open Library'||originalSynopsis.trim().length>=30);
 const formatReady=Boolean(selected&&(['paperback','hardback','ebook'].includes(selected.format)||
  selected.format==='unknown'&&['paperback','hardback','ebook'].includes(reviewedFormat)));
 const missing=selected?.missing.filter(x=>x!=='coverUrl'&&(x!=='synopsis'||!synopsisReady))||[];
 const canSave=Boolean(selected&&!selected.researchOnly&&selected.isbn13&&missing.length===0&&synopsisReady&&formatReady&&!importing);
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
   <h4>Search results <span>{groupSearchResults(items).length} possible books · {items.length} source records</span></h4>
   <p className="cs-simple-import-muted">Book groups are provisional. Cover images are previews only and may represent another edition; the exact ISBN cover is checked separately before import.</p>
   <div className="cs-simple-import-grid">
   {groupSearchResults(items).map(group=>{
    return <article className="cs-simple-import-result" key={group.id}>
     <SearchCover key={group.id} group={group}/>
     <div className="cs-simple-import-description" style={{flex:1,minWidth:0}}>
      <h5>{group.title}</h5><p>{group.author}</p>
      <small>{group.items.filter(x=>x.isbn13).length} ISBN {group.items.filter(x=>x.isbn13).length===1?'edition':'editions'} · {[...new Set(group.items.map(x=>x.source))].join(' · ')}</small>
      <details style={{marginTop:10}}>
       <summary style={{cursor:'pointer',fontWeight:600,color:'#21563e',padding:'4px 0'}}>{group.items.length===1?'View source details':'View '+group.items.length+' source records'}</summary>
       <div style={{display:'grid',gap:8,marginTop:8}}>
        {group.items.map(item=><div key={item.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',padding:'10px 0',borderTop:'1px solid #dce5db'}}>
         <div>
          <strong style={{fontSize:13}}>{item.isbn13?'ISBN '+item.isbn13:'Work-level record (ISBN unconfirmed)'}</strong>
          <small style={{display:'block'}}>{item.publisher||'Publisher unconfirmed'} · {item.publishedDate||'Date unconfirmed'} · {item.pages?item.pages+' pages':'Pages unconfirmed'}</small>
          <small style={{display:'block'}}>{languageLabel(item.language)} · {item.source}</small>
         </div>
         <button type="button" style={{background:'#1c5138',color:'#fff',border:'1px solid #1c5138',borderRadius:8,padding:'10px 16px',fontWeight:600,cursor:'pointer'}} disabled={Boolean(importing)} onClick={()=>void selectAndImport(item)}>
          {importing===item.key?'Checking…':item.source==='ISBNdb'?'Review ISBNdb evidence':item.isbn13?'Review edition':'Choose edition'}
         </button>
        </div>)}
       </div>
      </details>
     </div>
    </article>;
   })}
   </div>
  </div>}
  {selected&&<section className="cs-simple-import-review" aria-label="Missing details">
   <div className="cs-simple-import-review-heading"><div>
    <p className="cs-admin-eyebrow">BOOK DETAILS</p><h4>{selected.title}</h4><p>{selected.author}</p></div>
    <button type="button" onClick={()=>setSelected(null)}>Close</button>
   </div>
   {selected.researchOnly&&<p className="cs-simple-import-warning" role="status">ISBNdb matched this exact ISBN. Its metadata is for research only until the provider’s storage and image-use rights are reviewed. No catalogue record or cover will be saved from this result.</p>}
   <div className="cs-simple-import-chosen-cover">
    {selected.coverUrl||selected.previewCoverUrl?
     <img src={selected.coverUrl||selected.previewCoverUrl||''}
      alt={'Cover artwork shown for '+selected.title} referrerPolicy="no-referrer"
      onError={e=>{e.currentTarget.style.display='none'}}/>:
     <span>No cover image supplied</span>}
    <div>
     <strong>{selected.coverKind==='work'?'Verified work-level cover':selected.coverKind==='edition'?'Verified edition cover':selected.previewCoverUrl?'Google Books cover preview':'Cover not available'}</strong>
     <p>{selected.coverKind==='work'?'This artwork is associated with the confirmed Open Library work, not necessarily this particular ISBN.':
      selected.coverKind==='edition'?'Open Library supplied an image for this exact ISBN.':
      selected.previewCoverUrl?'Google Books provides the image shown above. It is a preview, not yet verified as artwork for the exact ISBN.':
      'No cover image was supplied by this detail lookup.'}</p>
     {!selected.coverUrl&&selected.previewCoverUrl&&<p>Cover verification is required before publication. You can save the book as a private draft without saving this preview as the official cover.</p>}
    </div>
   </div>
   <dl>
    <div><dt>ISBN</dt><dd>{selected.isbn13||'Missing'}</dd></div>
    <div><dt>Format</dt><dd>{selected.format==='unknown'?'Needs confirmation':selected.format}</dd></div>
    <div><dt>Cover</dt><dd>{selected.coverUrl?'Verified source cover':selected.previewCoverUrl?'Preview available · verify before publishing':'No cover · add before publishing'}</dd></div>
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
   {(missing.length>0||!synopsisReady||!formatReady)&&<p className="cs-simple-import-warning" role="alert">Cannot save draft yet: {missing.length?missingText(missing):!synopsisReady?'description':'edition format'}. Complete the required details first. Nothing has been saved.</p>}
   <div className="cs-simple-import-review-actions">
    <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>
    <button type="button" disabled={!canSave||Boolean(importing)} onClick={()=>void save(selected,originalSynopsis,reviewedFormat)}>Save private draft</button>
   </div>
  </section>}
 </section>;
}
