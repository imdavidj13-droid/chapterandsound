import {useEffect,useState} from 'react';

type PublicBook={id:string;title:string;author:string|null;authorId?:string|null;coverUrl?:string|null;summary:string|null;year:number|null};
type PublicEdition={id:string;format:string;isbn13?:string|null;publisher?:string|null;coverUrl?:string|null};
type BookResponse={book:PublicBook;editions:PublicEdition[]};
type PersonResponse={person:{id:string;name:string};works:{id:string;title:string}[]};
type SearchBook={id:string;title:string;author?:string|null};
type SearchPerson={id:string;name:string};
type AdminBook={work:{id:string;title:string;status:string;synopsis:string};credits:{personId:string;name:string;role:string}[]};
type SavedMetadata={editions:{id:string;format:string}[];identifiers:{editionId:string;code:string;value:string}[];events:{editionId:string;type:string;publisher:string|null;date:string|null}[];covers:{entityId:string;assetId:string}[]};
type Check={name:string;status:'passed'|'failed'|'warning';detail:string;href?:string};

async function getJson<T>(url:string):Promise<T>{
 const res=await fetch(url,{credentials:'same-origin',cache:'no-store'});
 if(!res.ok)throw Error('HTTP '+res.status+' from '+url);
 return await res.json() as T;
}

