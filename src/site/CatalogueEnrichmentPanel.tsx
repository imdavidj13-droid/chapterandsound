import {useEffect,useMemo,useState} from 'react';
import {apiGet,apiWrite} from './api';

type Edition={id:string;format:string;revision:number;pageCount:number|null};
type Identifier={editionId:string;code:string;value:string};
type Meta={editions:Edition[];identifiers:Identifier[]};
type Finding={title?:string;isbn13?:string;field?:string;value?:unknown;source?:string;decision?:string};
type Proposal={editionId:string;isbn13:string;revision:number;format:string;pages:number;title:string};
type Lookup={found:boolean;editionId:string;isbn13:string;pageCount?:number|null;publisher?:string;publicationDate?:string;title?:string};
const isbn=(s:string)=>s.replace(/[ -]/g,'');
const norm=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gi,' ').trim();

export function CatalogueEnrichmentPanel({workId,title}:{workId:string;title:string}){
 const [meta,setMeta]=useState<Meta|null>(null);
 const [items,setItems]=useState<Finding[]>([]);
 const [fileName,setFileName]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [approved,setApproved]=useState(false);
 const [lookups,setLookups]=useState<Record<string,Lookup>>({});
 const [lookupBusy,setLookupBusy]=useState('');
 useEffect(()=>{setMeta(null);setItems([]);setFileName('');setApproved(false);setLookups({});
  void apiGet<Meta>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata')
   .then(setMeta).catch(e=>setError(e instanceof Error?e.message:'Unable to read editions'));
 },[workId]);
 const isbnFor=(editionId:string)=>meta?.identifiers.find(i=>i.editionId===editionId&&i.code==='ISBN13')?.value||'';
 async function lookupEdition(editionId:string){
  setLookupBusy(editionId);setError('');setNotice('');setApproved(false);
  try{
   const result=await apiGet<Lookup>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/enrich/isbn?editionId='+encodeURIComponent(editionId));
   setLookups(previous=>({...previous,[editionId]:result}));
  }catch(e){setError(e instanceof Error?e.message:'Open Library lookup failed')}
  finally{setLookupBusy('')}
 }
 const proposals=useMemo(()=>{
  if(!meta)return [] as Proposal[];
  const matched:Proposal[]=[];
  for(const candidate of items){
   if(candidate.field!=='pageCount'||!candidate.isbn13||!candidate.title||norm(candidate.title)!==norm(title))continue;
   const pages=Number(candidate.value);
   if(!Number.isSafeInteger(pages)||pages<1||pages>100000)continue;
   const id=isbn(candidate.isbn13);
   const hits=meta.identifiers.filter(v=>v.code==='ISBN13'&&isbn(v.value)===id);
   if(hits.length!==1)continue;
   const edition=meta.editions.find(e=>e.id===hits[0]?.editionId);
   if(!edition||edition.pageCount!==null||matched.some(p=>p.editionId===edition.id))continue;
   matched.push({editionId:edition.id,isbn13:id,revision:edition.revision,format:edition.format,pages,title:candidate.title});
  }
  for(const lookup of Object.values(lookups)){
   if(!lookup.found||!lookup.pageCount)continue;
   const edition=meta.editions.find(e=>e.id===lookup.editionId);
   if(!edition||edition.pageCount!==null||matched.some(p=>p.editionId===edition.id))continue;
   if(isbnFor(edition.id).replace(/[ -]/g,'')!==lookup.isbn13)continue;
   matched.push({editionId:edition.id,isbn13:lookup.isbn13,revision:edition.revision,format:edition.format,pages:lookup.pageCount,title});
  }
  return matched;
 },[items,meta,title,lookups]);
 async function loadFile(file:File|undefined){
  if(!file)return;
  setError('');setNotice('');setApproved(false);setItems([]);setFileName('');
  if(file.size>2000000){setError('File exceeds 2 MB');return}
  try{
   const data:unknown=JSON.parse(await file.text());
   if(!data||typeof data!=='object'||!('status' in data)||!('additionalFields' in data))throw Error('Expected the ISBNdb manual triage report');
   const report=data as {status:unknown;additionalFields:unknown};
   if(report.status!=='OFFLINE_REVIEW_ONLY_NO_API_CALLS'||!Array.isArray(report.additionalFields))throw Error('This is not a recognised ISBNdb triage report');
   setItems(report.additionalFields as Finding[]);setFileName(file.name);
  }catch(e){setError(e instanceof Error?e.message:'Unable to read evidence file')}
 }
 async function apply(p:Proposal){
  if(!approved||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await apiWrite('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata','POST',{
    action:'enrichPageCount',editionId:p.editionId,isbn13:p.isbn13,pageCount:p.pages,
    expectedRevision:p.revision,confirmed:true,rightsReviewed:true
   });
   const next=await apiGet<Meta>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata');
   setMeta(next);setNotice('Page count saved to the existing edition. No new record was created.');
  }catch(e){setError(e instanceof Error?e.message:'No update was confirmed')}
  finally{setBusy(false)}
 }
 return <section className="cs-enrichment-panel" aria-label="Enrich existing editions">
  <h3>Enrich existing editions</h3>
  <p>Check an edition against Open Library by ISBN, or load your existing <strong>isbndb-manual-triage.json</strong> report. Results are proposals only: the existing catalogue stays unchanged until you approve each individual field.</p>
  {meta&&<div className="cs-enrichment-proposals">{meta.editions.map(edition=><div className="cs-enrichment-proposal" key={edition.id}>
   <div><strong>{edition.format.replaceAll('_',' ')}</strong><small>ISBN {isbnFor(edition.id)||'not available'} · Pages {edition.pageCount??'missing'}</small>
    {lookups[edition.id]&&<small>{lookups[edition.id].found?(lookups[edition.id].pageCount?'Open Library proposes '+lookups[edition.id].pageCount+' pages':'No page count available from Open Library'):'ISBN not found in Open Library'}{lookups[edition.id].publisher?' · '+lookups[edition.id].publisher:''}{lookups[edition.id].publicationDate?' · '+lookups[edition.id].publicationDate:''}</small>}
   </div><button type="button" disabled={!isbnFor(edition.id)||lookupBusy!==''||edition.pageCount!==null} onClick={()=>void lookupEdition(edition.id)}>{lookupBusy===edition.id?'Looking up…':'Check Open Library'}</button>
  </div>)}</div>}
  <label>Choose reviewed evidence file
   <input type="file" accept=".json,application/json" onChange={e=>{void loadFile(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
  </label>
  {fileName&&<p role="status">Loaded {fileName} · {items.length} evidence findings · {proposals.length} eligible missing page counts for this book.</p>}
  {items.length>0&&<p>Publisher, date, format and language proposals are <strong>not automatically applied</strong>. Disputed values and populated fields remain unchanged.</p>}
  {proposals.length>0&&<>
   <label className="cs-enrichment-rights"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
    I have checked these proposals against the original edition and confirmed that my use of this source data is permitted.
   </label>
   <div className="cs-enrichment-proposals">{proposals.map(p=><div key={p.editionId} className="cs-enrichment-proposal">
    <div><strong>{p.format.replaceAll('_',' ')}</strong><small>ISBN {p.isbn13} · Proposed page count: {p.pages}</small></div>
    <button type="button" disabled={!approved||busy} onClick={()=>void apply(p)}>{busy?'Saving…':'Approve page count'}</button>
   </div>)}</div>
  </>}
  {fileName&&proposals.length===0&&<p>No matching blank page-count fields are present for this book. Existing values are not overwritten.</p>}
  {error&&<p className="cs-admin-error" role="alert">{error}</p>}
  {notice&&<p className="cs-admin-success" role="status">{notice}</p>}
 </section>;
}
