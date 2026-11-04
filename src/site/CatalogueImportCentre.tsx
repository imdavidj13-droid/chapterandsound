import {useState} from 'react';
import {apiWrite} from './api';

type Decision='create_draft'|'existing_edition'|'review_match'|'invalid'|'duplicate_in_batch';
type Row={index:number;title:string;author:string;isbn13:string|null;decision:Decision;reason:string;existingWorkId?:string;existingEditionId?:string};
type Result={dryRun:true;rows:Row[];summary:Record<Decision,number>};
const example=JSON.stringify({candidates:[
 {sourceId:'openlibrary',sourceKey:'/works/OL123W',title:'Example book',author:'Example Author',isbn13:'9780306406157',format:'paperback'}
]},null,2);
const labels:Record<Decision,string>={
 create_draft:'Ready for draft review',existing_edition:'Existing edition',review_match:'Identity review',invalid:'Invalid',duplicate_in_batch:'Repeated in batch'
};
export function CatalogueImportCentre(){
 const [input,setInput]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
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
    <p>Validate up to 100 candidates against the existing book catalogue. This preview never imports or publishes any records.</p></div>
   <span className="cs-import-dry-run">Read-only dry run</span></header>
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
   <div className="cs-import-table-scroll"><table><thead><tr><th>Book / author</th><th>ISBN-13</th><th>Decision</th><th>Why</th></tr></thead>
    <tbody>{result.rows.map(row=><tr key={row.index}><td><strong>{row.title||'Missing title'}</strong><small>{row.author||'Missing author'}</small></td><td>{row.isbn13||'—'}</td><td><span className={'cs-import-status status-'+row.decision}>{labels[row.decision]}</span></td><td>{row.reason}{row.existingWorkId&&<><small>Existing work: {row.existingWorkId}</small><a href={'/admin/catalogue/book/'+encodeURIComponent(row.existingWorkId)}>Open saved book</a></>}</td></tr>)}</tbody>
   </table></div>
   <p className="cs-import-footnote">No database writes were performed. “Ready for draft review” is not a permission to automatically import or publish metadata; source licensing and identity checks remain required.</p>
  </div>}
 </section>;
}