/** Runs public endpoint checks against the deployed service, never writes to D1. */
export function CataloguePublicationAudit({workId,status}:{workId:string;status:string}){
 const [checks,setChecks]=useState<Check[]>([]);
 const [busy,setBusy]=useState(false);
 const [checkedAt,setCheckedAt]=useState('');
 async function audit(){
  setBusy(true);setChecks([]);setCheckedAt('');
  const results:Check[]=[];
  const add=(name:Check['name'],status:Check['status'],detail:string,href?:string)=>results.push({name,status,detail,href});
  let book:BookResponse|null=null;
  let saved:AdminBook|null=null;
  let metadata:SavedMetadata|null=null;
  try{
   try{
    const [admin,meta]=await Promise.all([
     getJson<AdminBook>('/api/catalogue-admin/works/'+encodeURIComponent(workId)),
     getJson<SavedMetadata>('/api/catalogue-admin/works/'+encodeURIComponent(workId)+'/metadata')
    ]);
    saved=admin;metadata=meta;
    add('Connected BOOK_DB record',admin.work.id===workId?'passed':'failed',
     'Status: '+admin.work.status+' · Title: '+admin.work.title+'.');
    add('Saved author relationship',admin.credits.some(c=>c.role==='author'||c.role==='coauthor')?'passed':'failed',
     admin.credits.filter(c=>c.role==='author'||c.role==='coauthor').map(c=>c.name).join(', ')||'No author credit saved.');
    add('Saved edition records',meta.editions.length>0?'passed':'failed',
     meta.editions.length+' edition(s) · '+meta.identifiers.filter(i=>i.code==='ISBN13').length+' ISBN-13 values · '+meta.events.length+' publication events.');
    add('Saved cover relationship',meta.covers.length>0?'passed':'warning',
     meta.covers.length+' primary cover link(s) found in BOOK_DB.');
   }catch(e){add('Connected BOOK_DB record','failed',e instanceof Error?e.message:'Admin database read unavailable');}
   if(status!=='published'&&status!=='verified'){
    add('Public visibility','warning','This book is not published. Public endpoints should not expose it.');
   }
   const url='/api/catalogue-public/book/'+encodeURIComponent(workId);
   try{
    book=await getJson<BookResponse>(url);
    if(book.book.id!==workId)throw Error('Public endpoint returned a different record.');
    add('Public book detail',status==='published'||status==='verified'?'passed':'failed',
     'The public catalogue returns this exact book ID.','/book/'+encodeURIComponent(workId));
   }catch(e){add('Public book detail',status==='published'||status==='verified'?'failed':'passed',
    e instanceof Error?e.message:'Not available to visitors');}
   if(book){
    if(book.editions.length) add('Edition relationships','passed',book.editions.length+' edition(s) linked to the published book.');
    else add('Edition relationships','failed','No editions returned by the public book API.');
    if(book.book.summary) add('Public description','passed','The saved synopsis is available publicly.');
    else add('Public description','warning','The public book has no description.');
    if(saved){
     add('Saved vs public title',saved.work.title===book.book.title?'passed':'failed',
      saved.work.title===book.book.title?'Public title matches the saved database value.':'Public title differs from BOOK_DB.');
     add('Saved vs public synopsis',saved.work.synopsis===(book.book.summary||'')?'passed':'failed',
      saved.work.synopsis===(book.book.summary||'')?'Saved and public descriptions agree.':'Saved description differs from the public book response.');
     const savedAuthor=saved.credits.find(c=>c.role==='author'||c.role==='coauthor');
     add('Saved vs public author',savedAuthor?.personId===book.book.authorId?'passed':'failed',
      savedAuthor?.personId===book.book.authorId?'The same canonical author ID is used.':'The saved author and public book author IDs differ.');
    }
    if(metadata){
     const savedEditionIds=new Set(metadata.editions.map(e=>e.id));
     const publicEditionIds=new Set(book.editions.map(e=>e.id));
     add('Saved vs public editions',[...savedEditionIds].every(id=>publicEditionIds.has(id))?'passed':'failed',
      [...savedEditionIds].every(id=>publicEditionIds.has(id))?'All saved editions appear in the public response.':'At least one saved edition is missing publicly.');
     const isbnMismatch=metadata.identifiers.filter(i=>i.code==='ISBN13').some(i=>{
      const edition=book!.editions.find(e=>e.id===i.editionId);
      return !edition||edition.isbn13?.replace(/[ -]/g,'')!==i.value.replace(/[ -]/g,'');
     });
     add('Saved vs public ISBNs',isbnMismatch?'failed':'passed',
      isbnMismatch?'An edition ISBN differs from the saved identifier.':'All stored ISBN-13 values agree with the public editions.');
    }
    const searchUrl='/api/books?'+new URLSearchParams({q:book.book.title,limit:'60'});
    try{
     const list=await getJson<{items:SearchBook[]}>(searchUrl);
     add('Public book discovery',list.items.some(x=>x.id===workId)?'passed':'failed',
      list.items.some(x=>x.id===workId)?'Book appears in visitor search results.':'Published book is missing from the visitor book listing.','/books');
     const normalise=(v:string)=>v.trim().normalize('NFKC').toLocaleLowerCase('en-GB').replace(/\s+/g,' ');
     const duplicates=list.items.filter(x=>x.id!==workId&&normalise(x.title)===normalise(book!.book.title)
      &&normalise(x.author||'')===normalise(book!.book.author||''));
     if(duplicates.length)add('Possible public duplicate','warning',duplicates.length+' other public record(s) share this title and author. Review their identities; no records were merged.','/books');
     else add('Possible public duplicate','passed','No second public record with the same title and author was returned by this search.');
    }catch(e){add('Public book discovery','failed',e instanceof Error?e.message:'Search unavailable');}
    if(book.book.authorId){
     const personUrl='/api/person/'+encodeURIComponent(book.book.authorId);
     try{
      const profile=await getJson<PersonResponse>(personUrl);
      const matches=profile.person.id===book.book.authorId&&profile.works.some(w=>w.id===workId);
      add('Author profile & bibliography',matches?'passed':'failed',
       matches?'The author profile links back to this book.':'The author profile does not list this book.',
       '/person/'+encodeURIComponent(book.book.authorId));
     }catch(e){add('Author profile & bibliography','failed',e instanceof Error?e.message:'Author profile unavailable');}
     try{
      const people=await getJson<{items:SearchPerson[]}>('/api/people?'+new URLSearchParams({role:'author',q:book.book.author||'',limit:'100'}));
      const count=people.items.filter(p=>p.id===book.book.authorId).length;
      add('Public author directory',count===1?'passed':'failed',
       count===1?'Author appears once under the canonical contributor ID.':'Canonical author missing or repeated in the directory.','/authors');
     }catch(e){add('Public author directory','failed',e instanceof Error?e.message:'Author directory unavailable');}
    }else add('Author identity','failed','Book has no canonical author ID.');
    if(book.book.coverUrl){
     try{
      const cover=await fetch(book.book.coverUrl,{method:'HEAD',cache:'no-store'});
      add('Cover from Cloudflare R2',cover.ok?'passed':'failed',
       cover.ok?'Cover responds to a public image request.':'Cover URL returned HTTP '+cover.status+'.');
     }catch(e){add('Cover from Cloudflare R2','failed',e instanceof Error?e.message:'Cover cannot be retrieved');}
    }else add('Cover from Cloudflare R2','warning','There is no primary book or edition cover in the public response.');
    const idCounts=book.editions.filter(e=>!!e.isbn13).length;
    add('Edition metadata','passed',book.editions.length+' edition(s), '+idCounts+' with an ISBN-13, '+book.editions.filter(e=>!!e.publisher).length+' with a publisher.');
   }
  }finally{setChecks(results);setCheckedAt(new Date().toISOString());setBusy(false)}
 }
 // Recheck automatically when a record becomes published; keep a manual retry
 // because public caches and Cloudflare deployments may lag briefly.
 useEffect(()=>{if(status==='published'||status==='verified')void audit()},[workId,status]);
 const failed=checks.filter(c=>c.status==='failed').length,warning=checks.filter(c=>c.status==='warning').length;
 return <section className="cs-publication-audit" aria-label="Published book audit">
  <header><div><h3>Publication checks</h3><p>Verify this saved book against the real public website, author directory and cover endpoint. Read-only; no records are changed.</p></div>
   <button type="button" disabled={busy} onClick={()=>void audit()}>{busy?'Checking public site…':'Run public-site audit'}</button></header>
  {checkedAt&&<p role="status"><strong>{failed===0?'No failures found':'Issues found: '+failed}</strong>{warning?' · '+warning+' warning(s)':''} · Checked {new Date(checkedAt).toLocaleString()}</p>}
  {checks.length>0&&<div className="cs-publication-audit-list">{checks.map(check=><div key={check.name} className={'cs-publication-audit-item is-'+check.status}>
   <div><strong>{check.status==='passed'?'✓ ':check.status==='failed'?'✕ ':'! '}{check.name}</strong><p>{check.detail}</p></div>
   {check.href&&<a href={check.href}>View page</a>}
  </div>)}</div>}
  {checkedAt&&<small>These are HTTP/API and media checks, not a substitute for a visual browser test or a complete cross-database review/ratings audit.</small>}
 </section>;
}
