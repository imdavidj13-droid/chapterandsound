/**
 * Catalogue metadata quality gate.
 *
 * A matched book is NOT an import-ready book. ISBNs identify editions, and a
 * work-level search result cannot supply publisher/format for each edition.
 *
 * Cover rights and cover upload are deliberately out of scope at this stage.
 */
export type EditionForReview={
 sourceKey?:string;format?:string;isbn13?:string;isbn10?:string;
 publisher?:string;publicationDate?:string;language?:string;
 pageCount?:number;durationSeconds?:number;narratorSourceKeys?:string[];
};
export type WorkForReview={
 title?:string;author?:string;authorSourceKeys?:string[];
 workSourceKey?:string;sourceKey?:string;
 description?:string;subjects?:string[];originalLanguage?:string;
 firstPublicationDate?:string;publicationDate?:string;
 editions?:EditionForReview[];
 // Older single-edition manifests. They must be enriched before import.
 isbn13?:string;isbn10?:string;format?:string;publisher?:string;language?:string;
};
export type ImportQuality={
 ready:boolean;score:number;
 missing:string[];warnings:string[];
 editionCount:number;verifiedEditionCount:number;formatCoverage:string[];
};
const has=(s:unknown)=>typeof s==='string'&&s.trim().length>0;
export function assessImportQuality(input:WorkForReview):ImportQuality{
 const missing:string[]=[],warnings:string[]=[];
 const editions=input.editions?.length?input.editions:[{
  sourceKey:undefined,format:input.format,isbn13:input.isbn13,isbn10:input.isbn10,
  publisher:input.publisher,publicationDate:input.publicationDate,language:input.language
 }];
 const actual=input.editions||[];
 if(!has(input.title))missing.push('work.title');
 if(!has(input.author))missing.push('work.author');
 if(!has(input.workSourceKey)&&!has(input.sourceKey))missing.push('work.sourceIdentifier');
 if(!input.authorSourceKeys?.length)missing.push('work.authorIdentifiers');
 if(!has(input.description))missing.push('work.description');
 if(!input.subjects?.length)missing.push('work.subjects');
 if(!has(input.originalLanguage))missing.push('work.originalLanguage');
 if(!has(input.firstPublicationDate)&&!has(input.publicationDate))missing.push('work.firstPublicationDate');
 if(!actual.length)missing.push('work.editions (edition-level records required)');
 let verifiedEditionCount=0;
 const formats=new Set<string>();
 editions.forEach((edition,index)=>{
  const prefix='edition['+(index+1)+'].';
  if(!has(edition.sourceKey))missing.push(prefix+'sourceIdentifier');
  if(!has(edition.format))missing.push(prefix+'format');
  else formats.add(edition.format!.toLowerCase());
  if(!has(edition.isbn13)&&!has(edition.isbn10))missing.push(prefix+'ISBN');
  if(!has(edition.publisher))missing.push(prefix+'publisher');
  if(!has(edition.publicationDate))missing.push(prefix+'publicationDate');
  if(!has(edition.language))missing.push(prefix+'language');
  const isAudio=edition.format?.toLowerCase().includes('audio');
  if(isAudio){
   if(!edition.durationSeconds||edition.durationSeconds<=0)missing.push(prefix+'duration');
   if(!edition.narratorSourceKeys?.length)missing.push(prefix+'narratorIdentifiers');
  }
  if(has(edition.sourceKey)&&has(edition.format)&&(has(edition.isbn13)||has(edition.isbn10))
   &&has(edition.publisher)&&has(edition.publicationDate)&&has(edition.language)
   &&(!isAudio||(!!edition.durationSeconds&&edition.durationSeconds>0&&!!edition.narratorSourceKeys?.length)))
   verifiedEditionCount++;
 });
 if(actual.some(e=>!has(e.isbn13)&&!has(e.isbn10)))warnings.push('Some editions lack ISBNs; keep their source IDs and flag for review.');
 if(!actual.length)warnings.push('Search results are work-level only; never treat them as a complete edition import.');
 if(!formats.has('audiobook'))warnings.push('No verified audiobook metadata supplied; absence does not prove no audiobook exists.');
 const uniqueMissing=[...new Set(missing)];
 const checked=Math.max(1,8+editions.length*6);
 const score=Math.max(0,Math.round(100*(1-Math.min(checked,uniqueMissing.length)/checked)));
 return {ready:uniqueMissing.length===0,score,missing:uniqueMissing,warnings,
  editionCount:actual.length,verifiedEditionCount,formatCoverage:[...formats].sort()};
}
