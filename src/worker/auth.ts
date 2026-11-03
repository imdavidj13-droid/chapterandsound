import {betterAuth} from 'better-auth';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  PUBLIC_ORIGIN: string;
  MAIL_API_KEY: string;
  MAIL_FROM: string;
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
    secret:env.BETTER_AUTH_SECRET,
    emailAndPassword:{
      enabled:true,
      requireEmailVerification:true,
      sendResetPassword:async ({user,url})=>sendMail(env,user.email,'Reset your Chapter & Sound password',url),
    },
    emailVerification:{
      sendOnSignUp:true,
      sendOnSignIn:true,
      sendVerificationEmail:async ({user,url})=>sendMail(env,user.email,'Verify your Chapter & Sound email',url),
    },
    advanced:{cookiePrefix:'chapterandsound'},
  });
}
