import {useState} from 'react';
import {apiGet,apiWrite} from './api';

type Decision='create_draft'|'needs_enrichment'|'existing_edition'|'review_match'|'invalid'|'duplicate_in_batch';
type Row={index:number;title:string;author:string;isbn13:string|null;decision:Decision;reason:string;quality:{ready:boolean;score:number;missing:string[];blocking:string[];optionalMissing:string[];warnings:string[];editionCount:number;verifiedEditionCount:number;formatCoverage:string[]};existingWorkId?:string;existingEditionId?:string};
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
 async function discover(){
  setLookupLoading(true);setError('');setResult(null);setLookupNotice('');
  try{
   const response=await apiGet<{source:string;lookupOnly:true;candidates:Record<string,unknown>[];notice:string}>('/api/catalogue-admin/import/discover?q='+encodeURIComponent(lookup));
   setFound(response.candidates);
   setInput(JSON.stringify({candidates:response.candidates},null,2));
   setLookupNotice(response.candidates.length?response.candidates.length+' candidates found. Review their metadata and run Preview batch below.': 'No verified book/author candidates were found for that query.');
  }catch(e){setError(e instanceof Error?e.message:'Search unavailable')}
  finally{setLookupLoading(false)}
 }
 async function enrich(workKey:string){
  setEnriching(workKey);setError('');setResult(null);
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
 async function check(){
  setLoading(true);setError('');setResult(null);
  try{
   const parsed=JSON.parse(input);
   if(!parsed||!Array.isArray(parsed.candidates))throw Error('Expected a JSON object with a candidates array.');
   const response=await apiWrite<Result>('/api/catalogue-admin/import/preview','POST',parsed);
   setResult(response);
  }catch(e){setError(e instanceof Error?e.message:'Unable to preview batch')}
  finally{setLoading(false)}
 }
 return <section className="cs-import-centre" aria-label="Catalogue import preview">
  <header><div><p className="cs-admin-eyebrow">IMPORT CENTRE · PHASE ONE</p>
    <h3>Review a catalogue batch</h3>
    <p>Check books, authors and edition data for completeness before importing. Missing fields are flagged so you can enrich them in batches, not edit every book later.</p></div>
   <span className="cs-import-dry-run">Read-only dry run</span></header>
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
  <p className="cs-import-help">Paste a JSON manifest with a <code>candidates</code> array. Each candidate needs a title and author. ISBN, source ID, source key, format and publication date are optional. The example is fictional and will not be imported.</p>
  <textarea spellCheck={false} value={input} onChange={e=>{setInput(e.target.value);setResult(null)}} rows={12} aria-label="Import candidate JSON" placeholder={example}/>
  <div className="cs-import-actions"><button type="button" className="primary" disabled={!input.trim()||loading} onClick={()=>void check()}>{loading?'Checking against BOOK_DB…':'Preview batch'}</button>
   <button type="button" onClick={()=>{setInput(example);setResult(null)}}>Insert example</button>
   <button type="button" onClick={()=>{setInput('');setResult(null);setError('')}}>Clear</button></div>
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {result&&<div className="cs-import-results" role="region" aria-label="Dry-run results">
   <h4>Dry-run results · {result.rows.length} candidates</h4>
   <div className="cs-import-summary">
    {(Object.keys(labels) as Decision[]).map(key=><div key={key}><strong>{result.summary[key]}</strong><span>{labels[key]}</span></div>)}
   </div>
   <div className="cs-import-table-scroll"><table><thead><tr><th>Book / author</th><th>Editions</th><th>Completeness</th><th>Decision</th><th>Missing information</th></tr></thead>
    <tbody>{result.rows.map(row=><tr key={row.index}><td><strong>{row.title||'Missing title'}</strong><small>{row.author||'Missing author'}</small></td><td>{row.quality.editionCount} supplied · {row.quality.verifiedEditionCount} verified</td><td><strong>{row.quality.score}%</strong></td><td><span className={'cs-import-status status-'+row.decision}>{labels[row.decision]}</span></td><td>{row.reason}{row.quality.missing.length>0&&<details className="cs-import-missing"><summary>{row.quality.blocking?.length||0} required · {row.quality.optionalMissing?.length||0} optional gaps</summary><ul>{row.quality.missing.map(field=><li key={field}><strong>{row.quality.blocking?.includes(field)?'Required':'Optional'}</strong> · {field}</li>)}</ul></details>}{row.quality.warnings.length>0&&<p className="cs-import-warning">{row.quality.warnings.join(' ')}</p>}{row.existingWorkId&&<><small>Existing work: {row.existingWorkId}</small><a href={'/admin/catalogue/book/'+encodeURIComponent(row.existingWorkId)}>Open saved book</a></>}</td></tr>)}</tbody>
   </table></div>
   <p className="cs-import-footnote">No database writes were performed. A draft-ready structure is not a fully enriched book. Remaining optional gaps are explicitly reported; no records can be imported or published from this screen; source licensing and identity checks remain required.</p>
  </div>}
 </section>;
}
