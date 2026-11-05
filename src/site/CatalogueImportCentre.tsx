import {useState} from 'react';
import {apiGet,apiWrite} from './api';

type Decision='create_draft'|'needs_enrichment'|'existing_edition'|'review_match'|'invalid'|'duplicate_in_batch';
type Row={index:number;title:string;author:string;isbn13:string|null;decision:Decision;reason:string;authorMatches?:{id:string;name:string}[];quality:{ready:boolean;score:number;missing:string[];blocking:string[];optionalMissing:string[];warnings:string[];editionCount:number;verifiedEditionCount:number;formatCoverage:string[]};existingWorkId?:string;existingEditionId?:string};
type Result={dryRun:true;rows:Row[];summary:Record<Decision,number>};
const example=JSON.stringify({candidates:[
 {sourceId:'openlibrary',sourceKey:'/works/OL123W',title:'Example book',author:'Example Author',isbn13:'9780306406157',format:'paperback'}
]},null,2);
const labels:Record<Decision,string>={
 create_draft:'Draft-ready structure',needs_enrichment:'Needs metadata',existing_edition:'Existing edition',review_match:'Identity review',invalid:'Invalid',duplicate_in_batch:'Repeated in batch'
};
export function CatalogueImportCentre(){
 const [input,setInput]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const [lookup,setLookup]=useState(''),[lookupLoading,setLookupLoading]=useState(false),[lookupNotice,setLookupNotice]=useState('');
 const [found,setFound]=useState<{sourceKey?:string;title?:string;author?:string}[]>([]);
 const [enriching,setEnriching]=useState<string|null>(null);
 const [selectedAuthors,setSelectedAuthors]=useState<Record<string,string>>({});
 const [draftConfirmed,setDraftConfirmed]=useState(false);
 const [workFirstDraft,setWorkFirstDraft]=useState(false);
 const [draftSaving,setDraftSaving]=useState(false);
 const [draftResult,setDraftResult]=useState<{saved:true;imported:{id:string;title:string;editionIds:string[]}[]}|null>(null);
 async function discover(){
  setLookupLoading(true);setError('');setResult(null);setDraftResult(null);setDraftConfirmed(false);setSelectedAuthors({});setLookupNotice('');
  try{
   const response=await apiGet<{source:string;lookupOnly:true;candidates:Record<string,unknown>[];notice:string}>('/api/catalogue-admin/import/discover?q='+encodeURIComponent(lookup));
   setFound(response.candidates);
   setInput(JSON.stringify({candidates:response.candidates},null,2));
   setLookupNotice(response.candidates.length?response.candidates.length+' candidates found. Review their metadata and run Preview batch below.': 'No verified book/author candidates were found for that query.');
  }catch(e){setError(e instanceof Error?e.message:'Search unavailable')}
  finally{setLookupLoading(false)}
 }
 async function enrich(workKey:string){
  setEnriching(workKey);setError('');setResult(null);setDraftResult(null);setDraftConfirmed(false);
  try{
   const response=await apiGet<{candidate:Record<string,unknown>;partial:boolean;notice:string}>(
    '/api/catalogue-admin/import/enrich?workKey='+encodeURIComponent(workKey));
   const manifest=JSON.parse(input) as {candidates:Record<string,unknown>[]};
   if(!Array.isArray(manifest.candidates))throw Error('Invalid candidate manifest');
   const at=manifest.candidates.findIndex(c=>c.sourceKey===workKey);
   if(at<0)throw Error('This work is no longer in the current batch.');
   const previous=manifest.candidates[at]!;
   manifest.candidates[at]={...previous,...response.candidate,author:previous.author};
   setInput(JSON.stringify(manifest,null,2));
   setLookupNotice(response.partial?'This book has more than 50 editions. All other editions must come from the official offline dump before import.':
    'Retrieved the available work and edition details. Run Preview batch to identify any remaining gaps.');
  }catch(e){setError(e instanceof Error?e.message:'Could not enrich this work')}
  finally{setEnriching(null)}
 }
 async function loadJsonFile(file:File|undefined){
  if(!file)return;
  setError('');
  if(file.size>300000){setError('JSON file is too large (maximum 300 KB).');return}
  try{
   const raw=await file.text();
   const parsed:unknown=JSON.parse(raw);
   if(!parsed||typeof parsed!=='object'||!('candidates' in parsed)||
      !Array.isArray(parsed.candidates)||parsed.candidates.length<1||parsed.candidates.length>10)
    throw Error('Expected a JSON file with 1–10 candidates.');
   setInput(JSON.stringify({candidates:parsed.candidates},null,2));
   setResult(null);setDraftResult(null);setDraftConfirmed(false);setSelectedAuthors({});
   setLookupNotice(parsed.candidates.length+' books loaded from file. Click Preview batch below.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to read JSON file')}
 }
 async function check(){
  setLoading(true);setError('');setResult(null);setDraftResult(null);setDraftConfirmed(false);
  try{
   const parsed=JSON.parse(input);
   if(!parsed||!Array.isArray(parsed.candidates))throw Error('Expected a JSON object with a candidates array.');
   const response=await apiWrite<Result>('/api/catalogue-admin/import/preview','POST',parsed);
   setResult(response);
  }catch(e){setError(e instanceof Error?e.message:'Unable to preview batch')}
  finally{setLoading(false)}
 }
 const draftRows=result?.rows.filter(row=>row.decision==='create_draft')||[];
 const maySave=Boolean(result&&result.rows.length===draftRows.length&&draftRows.length>0&&draftRows.length<=10
  &&draftRows.reduce((n,row)=>n+row.quality.editionCount,0)<=50
  &&(workFirstDraft||draftRows.every(row=>row.quality.optionalMissing.length===0&&row.quality.editionCount===row.quality.verifiedEditionCount))
  &&draftRows.every(row=>!(row.authorMatches?.length)||(row.authorMatches.length===1&&selectedAuthors[row.author]===row.authorMatches[0]?.id))
  &&draftRows.every(row=>!row.quality.formatCoverage.some(format=>format.includes('audio'))));
 async function saveDrafts(){
  if(!maySave||!draftConfirmed||draftSaving)return;
  setDraftSaving(true);setError('');setDraftResult(null);
  try{
   const parsed=JSON.parse(input) as {candidates:Record<string,unknown>[]};
   const candidates=parsed.candidates.map(candidate=>({
    ...candidate,authorId:selectedAuthors[String(candidate.author)]||candidate.authorId
   }));
   const response=await apiWrite<{saved:true;imported:{id:string;title:string;editionIds:string[]}[]}>(
    '/api/catalogue-admin/import/drafts','POST',{candidates,confirmed:true,workFirstDraft});
   setDraftResult(response);setResult(null);setDraftConfirmed(false);
  }catch(e){setError(e instanceof Error?e.message:'Draft import failed. Confirm no records were saved before retrying.')}
  finally{setDraftSaving(false)}
 }
 return <section className="cs-import-centre" aria-label="Catalogue import preview">
  <header><div><p className="cs-admin-eyebrow">IMPORT CENTRE · PHASE ONE</p>
    <h3>Review a catalogue batch</h3>
    <p>Check books, authors and edition data for completeness before importing. Missing fields are flagged so you can enrich them in batches, not edit every book later.</p></div>
   <span className="cs-import-dry-run">Preview first · reviewed draft import</span></header>
  <div className="cs-import-lookup"><label>Look up a title or author in Open Library
   <input type="search" placeholder="e.g. Simon Kernick" value={lookup} onChange={e=>setLookup(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(lookup.trim().length>=3&&!lookupLoading)void discover()}}}/>
  </label><button type="button" disabled={lookup.trim().length<3||lookupLoading} onClick={()=>void discover()}>{lookupLoading?'Searching…':'Find candidates'}</button></div>
  {lookupNotice&&<p className="cs-import-lookup-status" role="status">{lookupNotice}</p>}
  {found.length>0&&<div className="cs-import-found" aria-label="Found works">
   {found.map((item,index)=><div key={item.sourceKey||index}>
    <div><strong>{item.title||'Untitled'}</strong><small>{item.author||'Unknown author'}</small></div>
    <button type="button" disabled={!item.sourceKey||enriching!==null} onClick={()=>item.sourceKey&&void enrich(item.sourceKey)}>
     {enriching===item.sourceKey?'Getting editions…':'Get book & editions'}
    </button>
   </div>)}
  </div>}
  <div className="cs-import-file-load">
   <label>Load a prepared book batch from your computer
    <input type="file" accept=".json,application/json" aria-label="Choose catalogue JSON file"
     onChange={e=>{const file=e.currentTarget.files?.[0];void loadJsonFile(file);e.currentTarget.value=''}}/>
   </label>
   <p>Select <strong>five-books-import-centre.json</strong> to load the five Simon Kernick books without using the clipboard.</p>
  </div>
  <p className="cs-import-help">Paste a JSON manifest with a <code>candidates</code> array. Each candidate needs a title and author. ISBN, source ID, source key, format and publication date are optional. The example is fictional and will not be imported.</p>
  <textarea spellCheck={false} value={input} onChange={e=>{setInput(e.target.value);setResult(null);setDraftResult(null);setDraftConfirmed(false);setSelectedAuthors({})}} rows={12} aria-label="Import candidate JSON" placeholder={example}/>
  <div className="cs-import-actions"><button type="button" className="primary" disabled={!input.trim()||loading} onClick={()=>void check()}>{loading?'Checking against BOOK_DB…':'Preview batch'}</button>
   <button type="button" onClick={()=>{setInput(example);setResult(null)}}>Insert example</button>
   <button type="button" onClick={()=>{setInput('');setResult(null);setError('')}}>Clear</button></div>
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {draftResult&&<div className="cs-import-draft-success" role="status">
   <h4>{draftResult.imported.length} books saved as private drafts</h4>
   <p>Nothing was published. Review each draft before publishing.</p>
   <ul>{draftResult.imported.map(work=><li key={work.id}><a href={'/admin/catalogue/book/'+encodeURIComponent(work.id)}>{work.title}</a> — {work.editionIds.length} editions</li>)}</ul>
  </div>}
  {result&&<div className="cs-import-results" role="region" aria-label="Dry-run results">
   <h4>Dry-run results · {result.rows.length} candidates</h4>
   <div className="cs-import-summary">
    {(Object.keys(labels) as Decision[]).map(key=><div key={key}><strong>{result.summary[key]}</strong><span>{labels[key]}</span></div>)}
   </div>
   <div className="cs-import-table-scroll"><table><thead><tr><th>Book / author</th><th>Editions</th><th>Completeness</th><th>Decision</th><th>Missing information</th></tr></thead>
    <tbody>{result.rows.map(row=><tr key={row.index}><td><strong>{row.title||'Missing title'}</strong><small>{row.author||'Missing author'}</small></td><td>{row.quality.editionCount} supplied · {row.quality.verifiedEditionCount} verified</td><td><strong>{row.quality.score}%</strong></td><td><span className={'cs-import-status status-'+row.decision}>{labels[row.decision]}</span></td><td>{row.reason}{row.quality.missing.length>0&&<details className="cs-import-missing"><summary>{row.quality.blocking?.length||0} required · {row.quality.optionalMissing?.length||0} optional gaps</summary><ul>{row.quality.missing.map(field=><li key={field}><strong>{row.quality.blocking?.includes(field)?'Required':'Optional'}</strong> · {field}</li>)}</ul></details>}{row.quality.warnings.length>0&&<p className="cs-import-warning">{row.quality.warnings.join(' ')}</p>}{row.existingWorkId&&<><small>Existing work: {row.existingWorkId}</small><a href={'/admin/catalogue/book/'+encodeURIComponent(row.existingWorkId)}>Open saved book</a></>}</td></tr>)}</tbody>
   </table></div>
   <section className="cs-import-draft-gate" aria-label="Save reviewed books as drafts">
    <h4>Save source-identified books as private drafts</h4>
    <p>Choose complete-metadata mode or work-first mode. Work-first permits missing optional metadata but never accepts ISBN-less editions, unknown formats, audio without recordings, or unverified identities. Maximum ten works and fifty editions. Nothing is published automatically.</p>
    <label className="cs-import-confirm"><input type="checkbox" checked={workFirstDraft} onChange={e=>{setWorkFirstDraft(e.target.checked);setDraftConfirmed(false)}}/> Work-first private drafts: allow missing optional metadata. I will review missing fields before publishing.</label>
    {draftRows.length>0&&draftRows.map(row=>row.authorMatches?.length?<div className="cs-import-author-match" key={row.index}>
      <strong>{row.author}</strong>
      {row.authorMatches.length===1?<button type="button" className={selectedAuthors[row.author]===row.authorMatches[0]?.id?'selected':''}
       onClick={()=>{setSelectedAuthors(previous=>({...previous,[row.author]:row.authorMatches![0]!.id}));setDraftConfirmed(false)}}>
        {selectedAuthors[row.author]===row.authorMatches[0]?.id?'✓ Confirmed existing author':'Confirm existing author'} · {row.authorMatches[0]?.name}
       </button>:<span>Multiple catalogue contributors share this name. Resolve the identity in Authors before importing.</span>}
     </div>:null)}
    {result.rows.length>10&&<p className="cs-import-warning">Select a batch of no more than 10 books before saving.</p>}
    {result.rows.some(row=>row.decision!=='create_draft')&&<p className="cs-import-warning">This batch includes incomplete, duplicate or ambiguous records. Resolve these before saving drafts.</p>}
    {!workFirstDraft&&result.rows.some(row=>row.quality.optionalMissing.length>0||row.quality.editionCount!==row.quality.verifiedEditionCount)&&<p className="cs-import-warning">At least one book still has missing metadata. Use work-first mode to save private drafts without inventing missing fields.</p>}
    <label className="cs-import-confirm">
     <input type="checkbox" checked={draftConfirmed} disabled={!maySave||draftSaving} onChange={e=>setDraftConfirmed(e.target.checked)}/>
     I have verified the source records, canonical author identities and permitted use of this metadata. Save as private drafts only.
    </label>
    <button type="button" className="cs-import-save-drafts" disabled={!maySave||!draftConfirmed||draftSaving}
     onClick={()=>void saveDrafts()}>{draftSaving?'Saving private drafts…':'Save reviewed books as drafts'}</button>
   </section>
   <p className="cs-import-footnote">Preview remains read-only. The separate confirmed Save as Drafts action creates private catalogue records; publishing is never automatic. Covers are not imported.</p>
  </div>}
 </section>;
}
