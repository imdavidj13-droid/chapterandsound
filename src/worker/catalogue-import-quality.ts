/**
 * Catalogue metadata quality gate.
 *
 * A matched book is NOT an import-ready book. ISBNs identify editions, and a
 * work-level search result cannot supply publisher/format for each edition.
 *
 * Only identity and edition structure block draft readiness. Optional source gaps
 * remain explicit and lower the completeness score; no values are fabricated.
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
 editions?:EditionForReview[];editionCountReported?:number;
 // Older single-edition manifests. They must be enriched before import.
 isbn13?:string;isbn10?:string;format?:string;publisher?:string;language?:string;
};
export type ImportQuality={
 ready:boolean;score:number;
 missing:string[];blocking:string[];optionalMissing:string[];warnings:string[];
 editionCount:number;verifiedEditionCount:number;formatCoverage:string[];
};
const has=(s:unknown)=>typeof s==='string'&&s.trim().length>0;
export function assessImportQuality(input:WorkForReview):ImportQuality{
 const missing:string[]=[],blocking:string[]=[],optionalMissing:string[]=[],warnings:string[]=[];
 const required=(field:string)=>{blocking.push(field);missing.push(field)};
 const optional=(field:string)=>{optionalMissing.push(field);missing.push(field)};
 const editions=input.editions?.length?input.editions:[{
  sourceKey:undefined,format:input.format,isbn13:input.isbn13,isbn10:input.isbn10,
  publisher:input.publisher,publicationDate:input.publicationDate,language:input.language
 }];
 const actual=input.editions||[];
 if(!has(input.title))required('work.title');
 if(!has(input.author))required('work.author');
 if(!has(input.workSourceKey)&&!has(input.sourceKey))required('work.sourceIdentifier');
 if(!input.authorSourceKeys?.length)required('work.authorIdentifiers');
 if(!has(input.description))optional('work.description');
 if(!input.subjects?.length)optional('work.subjects');
 if(!has(input.originalLanguage))optional('work.originalLanguage');
 if(!has(input.firstPublicationDate)&&!has(input.publicationDate))optional('work.firstPublicationDate');
 if(!actual.length)required('work.editions (edition-level records required)');
 if(typeof input.editionCountReported==='number'&&input.editionCountReported>actual.length)
  required('work.editionCoverage ('+actual.length+'/'+input.editionCountReported+' loaded)');
 let verifiedEditionCount=0;
 const formats=new Set<string>();
 editions.forEach((edition,index)=>{
  const prefix='edition['+(index+1)+'].';
  if(!has(edition.sourceKey))required(prefix+'sourceIdentifier');
  if(!has(edition.format))required(prefix+'format');
  else formats.add(edition.format!.toLowerCase());
  if(!has(edition.isbn13)&&!has(edition.isbn10))optional(prefix+'ISBN');
  if(!has(edition.publisher))optional(prefix+'publisher');
  if(!has(edition.publicationDate))optional(prefix+'publicationDate');
  if(!has(edition.language))optional(prefix+'language');
  const isAudio=edition.format?.toLowerCase().includes('audio');
  if(isAudio){
   if(!edition.durationSeconds||edition.durationSeconds<=0)optional(prefix+'duration');
   if(!edition.narratorSourceKeys?.length)optional(prefix+'narratorIdentifiers');
  }
  if(has(edition.sourceKey)&&has(edition.format)&&(has(edition.isbn13)||has(edition.isbn10))
   &&has(edition.publisher)&&has(edition.publicationDate)&&has(edition.language)
   &&(!isAudio||(!!edition.durationSeconds&&edition.durationSeconds>0&&!!edition.narratorSourceKeys?.length)))
   verifiedEditionCount++;
 });
 if(actual.some(e=>!has(e.isbn13)&&!has(e.isbn10)))warnings.push('Some editions lack ISBNs; retain their source identifiers. Never invent or infer ISBNs.');
 if(!actual.length)warnings.push('Search results are work-level only; never treat them as a complete edition import.');
 if(!formats.has('audiobook'))warnings.push('No verified audiobook metadata supplied; absence does not prove no audiobook exists.');
 if(optionalMissing.length)warnings.push('Optional gaps remain visible for later automatic enrichment; they must not be silently filled or fabricated.');
 const uniqueMissing=[...new Set(missing)];
 const checked=Math.max(1,8+editions.length*6);
 const score=Math.max(0,Math.round(100*(1-Math.min(checked,uniqueMissing.length)/checked)));
 return {ready:blocking.length===0,score,missing:uniqueMissing,blocking,optionalMissing,warnings,
  editionCount:actual.length,verifiedEditionCount,formatCoverage:[...formats].sort()};
}
