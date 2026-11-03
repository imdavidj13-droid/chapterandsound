import {betterAuth} from 'better-auth';
import {username} from 'better-auth/plugins';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  PUBLIC_ORIGIN: string;
  MAIL_API_KEY: string;
  MAIL_FROM: string;
}
/**
 * Email links must open the known-working SPA root. A URL fragment is never
 * transmitted to Cloudflare's asset router, and React passes the token via an
 * ordinary API fetch instead of navigating to an /api/ URL.
 */
export function verificationLandingURL(origin:string,authURL:string):string{
  const token=new URL(authURL).searchParams.get('token');
  if(!token)throw new Error('Verification token missing from Better Auth URL');
  const root=origin.endsWith('/')?origin:origin+'/';
  return root+'#verify-email='+encodeURIComponent(token);
}
async function sendMail(env:AuthEnv,to:string,subject:string,url:string) {
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.MAIL_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:env.MAIL_FROM,to:[to],subject,
      text:'Chapter & Sound\n\nUse this secure link to continue:\n'+url+'\n\nIf you did not request this, ignore this email.'
    })
  });
  if(!response.ok)throw new Error('Email provider rejected request');
}
/** Fail closed: no signups and no fake email success without all required config. */
export function authConfigured(env:Partial<AuthEnv>):env is AuthEnv {
  return Boolean(env.DB&&env.BETTER_AUTH_SECRET&&env.BETTER_AUTH_SECRET.length>=32&&
    env.PUBLIC_ORIGIN&&env.MAIL_API_KEY&&env.MAIL_FROM);
}
export function createAuth(env:AuthEnv){
  return betterAuth({
    database:env.DB,
    baseURL:env.PUBLIC_ORIGIN,
    trustedOrigins:[env.PUBLIC_ORIGIN],
    secret:env.BETTER_AUTH_SECRET,
    emailAndPassword:{
      enabled:true,
      requireEmailVerification:true,
      minPasswordLength:12,
      sendResetPassword:async ({user,url})=>sendMail(env,user.email,'Reset your Chapter & Sound password',url),
    },
    emailVerification:{
      sendOnSignUp:true,
      sendOnSignIn:true,
      autoSignInAfterVerification:true,
      sendVerificationEmail:async ({user,url})=>sendMail(env,user.email,'Verify your Chapter & Sound email',verificationLandingURL(env.PUBLIC_ORIGIN,url)),
    },
    plugins:[username({displayUsername:false,immutableUsername:true,minUsernameLength:3,maxUsernameLength:30,usernameValidator:(value)=>/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(value)&&!['admin','administrator','moderator','support','chapterandsound','chapter_and_sound','staff','system','official'].includes(value.toLowerCase())})],
    advanced:{cookiePrefix:'chapterandsound'},
  });
}
