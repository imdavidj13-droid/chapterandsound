/**
 * Provisional search display grouping only. Never persist these group keys or
 * use them for canonical identity decisions. Title/author agreement alone
 * is insufficient evidence to merge catalogue works.
 */
export type SearchEdition={
 key:string;title:string;author:string;isbn13:string|null;publisher:string|null;
 publishedDate:string|null;pages:number|null;coverUrl:string|null;previewCoverUrl?:string|null;language:string|null;source:string;
};
export type SearchGroup={id:string;title:string;author:string;items:SearchEdition[];ambiguous:boolean};
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-GB')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function groupSearchResults(items:SearchEdition[]):SearchGroup[]{
 const groups=new Map<string,SearchGroup>();
 for(const item of items){
  const title=normalize(item.title),author=normalize(item.author);
  const signature=title&&author?JSON.stringify([title,author]):'record:'+item.key;
  let group=groups.get(signature);
  if(!group){
   group={id:signature,title:item.title,author:item.author,items:[],ambiguous:false};
   groups.set(signature,group);
  }
  if(item.isbn13&&group.items.some(existing=>existing.isbn13===item.isbn13))continue;
  group.items.push(item);
  group.ambiguous=group.items.length>1;
 }
 return [...groups.values()];
}

/** Display-only options in priority order; each URL may fail at render time.
 * Work-level art and Google thumbnails are representative previews, not
 * proof that an image belongs to every ISBN in the group.
 */
export function groupCoverCandidates(group:SearchGroup):{url:string;label:string}[]{
 const urls=new Set<string>();
 const options:{url:string;label:string}[]=[];
 const add=(url:string|null|undefined,label:string)=>{
  if(!url||urls.has(url))return;
  urls.add(url);options.push({url,label});
 };
 // Open Library work art is the best fallback for a work-level search result.
 for(const item of group.items.filter(i=>i.source==='Open Library'))
  add(item.coverUrl,'Open Library work artwork');
 for(const item of group.items){
  if(item.source==='Google Books')add(item.coverUrl,'Open Library ISBN cover candidate');
 }
 for(const item of group.items)
  if(item.source==='Google Books')add(item.previewCoverUrl,'Google Books volume thumbnail');
 return options;
}
