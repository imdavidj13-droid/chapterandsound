import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {apiGet,apiWrite} from './api';

type Row=Record<string,unknown>&{id?:string;name?:string;revision?:number};
type Choice={id:string;name:string};
type Field={name:string;label:string;type?:'text'|'textarea'|'number'|'select'|'checkbox';required?:boolean;options?:string[];choices?:string;placeholder?:string};
type Area={key:string;label:string;fields:Field[];editable?:boolean;hint?:string};
const fields=(...args:Field[])=>args;
const field=(name:string,label:string,required=false,extras:Partial<Field>={}):Field=>({name,label,required,...extras});
const choices=(name:string,label:string,choices:string,required=true):Field=>field(name,label,required,{type:'select',choices});
const options=(name:string,label:string,...options:string[]):Field=>field(name,label,true,{type:'select',options});
const areas:Area[]=[
 {key:'people',label:'Authors & narrators',editable:true,fields:fields(field('name','Preferred name',true),field('sortName','Sort name'),field('bio','Biography',false,{type:'textarea'}),field('birthDate','Birth date',false,{placeholder:'YYYY or YYYY-MM or YYYY-MM-DD'}),field('deathDate','Death date',false,{placeholder:'YYYY or YYYY-MM or YYYY-MM-DD'}))},
 {key:'editions',label:'Editions',editable:true,fields:fields(choices('workId','Book','works'),options('format','Format','paperback','hardback','ebook','audiobook','audio_cd','other_print','other_digital','unknown'),field('title','Edition title (optional override)'),field('statement','Edition statement'),field('language','Language'),field('pages','Page count',false,{type:'number'}))},
 {key:'recordings',label:'Audiobooks',editable:true,fields:fields(choices('workId','Book','works'),field('title','Recording title'),field('language','Narration language'),options('abridgement','Abridgement','unknown','unabridged','abridged','adapted'),options('performance','Performance','unknown','single_narrator','multi_narrator','full_cast','dramatised','synthetic_voice'),field('seconds','Duration in seconds',false,{type:'number'}),field('recordedDate','Recorded date',false,{placeholder:'YYYY, YYYY-MM or YYYY-MM-DD'}))},
 {key:'publishers',label:'Publishers',fields:fields(field('name','Publisher name',true),field('country','Country'),field('website','Website (https://)'))},
 {key:'organisations',label:'Studios / organisations',fields:fields(field('name','Name',true),options('type','Organisation type','studio','agency','distributor','rights_holder','publisher','other'),field('country','Country'),field('website','Website (https://)'))},
 {key:'imprints',label:'Imprints',fields:fields(field('name','Imprint name',true),choices('publisherId','Publisher','publishers'))},
 {key:'series',label:'Series',fields:fields(field('title','Series title',true),field('description','Description',false,{type:'textarea'}),options('type','Series type','series','subseries','universe','collection'))},
 {key:'series-memberships',label:'Book in series',fields:fields(choices('workId','Book','works'),choices('seriesId','Series','series'),field('number','Display number (e.g. 1.5)'),field('position','Numeric sort position',false,{type:'number'}))},
 {key:'work-titles',label:'Other book titles',fields:fields(choices('workId','Book','works'),field('title','Alternative title',true),options('type','Title type','alternative','original','translated','regional','working','other'),field('language','Language'))},
 {key:'credits',label:'Contributors & credits',fields:fields(choices('personId','Contributor','people'),options('role','Credit role','author','coauthor','narrator','cast','translator','editor','illustrator','cover_artist','foreword','afterword','adapter','producer','director','audio_engineer','other'),options('target','Attach to','work','edition','recording'),choices('targetId','Target record','dynamic'),field('creditName','Printed credit name'),field('order','Credit order',false,{type:'number'}))},
 {key:'identifier-schemes',label:'Identifier schemes',fields:fields(field('code','Scheme (ISBN13, ISBN10, ASIN, etc.)',true),options('scope','Entity scope','edition','recording','work','person','series','organisation','multiple'),options('uniqueness','Uniqueness','global','market','issuer','none'))},
 {key:'identifiers',label:'ISBNs / ASINs / IDs',fields:fields(choices('schemeId','Identifier scheme','identifier-schemes'),options('entityKind','Record type','edition','recording','work','person','series','organisation'),choices('entityId','Record','dynamic'),field('value','Identifier value',true),field('market','Market (e.g. GB, US)'),field('issuer','Issuer (optional)'))},
 {key:'schemes',label:'Classification schemes',fields:fields(field('code','Scheme code',true),field('version','Version'))},
 {key:'subjects',label:'Genres & subjects',fields:fields(choices('schemeId','Classification scheme','schemes'),field('code','Subject code',true),field('name','Subject or genre name',true))},
 {key:'work-subjects',label:'Assign genres to books',fields:fields(choices('workId','Book','works'),choices('subjectId','Subject / genre','subjects'),field('primary','Primary subject',false,{type:'checkbox'}))},
 {key:'publication-events',label:'Publication history',fields:fields(choices('editionId','Edition','editions'),options('type','Event','released','announced','preorder','reprinted','revised','withdrawn','out_of_print'),field('date','Publication date',false,{placeholder:'YYYY / YYYY-MM / YYYY-MM-DD'}),choices('publisherId','Publisher (optional)','publishers',false),field('territory','Territory code'))},
 {key:'recording-editions',label:'Link audio to editions',fields:fields(choices('editionId','Audiobook edition','editions'),choices('recordingId','Recording','recordings'),field('sequence','Sequence',false,{type:'number'}),field('primary','Primary recording',false,{type:'checkbox'}))},
 {key:'tracks',label:'Audiobook chapters',fields:fields(choices('recordingId','Recording','recordings'),field('sequence','Track number',true,{type:'number'}),field('title','Track title'),field('seconds','Runtime in seconds',false,{type:'number'}))}
];
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
type Saved={saved:boolean;id:string;revision?:number};
export function CatalogueManualManager(){
 const [area,setArea]=useState(areas[0]!.key),[optionsMap,setOptionsMap]=useState<Record<string,Choice[]>>({});
 const [rows,setRows]=useState<Row[]>([]),[values,setValues]=useState<Record<string,string|boolean>>({});
 const [editing,setEditing]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[page,setPage]=useState(0);
 const current=areas.find(x=>x.key===area)!;
 const optionTypes=['works','people','editions','recordings','publishers','series','identifier-schemes','schemes','subjects','organisations'];
 const loadChoices=useCallback(async()=>{
  const pairs=await Promise.allSettled(optionTypes.map(async key=>{
   if(key==='works')return [key,(await apiGet<{items:{id:string;title:string}[]}>('/api/catalogue-admin/works?limit=100')).items.map(x=>({id:x.id,name:x.title}))] as const;
   if(key==='people')return [key,(await apiGet<{items:{id:string;name:string}[]}>('/api/catalogue-admin/people?limit=100')).items] as const;
   if(key==='editions')return [key,(await apiGet<{items:{id:string;title:string;format:string}[]}>('/api/catalogue-admin/editions?limit=100')).items.map(x=>({id:x.id,name:x.title+' · '+label(x.format)+' · '+x.id.slice(0,8)}))] as const;
   if(key==='recordings')return [key,(await apiGet<{items:{id:string;title:string}[]}>('/api/catalogue-admin/recordings?limit=100')).items.map(x=>({id:x.id,name:x.title+' · '+x.id.slice(0,8)}))] as const;
   return [key,(await apiGet<{items:Choice[]}>('/api/catalogue-admin/manual/'+key+'?limit=100')).items] as const;
  }));
  const next:Record<string,Choice[]>={};for(const p of pairs)if(p.status==='fulfilled')next[p.value[0]]=[...p.value[1]];
  setOptionsMap(next);
 },[]);
 const loadRows=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const url='/api/catalogue-admin/manual/'+area+'?limit=50&offset='+(page*50)+'&q='+encodeURIComponent(search.trim());
   const result=await apiGet<{items:Row[]}>(url);setRows(result.items);
  }catch(e){setRows([]);setError(e instanceof Error?e.message:'Unable to load records')}
  finally{setLoading(false)}
 },[area,page,search]);
 useEffect(()=>{void loadChoices()},[loadChoices]);
 useEffect(()=>{void loadRows()},[loadRows]);
 const select=(key:string,value:string|boolean)=>setValues(x=>({...x,[key]:value}));
 const dynamicTarget=area==='credits'?(values.target==='recording'?'recordings':values.target==='edition'?'editions':'works'):
  area==='identifiers'?(({work:'works',edition:'editions',recording:'recordings',person:'people',series:'series',organisation:'organisations'} as Record<string,string>)[String(values.entityKind||'edition')]||'editions'):'';
 const displayFields=current.fields.filter(f=>!editing||!['workId','schemeId'].includes(f.name));
 function startNew(){
  setEditing('');setNotice('');setError('');
  const v:Record<string,string|boolean>={};
  for(const f of current.fields){
   if(f.options)v[f.name]=f.options[0]||'';
   else if(f.type==='checkbox')v[f.name]=false;
   else v[f.name]='';
  }
  setValues(v);
 }
 async function editRow(x:Row){
  if(!current.editable||!x.id)return;
  setError('');setNotice('');
  try{
   const res=await apiGet<{item:Row|null}>('/api/catalogue-admin/manual/'+area+'/'+encodeURIComponent(x.id));
   if(!res.item)throw Error('Record no longer exists');
   const v:Record<string,string|boolean>={};
   for(const f of current.fields)v[f.name]=res.item[f.name]==null?'':String(res.item[f.name]);
   setValues(v);setEditing(x.id);setRevision(Number(res.item.revision)||1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load record')}
 }
 async function save(event:FormEvent){
  event.preventDefault();setSaving(true);setError('');setNotice('');
  const endpoint='/api/catalogue-admin/manual/'+area+(editing?'/'+encodeURIComponent(editing):'');
  try{
   const res=await apiWrite<Saved>(endpoint,editing?'PATCH':'POST',{...values,...(editing?{expectedRevision:revision}:{})});
   setNotice((editing?'Updated':'Added')+' successfully in BOOK_DB. '+res.id);
   setEditing(null);setValues({});
   await Promise.all([loadRows(),loadChoices()]);
  }catch(e){setError(e instanceof Error?e.message:'Failed to save record')}
  finally{setSaving(false)}
 }
 return <section className="cs-admin-form" style={{marginTop:24}}>
  <div className="cs-admin-heading"><div><h2>Detailed catalogue management</h2><p>Manage editions, creators, publishers, identifiers, series, genres and audiobook data directly in the cloud database.</p></div></div>
  <label>Metadata section<select value={area} onChange={e=>{setArea(e.target.value);setEditing(null);setPage(0);setSearch('');setValues({});setError('');setNotice('')}}>{areas.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
  <div className="cs-admin-heading"><div><h3>{current.label}</h3>{current.hint&&<p>{current.hint}</p>}</div>
   <button className="primary" type="button" onClick={startNew}>+ Add {current.label.toLowerCase()}</button></div>
  {error&&<p role="alert" className="cs-admin-error">{error}</p>}
  {notice&&<p role="status" className="cs-admin-success">{notice}</p>}
  {editing!==null&&<form className="cs-admin-form" onSubmit={save}>
   <h3>{editing?'Edit record':'Add to catalogue'}</h3>
   {displayFields.map(f=>{
    const raw=values[f.name],value=raw===undefined?'':String(raw);
    if(f.type==='checkbox')return <label key={f.name}><input type="checkbox" checked={raw===true} onChange={e=>select(f.name,e.target.checked)}/>{f.label}</label>;
    if(f.type==='textarea')return <label key={f.name}>{f.label}<textarea rows={4} value={value} onChange={e=>select(f.name,e.target.value)}/></label>;
    if(f.type==='select')return <label key={f.name}>{f.label}{f.choices?(()=>{
      const key=f.choices==='dynamic'?dynamicTarget:f.choices;
      const items=optionsMap[key]||[];
      return <select required={f.required} value={value} onChange={e=>select(f.name,e.target.value)}><option value="">Select existing record</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>;
     })():<select required={f.required} value={value} onChange={e=>select(f.name,e.target.value)}>{(f.options||[]).map(x=><option key={x} value={x}>{label(x)}</option>)}</select>}</label>;
    return <label key={f.name}>{f.label}<input type={f.type==='number'?'number':'text'} step={f.name==='position'?'0.1':f.type==='number'?'1':undefined}
     min={f.type==='number'?'0':undefined} maxLength={f.type==='number'?undefined:1500} required={f.required} placeholder={f.placeholder} value={value} onChange={e=>select(f.name,e.target.value)}/></label>;
   })}
   <div className="cs-admin-actions"><button type="button" disabled={saving} onClick={()=>setEditing(null)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?'Saving to BOOK_DB…':'Save record'}</button></div>
  </form>}
  <div className="cs-admin-heading" style={{marginTop:14}}><label>Find records<input value={search} onChange={e=>{setPage(0);setSearch(e.target.value)}} placeholder="Search name (where supported)"/></label><button type="button" disabled={loading} onClick={()=>void Promise.all([loadRows(),loadChoices()])}>Refresh</button></div>
  <div className="cs-admin-data cs-admin-table-scroll">
   <table><thead><tr><th>Record</th><th>Details</th><th>Actions</th></tr></thead><tbody>
    {rows.map((x,i)=><tr key={x.id||String(i)}>
      <td>{String(x.name??x.value??x.title??x.code??x.id??'Record')}</td>
      <td>{Object.entries(x).filter(([k,v])=>!['id','name','title','value'].includes(k)&&v!=null).slice(0,4).map(([k,v])=>label(k)+': '+String(v)).join(' · ')}</td>
      <td>{current.editable&&x.id?<button type="button" onClick={()=>void editRow(x)}>Edit</button>:<code>{String(x.id||'—').slice(0,8)}</code>}</td>
    </tr>)}
   </tbody></table>
   {!loading&&rows.length===0&&<p>No records in this section yet.</p>}
  </div>
  <div className="cs-admin-pager"><button disabled={loading||page===0} onClick={()=>setPage(Math.max(0,page-1))}>Previous</button><span>Page {page+1}</span><button disabled={loading||rows.length<50} onClick={()=>setPage(page+1)}>Next</button></div>
  <p className="cs-admin-hint">Identifier schemes must be created before ISBN/ASIN assignments. For ISBN13 use the ISBN13 scheme and for ISBN10 use ISBN10; checksum validation runs on the server. Selecting a book, edition or recording links existing catalogue records rather than creating duplicates.</p>
 </section>;
}
