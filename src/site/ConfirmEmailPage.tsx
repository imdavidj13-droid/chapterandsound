import {useEffect,useRef,useState} from 'react';

/**
 * The user reaches this page from email with a token in the URL fragment.
 * We remove the token from the visible URL before calling Better Auth by fetch.
 * Also accepts legacy /api/auth/verify-email?token= links that the SPA intercepted.
 */
export function ConfirmEmailPage(){
 const started=useRef(false);
 const [status,setStatus]=useState<'verifying'|'success'|'failed'>('verifying');
 const [error,setError]=useState('');
 useEffect(()=>{
   if(started.current)return;
   started.current=true;
   const fragment=new URLSearchParams(window.location.hash.replace(/^#/,''));
   const token=fragment.get('token')||new URLSearchParams(window.location.search).get('token');
   window.history.replaceState({},'', '/confirm-email');
   if(!token){setStatus('failed');setError('The verification link is missing its token. Request another email.');return;}
   const check=async()=>{
     try{
       const url='/api/auth/verify-email?token='+encodeURIComponent(token);
       // A fetch, unlike a document navigation, reaches Cloudflare's Worker API.
       // Do not include the callbackURL: Better Auth returns JSON instead of redirecting.
       const response=await fetch(url,{method:'GET',credentials:'include',headers:{Accept:'application/json'},cache:'no-store',referrerPolicy:'no-referrer'});
       const data:unknown=await response.json();
       if(!response.ok){
         const problem=data&&typeof data==='object'?'message' in data?(data as {message?:unknown}).message:undefined:undefined;
         throw new Error(typeof problem==='string'?problem:'This link is expired or invalid. Request a new verification email.');
       }
       if(!data||typeof data!=='object'||!('status' in data)||(data as {status?:unknown}).status!==true){
         throw new Error('The verification service did not confirm your email. Please request a fresh link.');
       }
       setStatus('success');
       window.location.replace('/onboarding');
     }catch(e){setStatus('failed');setError(e instanceof Error?e.message:'Could not verify this email.');}
   };
   void check();
 },[]);
 return <div className="confirm-email">
   <div className="panel confirm-email-panel">
     <div className="confirm-email-icon" aria-hidden="true">{status==='success'?'✓':'✉'}</div>
     <p className="eyebrow">Chapter & Sound / Email verification</p>
     <h1>{status==='verifying'?'Verifying your email…':status==='success'?'Email verified.':'We couldn’t verify this link.'}</h1>
     {status==='verifying'&&<p role="status">Confirming your address securely. Your account will open once verification succeeds.</p>}
     {status==='success'&&<p role="status">Your address is confirmed. Opening your reading world…</p>}
     {status==='failed'&&<><p role="alert">{error}</p><div className="actions"><a href="/verify" className="button">Request a new verification email</a><a href="/signin" className="button secondary">Sign in</a></div></>}
   </div>
 </div>;
}
