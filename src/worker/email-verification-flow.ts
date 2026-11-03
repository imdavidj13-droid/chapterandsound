/**
 * Browser-safe email verification.
 *
 * Better Auth processes the token and sets its real session cookie. Browser
 * navigations receive a 303 to a clean Worker-served result URL so the SPA
 * fallback cannot turn successful verification into a 404.
 *
 * JSON/API clients bypass this and use Better Auth normally.
 */
export function isVerificationDocumentNavigation(request:Request):boolean {
  return request.method==='GET' &&
    new URL(request.url).pathname==='/api/auth/verify-email' &&
    (request.headers.get('Accept')??'').includes('text/html');
}

export async function verifyEmailDocument(
  request:Request,
  handler:(request:Request)=>Promise<Response>
):Promise<Response>{
  const original=new URL(request.url);
  const token=original.searchParams.get('token');
  if(!token)return resultRedirect('invalid',new Headers());
  // Avoid callbackURL-based redirects and any external callback URL.
  const verifiedURL=new URL('/api/auth/verify-email',original.origin);
  verifiedURL.searchParams.set('token',token);
  const headers=new Headers(request.headers);
  headers.set('Accept','application/json');
  const internalRequest=new Request(verifiedURL.toString(),{
    method:'GET',headers,redirect:'manual'
  });
  try{
    const authResponse=await handler(internalRequest);
    const payload:unknown=await authResponse.clone().json().catch(()=>null);
    const success=authResponse.ok&&payload!==null&&typeof payload==='object'&&
      'status' in payload&&(payload as {status?:unknown}).status===true;
    return resultRedirect(success?'verified':'invalid',authResponse.headers);
  }catch{
    return resultRedirect('invalid',new Headers());
  }
}

function resultRedirect(status:'verified'|'invalid',authHeaders:Headers):Response{
  const headers=new Headers();
  headers.set('Location','/api/auth/verification-result?status='+status);
  headers.set('Cache-Control','no-store');
  headers.set('Referrer-Policy','no-referrer');
  // Preserve all Better Auth Set-Cookie headers, including the session.
  const cookieHeaders=authHeaders.getSetCookie();
  for(const cookie of cookieHeaders)headers.append('Set-Cookie',cookie);
  return new Response(null,{status:303,headers});
}

export function verificationResultPage(request:Request):Response{
  const verified=new URL(request.url).searchParams.get('status')==='verified';
  const heading=verified?'Email verified.':'Verification link unavailable.';
  const detail=verified
    ?'Your Chapter & Sound email address has been confirmed. Continue to your reading world.'
    :'This link may be expired or invalid. Request a fresh verification email.';
  const target=verified?'/onboarding':'/verify';
  const action=verified?'Continue to your account':'Request another email';
  const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${heading} — Chapter & Sound</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}
body{background:#faf7f1;color:#342e2c;font-family:Georgia,serif;min-height:100vh;margin:0;display:grid;place-items:center;padding:24px}
main{width:min(100%,640px);border:1px solid #e0d7ce;background:#fffdfa;padding:clamp(26px,5vw,56px);text-align:center;border-radius:12px}
.brand{font-size:1.35rem;color:#742038;text-decoration:none}h1{font-size:clamp(2.1rem,5vw,3.4rem);font-weight:500;color:#742038;line-height:1.18}
p{font-family:system-ui,sans-serif;line-height:1.7;color:#615b57}
.symbol{width:76px;height:76px;margin:28px auto 0;background:#e6ecdd;border-radius:50%;display:grid;place-items:center;color:#742038;font-size:2rem}
.button{display:inline-block;margin:20px auto 5px;text-decoration:none;background:#742038;color:#fff;padding:14px 25px;border-radius:5px;font-family:system-ui,sans-serif}
.secondary{display:block;margin-top:18px;color:#742038;font-family:system-ui,sans-serif;font-size:.9rem}
</style></head><body><main><a class="brand" href="/">Chapter &amp; Sound</a>
<div class="symbol" aria-hidden="true">${verified?'✓':'✉'}</div>
<h1>${heading}</h1><p>${detail}</p>
<a class="button" href="${target}">${action}</a><a class="secondary" href="/signin">Sign in</a>
</main></body></html>`;
  return new Response(html,{status:200,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  }});
}
