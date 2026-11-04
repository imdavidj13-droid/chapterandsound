import {test} from 'node:test';
import {strict as assert} from 'node:assert';
// @ts-expect-error Companion script is plain JavaScript.
import {reconcileFormats} from '../scripts/reconcile-targeted-edition-formats.mjs';
const fixture=()=>({candidates:Array.from({length:10},(_,i)=>({
 title:i===0?'Relentless':i===1?'Severed':'Book '+i,author:'Simon Kernick',
 workSourceKey:'/works/OL'+i+'W',
 editions:[{sourceKey:'/books/OL'+i+'M',isbn13:i===0?'9781407095295':i===1?'9781407409658':null,
 format:'unknown',fieldProvenance:{}}]
}))});
const ebook={title:'Relentless',editionSourceKey:'/books/OL0M',isbn13:'9781407095295',format:'ebook',feature:null,
 source:'penguin_uk_product_page',sourceUrl:'https://www.penguin.co.uk/books/349671/relentless-by-kernick-simon/9781407095295'};
const large={title:'Severed',editionSourceKey:'/books/OL1M',isbn13:'9781407409658',format:null,feature:'large_print',
 source:'open_british_national_bibliography',sourceUrl:'https://obnb.uk/p14459217-severed'};
test('exact edition and ISBN are required for format fill',()=>{
 const original=fixture();const result=reconcileFormats(original,{records:[ebook]});
 assert.equal(result.report.totals.formatsResolved,1);
 assert.equal(result.report.totals.remainingUnknownFormats,9);
 assert.equal(result.candidates.candidates[0].editions[0].format,'ebook');
 assert.equal(original.candidates[0]!.editions[0]!.format,'unknown');
});
test('large print does not invent a paperback binding',()=>{
 const result=reconcileFormats(fixture(),{records:[large]});
 assert.equal(result.report.totals.formatsResolved,0);
 assert.equal(result.report.totals.largePrintTagged,1);
 assert.equal(result.report.totals.remainingUnknownFormats,10);
 assert.equal(result.candidates.candidates[1].editions[0].largePrint,true);
 assert.equal(result.candidates.candidates[1].editions[0].format,'unknown');
});
test('wrong edition key or ISBN never transfers evidence',()=>{
 const result=reconcileFormats(fixture(),{records:[{...ebook,editionSourceKey:'/books/OL2M'}]});
 assert.equal(result.report.totals.unmatched,1);
 assert.equal(result.report.totals.formatsResolved,0);
});
test('conflicting source format is reported, not overwritten',()=>{
 const input=fixture();input.candidates[0]!.editions[0]!.format='paperback';
 const result=reconcileFormats(input,{records:[ebook]});
 assert.equal(result.report.totals.conflicts,1);
 assert.equal(result.candidates.candidates[0].editions[0].format,'paperback');
});
