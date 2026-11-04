import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Javascript pilot adapter has no types.
import {buildSruUrl,evaluateLocMarc,researchLoc,queueUnknown} from '../scripts/research-library-of-congress-isbns.mjs';
const isbn='9780593054703';
const candidate=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':'Book '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+i+'W',
 editions:[{sourceKey:'/books/OL'+i+'M',isbn13:i===0?isbn:null,format:'unknown'}]
}))});
const xml=(qualifier='paperback',identifier=isbn,author='Kernick, Simon',title='Relentless')=>
 '<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/">'+
 '<records><record><recordData><record xmlns="http://www.loc.gov/MARC21/slim">'+
 '<datafield tag="020" ind1=" " ind2=" "><subfield code="a">'+identifier+
 '</subfield><subfield code="q">('+qualifier+')</subfield></datafield>'+
 '<datafield tag="100" ind1="1" ind2=" "><subfield code="a">'+author+'</subfield></datafield>'+
 '<datafield tag="245" ind1="1" ind2="0"><subfield code="a">'+title+'</subfield></datafield>'+
 '</record></recordData></record></records></searchRetrieveResponse>';
const first=()=>candidate().candidates[0]!;
test('SRU URL uses official HTTPS endpoint, ISBN index, and MARCXML',()=>{
 const url=new URL(buildSruUrl(isbn));
 assert.equal(url.protocol,'https:');
 assert.equal(url.hostname,'lx2.loc.gov');
 assert.equal(url.searchParams.get('query'),'bath.isbn='+isbn);
 assert.equal(url.searchParams.get('recordSchema'),'marcxml');
});
test('explicit binding qualifier assigns exact paperback or hardcover',()=>{
 const book=first(),ed=book.editions[0];
 assert.deepEqual(evaluateLocMarc(xml(),book,ed).status,'explicit_format');
 assert.equal(evaluateLocMarc(xml(),book,ed).format,'paperback');
 assert.equal(evaluateLocMarc(xml('hardcover'),book,ed).format,'hardback');
});
test('ISBN, title and author mismatches do not supply formats',()=>{
 const book=first(),ed=book.editions[0];
 assert.equal(evaluateLocMarc(xml('paperback','9780593054710'),book,ed).status,'isbn_mismatch');
 assert.equal(evaluateLocMarc(xml('paperback',isbn,'Other Person'),book,ed).status,'author_mismatch');
 assert.equal(evaluateLocMarc(xml('paperback',isbn,'Kernick, Simon','Another Book'),book,ed).status,'title_mismatch');
});
test('record without binding qualifier remains unknown',()=>{
 const book=first(),ed=book.editions[0];
 assert.equal(evaluateLocMarc(xml(''),book,ed).status,'no_explicit_format');
});
test('conflicting ISBN-specific binding qualifiers do not invent a format',()=>{
 const book=first(),ed=book.editions[0];
 const doc=xml('paperback').replace('</datafield>',
  '<subfield code="q">(hardcover)</subfield></datafield>');
 assert.equal(evaluateLocMarc(doc,book,ed).status,'no_explicit_format');
});
test('research is review only, never modifies source or database',async()=>{
 const input=candidate();
 const report=await researchLoc(input,async()=>xml(),{max:1});
 assert.equal(report.totals.explicitFormatProposals,1);
 assert.equal(report.findings[0].format,'paperback');
 assert.equal(input.candidates[0]!.editions[0]!.format,'unknown');
 assert.equal(report.importEligible,false);
});
test('request failure is distinct from missing record',async()=>{
 const report=await researchLoc(candidate(),async()=>{throw Error('HTTP 503')},{max:1});
 assert.equal(report.statusCounts.error,1);
 assert.equal(report.statusCounts.no_result,0);
});
