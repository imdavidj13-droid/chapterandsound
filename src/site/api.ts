export type ApiEnvelope<T>={items?:T[];item?:T;error?:string;id?:string;saved?:boolean;published?:boolean;existingId?:string};
export async function apiGet<T>(path:string):Promise<T>{
  const response=await fetch(path,{credentials:'include'});
  const data=await response.json() as T&{error?:string};
  if(!response.ok)throw new Error(data.error??'Unable to load information');
  return data;
}
export async function apiWrite<T>(path:string,method:'POST'|'PUT'|'PATCH'|'DELETE',body?:object):Promise<T>{
  const response=await fetch(path,{method,credentials:'include',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await response.json() as T&{error?:string};
  if(!response.ok)throw new Error(data.error??'Unable to save changes');
  return data;
}
