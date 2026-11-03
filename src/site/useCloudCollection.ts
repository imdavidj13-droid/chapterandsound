import {useEffect,useState} from 'react';
/**
 * Read public collections from the real Cloudflare Worker/D1 service.
 * No local cache is treated as authoritative. Searches and pagination reload
 * from D1; filter text and current page number are temporary UI state only.
 */
export function useCloudCollection<T>(kind:'books'|'reviews',term:string,format='all'){
 const [items,setItems]=useState<T[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [page,setPage]=useState(0);
 const [hasNext,setHasNext]=useState(false);
 useEffect(()=>setPage(0),[term,format,kind]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{
   if(!active)return;
   setLoading(true);setError('');
   try{
    const params=new URLSearchParams({limit:'60',offset:String(page*60),format});
    if(term.trim())params.set('q',term.trim());
    const response=await fetch('/api/'+kind+'?'+params,{credentials:'include',signal:controller.signal});
    if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string}|null;throw Error(body?.error||'Cloud search unavailable')}
    const payload=await response.json() as {items:T[]};
    if(active){setItems(payload.items??[]);setHasNext((payload.items?.length??0)===60)}
   }catch(e){if(active&&!controller.signal.aborted){setItems([]);setHasNext(false);setError(e instanceof Error?e.message:'Unable to load live data')}}
   finally{if(active)setLoading(false)}
  },term.trim()?200:0);
  return()=>{active=false;controller.abort();clearTimeout(timer)}
 },[kind,term,format,page]);
 return {items,loading,error,page,setPage,hasNext};
}
