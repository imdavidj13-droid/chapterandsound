/**
 * Provisional search display grouping only. Never persist these group keys or
 * use them for canonical identity decisions. Title/author agreement alone
 * is insufficient evidence to merge catalogue works.
 */
export type SearchEdition={
 key:string;title:string;author:string;isbn13:string|null;publisher:string|null;
 publishedDate:string|null;pages:number|null;coverUrl:string|null;language:string|null;source:string;
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
