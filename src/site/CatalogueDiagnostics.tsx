import {useState} from 'react';
import {apiGet} from './api';

type Counts={works:number;drafts:number;published:number;verified:number;editions:number;recordings:number;people:number;mediaLinks:number};
type Checks={booksWithoutAuthors:number|null;duplicateIdentifierGroups:number|null;orphanEditions:number|null;publishedWithoutCovers:number|null;foreignKeyErrors:number};
type Diagnostics={checkedAt:string;database:string;readOnly:boolean;counts:Counts;checks:Checks;storage:{r2BindingPresent:boolean;r2ObjectOperationsTested:boolean};warnings:string[]};

/** Runs only admin-authenticated, read-only queries against the currently deployed BOOK_DB. */
export function CatalogueDiagnostics(){
 const [result,setResult]=useState<Diagnostics|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 async function check(){
  setLoading(true);setError('');
  try{setResult(await apiGet<Diagnostics>('/api/catalogue-admin/diagnostics'))}
  catch(e){setError(e instanceof Error?e.message:'Unable to check the connected catalogue');setResult(null)}
  finally{setLoading(false)}
 }
 return <section className="cs-catalogue-diagnostics">
  <div className="cs-linked-toolbar"><div><h3>Production catalogue diagnostics</h3><p>Check the connected BOOK_DB without modifying books, authors, ratings or reviews.</p></div>
   <button type="button" disabled={loading} onClick={()=>void check()}>{loading?'Checking…':'Run read-only checks'}</button></div>
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {result&&<div role="status">
   <p><strong>Connected database:</strong> {result.database} · <strong>Checked:</strong> {new Date(result.checkedAt).toLocaleString()}</p>
   <div className="cs-catalogue-diagnostic-grid">
    <span>Books <strong>{result.counts.works}</strong></span>
    <span>Drafts <strong>{result.counts.drafts}</strong></span>
    <span>Published <strong>{result.counts.published}</strong></span>
    <span>Editions <strong>{result.counts.editions}</strong></span>
    <span>Recordings <strong>{result.counts.recordings}</strong></span>
    <span>Contributors <strong>{result.counts.people}</strong></span>
   </div>
   <div className="cs-catalogue-diagnostic-grid">
    <span>Foreign-key errors <strong>{result.checks.foreignKeyErrors}</strong></span>
    <span>Orphan editions <strong>{result.checks.orphanEditions??'Unknown'}</strong></span>
    <span>Repeated identifiers <strong>{result.checks.duplicateIdentifierGroups??'Unknown'}</strong></span>
    <span>Books missing authors <strong>{result.checks.booksWithoutAuthors??'Unknown'}</strong></span>
    <span>Published books without covers <strong>{result.checks.publishedWithoutCovers??'Unknown'}</strong></span>
    <span>R2 binding <strong>{result.storage.r2BindingPresent?'Present':'Unavailable'}</strong></span>
   </div>
   <p className="cs-book-edit-hint">R2 object uploads and authenticated writes are NOT tested by this diagnostic. Missing covers are a metadata-completeness warning.</p>
  </div>}
 </section>;
}
