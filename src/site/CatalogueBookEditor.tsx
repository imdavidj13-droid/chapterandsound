import {useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';
import './CatalogueBookEditor.css';

type Person={id:string;name:string};
type Saved={id:string;editionId:string|null;recordingId:string|null;saved:boolean};
type ExistingWork={id:string;title:string;authors?:string|null;status?:string};
type Props={authors:Person[];imageStorage:boolean;onSaved:(id:string,notice:string)=>void;onCancel:()=>void;onEditExisting?:(id:string)=>void};
function validIsbn13(raw:string){if(!raw)return true;const digits=raw.replace(/[ -]/g,'');if(!/^\d{13}$/.test(digits))return false;return [...digits].reduce((total,d,index)=>total+Number(d)*(index%2?3:1),0)%10===0}
function validIsbn10(raw:string){if(!raw)return true;const digits=raw.replace(/[ -]/g,'').toUpperCase();if(!/^\d{9}[\dX]$/.test(digits))return false;return [...digits].reduce((total,d,index)=>total+(10-index)*(d==='X'?10:Number(d)),0)%11===0}
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

const workTypes=['book','short_story','collection','graphic_novel','comic','poetry','play','reference','other'];
const formats=['paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown'];
const name=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function CatalogueBookEditor({authors,imageStorage,onSaved,onCancel,onEditExisting}:Props){
 const [title,setTitle]=useState(''),[author,setAuthor]=useState(''),[type,setType]=useState('book');
 const [language,setLanguage]=useState('en'),[firstPublished,setFirstPublished]=useState(''),[synopsis,setSynopsis]=useState('');
 const [addEdition,setAddEdition]=useState(true),[format,setFormat]=useState('paperback'),[editionLanguage,setEditionLanguage]=useState('en');
 const [pages,setPages]=useState(''),[publisher,setPublisher]=useState(''),[releaseDate,setReleaseDate]=useState('');
 const [isbn13,setIsbn13]=useState(''),[isbn10,setIsbn10]=useState(''),[asin,setAsin]=useState('');
 const [performance,setPerformance]=useState('single_narrator'),[abridgement,setAbridgement]=useState('unabridged');
 const [duration,setDuration]=useState(''),[narrator,setNarrator]=useState('');
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState('');
 const [rightsHolder,setRightsHolder]=useState(''),[licenceName,setLicenceName]=useState(''),[sourceUrl,setSourceUrl]=useState('');
 const [permission,setPermission]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const isAudio=format==='audiobook'||format==='audio_cd';
 const [suggestions,setSuggestions]=useState<Person[]>([]);
 const [selectedAuthorId,setSelectedAuthorId]=useState('');
 const [createAuthor,setCreateAuthor]=useState(false);
 const [narratorSuggestions,setNarratorSuggestions]=useState<Person[]>([]);
 const [selectedNarratorId,setSelectedNarratorId]=useState('');
 const [createNarrator,setCreateNarrator]=useState(false);
 const [existingWorks,setExistingWorks]=useState<ExistingWork[]>([]);
 const [duplicateCheckError,setDuplicateCheckError]=useState('');
 const [duplicateCheckComplete,setDuplicateCheckComplete]=useState(false);
 const [allowSameTitle,setAllowSameTitle]=useState(false);
 useEffect(()=>{
  let active=true;
  apiGet<{items:ExistingWork[]}>('/api/catalogue-admin/works?limit=100').then(r=>{
   if(active){setExistingWorks(r.items||[]);setDuplicateCheckComplete(true)}
  }).catch(()=>{
   if(active){setDuplicateCheckError('Could not check existing titles. Reopen the editor after the catalogue is available.');setDuplicateCheckComplete(true)}
  });
  return()=>{active=false};
 },[]);
 const possibleDuplicates=useMemo(()=>title.trim().length>=3?existingWorks.filter(w=>normalize(w.title)===normalize(title)).slice(0,10):[],[existingWorks,title]);
 const isbn13Valid=validIsbn13(isbn13);
 const isbn10Valid=validIsbn10(isbn10);
 const duplicateBlocked=possibleDuplicates.length>0&&!allowSameTitle;
 useEffect(()=>{setAllowSameTitle(false)},[title]);
 useEffect(()=>{
  let cancelled=false;
  if(author.trim().length<2){setSuggestions(authors.slice(0,10));return}
  const id=window.setTimeout(()=>{
   apiGet<{items:Person[]}>('/api/catalogue-admin/author-suggestions?q='+encodeURIComponent(author)+'&limit=20')
    .then(res=>{if(!cancelled)setSuggestions(res.items)})
    .catch(()=>{if(!cancelled)setSuggestions(authors.filter(p=>p.name.toLowerCase().includes(author.toLowerCase())))});
  },220);
  return()=>{cancelled=true;window.clearTimeout(id)};
 },[author,authors]);
 useEffect(()=>{
  let active=true;
  if(!isAudio||narrator.trim().length<2){setNarratorSuggestions([]);return}
  const timer=window.setTimeout(()=>{
   apiGet<{items:Person[]}>('/api/catalogue-admin/author-suggestions?q='+encodeURIComponent(narrator)+'&limit=20')
    .then(res=>{if(active)setNarratorSuggestions(res.items)})
    .catch(()=>{if(active)setNarratorSuggestions(authors.filter(p=>p.name.toLowerCase().includes(narrator.toLowerCase())))});
  },220);
  return()=>{active=false;window.clearTimeout(timer)};
 },[narrator,isAudio,authors]);
 const authorReady=!!selectedAuthorId||!!(createAuthor&&author.trim().length>=2);
 const narratorReady=!isAudio||!narrator.trim()||!!selectedNarratorId||!!createNarrator;
 useEffect(()=>{
  if(!file){setPreview('');return}
  const next=URL.createObjectURL(file);setPreview(next);
  return()=>URL.revokeObjectURL(next);
 },[file]);
 const canUpload=!!file&&imageStorage&&!!rightsHolder.trim()&&!!licenceName.trim()&&!!sourceUrl.trim()&&permission;
 const totalFields=useMemo(()=>[title,author,synopsis,format,releaseDate,isbn13].filter(Boolean).length,[title,author,synopsis,format,releaseDate,isbn13]);
 async function submit(e:FormEvent){
  e.preventDefault();
  if(!duplicateCheckComplete||duplicateCheckError){setError('Existing-book check is unavailable; the new book has not been saved.');return}
  if(duplicateBlocked){setError('A book with this title already exists. Review the matching records before creating another.');return}
  if(!isbn13Valid||!isbn10Valid){setError('Check the ISBN digits and checksum before saving.');return}
  if(!authorReady){setError('Choose an existing author or confirm creation of a new contributor.');return}
  if(!narratorReady){setError('Choose the existing narrator or confirm creation of a new contributor.');return}
  setSaving(true);setError('');
  try{
   if(file&&imageStorage&&!canUpload)throw new Error('Complete the image rights fields or remove the cover file before saving.');
   const edition=addEdition?{
    format,language:editionLanguage,pageCount:pages||null,publisherName:publisher,
    releaseDate,isbn13,isbn10,asin,
    ...(isAudio?{audio:{performance,abridgement,durationMinutes:duration||null,narratorName:narrator,narratorId:selectedNarratorId||undefined}}:{})
   }:null;
   const result=await apiWrite<Saved>('/api/catalogue-admin/works','POST',{
    title,authorName:author,authorId:selectedAuthorId||undefined,type,language,firstPublicationDate:firstPublished,synopsis,
    ...(edition?{edition}:{})
   });
   let message='Book saved with '+(addEdition?'its first edition':'its details')+' and linked author.';
   if(file&&canUpload){
    const data=new FormData();
    data.set('entityKind',result.editionId?'edition':'work');data.set('entityId',result.editionId||result.id);
    data.set('rightsHolder',rightsHolder);data.set('licenceName',licenceName);data.set('sourceUrl',sourceUrl);
    data.set('rightsConfirmed','yes');data.set('file',file);
    try{
     const upload=await fetch('/api/catalogue-admin/upload-image',{method:'POST',body:data,credentials:'include'});
     const response=await upload.json() as {error?:string};
     if(!upload.ok)throw new Error(response.error||'Image upload failed');
     message+=' Cover uploaded.';
    }catch(e){
     message+=' Cover upload failed: '+(e instanceof Error?e.message:'unknown error')+'. The book itself was saved.';
    }
   }else if(file&&!imageStorage)message+=' Cover preview was not uploaded because image storage is not configured.';
   onSaved(result.id,message);
  }catch(e){setError(e instanceof Error?e.message:'Could not save the book')}
  finally{setSaving(false)}
 }
 return <form className="cs-book-editor" onSubmit={submit}>
  <div className="cs-book-editor-heading">
   <div><span className="cs-book-eyebrow">CHAPTER & SOUND / CATALOGUE</span><h2>Create a new book</h2>
   <p>Book details and the first edition in one place. Contributors are selected from the same catalogue.</p></div>
   <button type="button" onClick={onCancel}>Close</button>
  </div>
  <div className="cs-book-editor-grid">
   <div className="cs-book-editor-fields">
    <section className="cs-book-editor-section">
     <header><span className="cs-book-section-number">01</span><div><h3>Book details</h3><p>The shared information for every edition</p></div></header>
     <label>Book title <span>*</span><input required maxLength={500} autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Enter the book title"/></label>
     {possibleDuplicates.length>0&&<div className="cs-book-duplicate-warning" role="alert"><strong>Possible existing book</strong><p>Matches among the first 100 catalogue records. Review before adding: different editions should belong to the same book.</p>{possibleDuplicates.map(w=><div className="cs-book-duplicate-result" key={w.id}><span><strong>{w.title}</strong>{w.authors?' · '+w.authors:''}</span>{onEditExisting&&<button type="button" onClick={()=>onEditExisting(w.id)}>Open existing book</button>}</div>)}<label className="cs-book-editor-toggle"><input type="checkbox" checked={allowSameTitle} onChange={e=>setAllowSameTitle(e.target.checked)}/> I checked these records and this is genuinely a different book with the same title</label></div>}
     {duplicateCheckError&&<p className="cs-admin-error" role="alert">{duplicateCheckError}</p>}
     <div className="cs-book-person-picker"><label htmlFor="cas-author-search">Author <span>*</span></label>
      <input id="cas-author-search" autoComplete="off" maxLength={500} value={author} onChange={e=>{setAuthor(e.target.value);setSelectedAuthorId('');setCreateAuthor(false)}} placeholder="Search existing catalogue authors" />
      {selectedAuthorId?<div className="cs-book-selected">✓ Linked author: <strong>{author}</strong><button type="button" onClick={()=>{setSelectedAuthorId('');setAuthor('')}}>Change</button></div>:<>
       {suggestions.length>0&&<div className="cs-book-person-results" aria-label="Matching authors">{suggestions.map(p=><button type="button" key={p.id} onClick={()=>{setAuthor(p.name);setSelectedAuthorId(p.id);setCreateAuthor(false)}}><span>{p.name}</span><small>ID {p.id.slice(0,8)}</small></button>)}</div>}
       {author.trim().length>=2&&<label className="cs-book-editor-toggle"><input type="checkbox" checked={createAuthor} onChange={e=>setCreateAuthor(e.target.checked)}/> Create a new author named “{author.trim()}” if no matching identity exists</label>}
      </>}
      <small>Choose the correct author, not just a matching name. All contributors belong to one catalogue.</small>
     </div>
     <div className="cs-book-editor-two">
      <label>Book type<select value={type} onChange={e=>setType(e.target.value)}>{workTypes.map(x=><option key={x} value={x}>{name(x)}</option>)}</select></label>
      <label>Original language<input maxLength={40} value={language} onChange={e=>setLanguage(e.target.value)} placeholder="en"/></label>
     </div>
     <label>First published<input maxLength={10} placeholder="YYYY or YYYY-MM-DD" value={firstPublished} onChange={e=>setFirstPublished(e.target.value)}/></label>
     <label>Description<textarea rows={5} maxLength={12000} value={synopsis} onChange={e=>setSynopsis(e.target.value)} placeholder="Book synopsis or editorial description"/></label>
    </section>
    <section className="cs-book-editor-section">
     <header><span className="cs-book-section-number">02</span><div><h3>First edition</h3><p>Format, ISBNs, publisher and release date</p></div></header>
     <label className="cs-book-editor-toggle"><input type="checkbox" checked={addEdition} onChange={e=>setAddEdition(e.target.checked)}/> Include the first edition when saving this book</label>
     {addEdition&&<>
      <div className="cs-book-editor-two">
       <label>Edition format<select value={format} onChange={e=>setFormat(e.target.value)}>{formats.map(x=><option key={x} value={x}>{name(x)}</option>)}</select></label>
       <label>Edition language<input maxLength={40} value={editionLanguage} onChange={e=>setEditionLanguage(e.target.value)} placeholder="en"/></label>
      </div>
      <div className="cs-book-editor-two">
       <label>ISBN-13<input maxLength={17} inputMode="numeric" aria-invalid={!isbn13Valid} value={isbn13} onChange={e=>setIsbn13(e.target.value)} placeholder="978…"/>{!isbn13Valid&&<small role="alert" className="cs-book-invalid">Enter a valid 13-digit ISBN, including its check digit.</small>}</label>
       <label>ISBN-10<input maxLength={13} aria-invalid={!isbn10Valid} value={isbn10} onChange={e=>setIsbn10(e.target.value)} placeholder="Optional"/>{!isbn10Valid&&<small role="alert" className="cs-book-invalid">Enter a valid 10-character ISBN, including its check digit.</small>}</label>
      </div>
      <div className="cs-book-editor-two">
       <label>ASIN<input maxLength={20} value={asin} onChange={e=>setAsin(e.target.value)} placeholder="Amazon identifier (if known)"/></label>
       <label>{isAudio?'Page count (if applicable)':'Page count'}<input type="number" min="1" max="100000" value={pages} onChange={e=>setPages(e.target.value)} placeholder="Optional"/></label>
      </div>
      <div className="cs-book-editor-two">
       <label>Publisher<input maxLength={500} value={publisher} onChange={e=>setPublisher(e.target.value)} placeholder="Publisher name"/></label>
       <label>Edition release date<input maxLength={10} value={releaseDate} onChange={e=>setReleaseDate(e.target.value)} placeholder="YYYY-MM-DD"/></label>
      </div>
     </>}
    </section>
    {addEdition&&isAudio&&<section className="cs-book-editor-section">
     <header><span className="cs-book-section-number">03</span><div><h3>Audiobook details</h3><p>Displayed only for audio editions</p></div></header>
     <div className="cs-book-person-picker"><label htmlFor="cas-narrator-search">Narrator</label>
      <input id="cas-narrator-search" maxLength={500} autoComplete="off" value={narrator} onChange={e=>{setNarrator(e.target.value);setSelectedNarratorId('');setCreateNarrator(false)}} placeholder="Search existing catalogue narrators"/>
      {selectedNarratorId?<div className="cs-book-selected">✓ Linked narrator: <strong>{narrator}</strong><button type="button" onClick={()=>{setSelectedNarratorId('');setNarrator('')}}>Change</button></div>:<>
       {narratorSuggestions.length>0&&<div className="cs-book-person-results" aria-label="Matching narrators">{narratorSuggestions.map(p=><button key={p.id} type="button" onClick={()=>{setNarrator(p.name);setSelectedNarratorId(p.id);setCreateNarrator(false)}}><span>{p.name}</span><small>ID {p.id.slice(0,8)}</small></button>)}</div>}
       {narrator.trim().length>=2&&<label className="cs-book-editor-toggle"><input type="checkbox" checked={createNarrator} onChange={e=>setCreateNarrator(e.target.checked)}/> Confirm creation if this is a new narrator</label>}
      </>}
     </div>
     <div className="cs-book-editor-two">
      <label>Performance<select value={performance} onChange={e=>setPerformance(e.target.value)}>{['single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice','unknown'].map(x=><option key={x} value={x}>{name(x)}</option>)}</select></label>
      <label>Abridgement<select value={abridgement} onChange={e=>setAbridgement(e.target.value)}>{['unabridged','abridged','adapted','unknown'].map(x=><option key={x} value={x}>{name(x)}</option>)}</select></label>
     </div>
     <label>Duration in minutes<input type="number" min="1" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="e.g. 635"/></label>
    </section>}
   </div>
   <aside className="cs-book-editor-side">
    <section className="cs-book-editor-section">
     <header><span className="cs-book-section-number">{addEdition&&isAudio?'04':'03'}</span><div><h3>Cover image</h3><p>Preview before saving</p></div></header>
     <div className="cs-book-cover-preview">{preview?<img src={preview} alt="Selected cover preview"/>:<div className="cs-book-cover-placeholder"><span aria-hidden="true">▤</span><strong>{title||'Book cover'}</strong><small>Cover preview</small></div>}</div>
     <label>Choose image<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     {!imageStorage&&<small className="cs-book-storage-warning">R2 storage is not yet connected. The preview will not be uploaded.</small>}
     {file&&imageStorage&&<>
      <label>Rights holder<input maxLength={500} required value={rightsHolder} onChange={e=>setRightsHolder(e.target.value)}/></label>
      <label>Licence / permission<input maxLength={250} required value={licenceName} onChange={e=>setLicenceName(e.target.value)}/></label>
      <label>Source URL<input type="url" required value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..."/></label>
      <label className="cs-book-editor-toggle"><input type="checkbox" checked={permission} onChange={e=>setPermission(e.target.checked)}/> I have permission to display this image</label>
     </>}
    </section>
    <div className="cs-book-editor-summary"><strong>Publication status</strong><p>The current API saves directly as published. Draft and publish controls will be added after server-side permissions and status transitions are ready.</p></div>
    <div className="cs-book-editor-summary"><strong>Quick checks</strong><ul><li>{title.trim()?'✓':'○'} Book title entered</li><li>{authorReady?'✓':'○'} Author identity confirmed</li><li>{isbn13Valid&&isbn10Valid?'✓':'○'} ISBNs valid (if supplied)</li><li>{duplicateCheckComplete&&!duplicateBlocked?'✓':'○'} Existing-title check complete</li><li>{isAudio?(narratorReady?'✓ Narrator resolved':'○ Narrator requires review'):'Print / digital edition'}</li></ul><small>{totalFields} details populated</small></div>
   </aside>
  </div>
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  <div className="cs-book-editor-footer"><button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
   <button className="cs-book-save" disabled={saving||!title.trim()||!authorReady||!narratorReady||!duplicateCheckComplete||!!duplicateCheckError||duplicateBlocked||!isbn13Valid||!isbn10Valid||(!!file&&imageStorage&&!canUpload)} type="submit">{saving?'Saving book…':!duplicateCheckComplete?'Checking catalogue…':'Save book to catalogue'}</button></div>
 </form>;
}
