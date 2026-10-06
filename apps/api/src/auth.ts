import {randomBytes,scrypt,timingSafeEqual,createHmac} from 'node:crypto';
import {Router,json,type RequestHandler,type Response} from 'express';
import type {PrismaClient} from './generated/prisma/client.js';
import {z} from 'zod';
import {InputError,digest} from './domain.js';
import {audit,userSelect,type Actor} from './audit.js';

export const cookieName='reconciledesk_session';
const lifetime=8*60*60*1000;
const passwordOptions={N:32768,r:8,p:3,maxmem:64*1024*1024};
async function derive(password:string,salt:Buffer) {
  return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,passwordOptions,(e,key)=>e?reject(e):resolve(key)));
}
export async function hashPassword(password:string) {
  const salt=randomBytes(16);const key=await derive(password,salt);
  return `scrypt-32768-8-3$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function checkPassword(password:string,stored:string) {
  const [version,saltHex,keyHex]=stored.split('$');
  if(version!=='scrypt-32768-8-3'||!saltHex||!keyHex||!/^[0-9a-f]{32}$/.test(saltHex)||!/^[0-9a-f]{128}$/.test(keyHex))return false;
  const key=await derive(password,Buffer.from(saltHex,'hex'));return timingSafeEqual(key,Buffer.from(keyHex,'hex'));
}
const dummyHash=hashPassword(randomBytes(32).toString('hex'));
export function sessionToken(cookie:string|undefined) {
  const matches=(cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
  if(matches.length!==1)return null;
  const token=matches[0]!.slice(cookieName.length+1);return /^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
export function csrfFor(token:string) {return createHmac('sha256',token).update('reconciledesk-csrf-v1').digest('hex');}
export interface AuthUser {id:string;email:string;displayName:string;role:'VIEWER'|'OPERATOR'}
export interface AuthContext {user:AuthUser;token:string;csrfToken:string}
export interface Guards {read:RequestHandler;write:RequestHandler}
export function context(res:Response):AuthContext {return res.locals.auth as AuthContext;}
export function actorOf(res:Response):Actor {const user=context(res).user;return{id:user.id,label:user.displayName};}
export interface AuthOptions {origins:string[];secureCookie:boolean}
export function createAuth(db:PrismaClient,options:AuthOptions) {
  const cookieOptions={httpOnly:true,sameSite:'lax' as const,secure:options.secureCookie,path:'/'};
  const origin:RequestHandler=(req,_res,next)=> {
    const supplied=req.get('origin');
    if(req.get('sec-fetch-site')==='cross-site'||(supplied&&!options.origins.includes(supplied)))throw new InputError('Request origin is not allowed.',403);
    next();
  };
  const read:RequestHandler=async(req,res,next)=> {
    const token=sessionToken(req.get('cookie'));
    if(!token)throw new InputError('Sign in to continue.',401);
    const session=await db.session.findUnique({where:{tokenHash:digest(token)},include:{user:{select:{...userSelect,active:true}}}});
    if(!session||session.expiresAt.getTime()<=Date.now()||!session.user.active)throw new InputError('Session expired. Sign in again.',401);
    const {active,...user}=session.user;void active;
    res.locals.auth={user,token,csrfToken:csrfFor(token)} satisfies AuthContext;
    res.set('Cache-Control','no-store');next();
  };
  const csrf:RequestHandler=(req,res,next)=> {
    const actual=req.get('x-csrf-token')??'';const expected=context(res).csrfToken;
    if(!/^[0-9a-f]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new InputError('CSRF validation failed. Refresh and try again.',403);
    origin(req,res,next);
  };
  const write:RequestHandler=(req,res,next)=> {
    if(['GET','HEAD','OPTIONS'].includes(req.method)){next();return;}
    if(context(res).user.role!=='OPERATOR')throw new InputError('Operator access is required.',403);
    csrf(req,res,next);
  };
  async function throttle(email:string,ip:string) {
    await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7319382)`;
      const now=new Date();
      for(const [key,limit] of [[digest('email:'+email),10],[digest('ip:'+ip),60]] as const){
        const old=await tx.loginThrottle.findUnique({where:{key}});
        if(old&&old.resetsAt>now&&old.count>=limit)throw new InputError('Too many login attempts. Try again in 15 minutes.',429);
        await tx.loginThrottle.upsert({where:{key},create:{key,count:1,resetsAt:new Date(Date.now()+15*60*1000)},update:old&&old.resetsAt>now?{count:{increment:1}}:{count:1,resetsAt:new Date(Date.now()+15*60*1000)}});
      }
    });
  }
  const routes=Router();
  routes.post('/auth/login',origin,json({limit:'16kb'}),async(req,res)=> {
    if(!req.is('application/json')||req.get('x-reconciledesk-client')!=='web')throw new InputError('Use the application login form.',415);
    const parsed=z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).strict().safeParse(req.body);
    if(!parsed.success)throw new InputError('Enter a valid email and password.');
    const email=parsed.data.email.trim().toLowerCase();
    await throttle(email,req.ip??'unknown');
    const user=await db.user.findUnique({where:{email}});
    const valid=await checkPassword(parsed.data.password,user?.passwordHash??await dummyHash);
    if(!user||!user.active||!valid)throw new InputError('Invalid email or password.',401);
    const token=randomBytes(32).toString('base64url');const prior=sessionToken(req.get('cookie'));
    await db.$transaction(async tx=>{
      if(prior)await tx.session.deleteMany({where:{tokenHash:digest(prior)}});
      await tx.session.deleteMany({where:{expiresAt:{lt:new Date()}}});
      await tx.session.create({data:{tokenHash:digest(token),userId:user.id,expiresAt:new Date(Date.now()+lifetime)}});
      await audit(tx,{id:user.id,label:user.displayName},'LOGIN_SUCCEEDED','USER',user.id);
    });
    res.cookie(cookieName,token,{...cookieOptions,maxAge:lifetime});res.set('Cache-Control','no-store');
    res.json({user:{id:user.id,email:user.email,displayName:user.displayName,role:user.role},csrfToken:csrfFor(token)});
  });
  routes.get('/auth/session',read,(_req,res)=>{res.json({user:context(res).user,csrfToken:context(res).csrfToken});});
  routes.post('/auth/logout',read,csrf,async(_req,res)=>{
    const auth=context(res);
    await db.$transaction(async tx=>{await tx.session.deleteMany({where:{tokenHash:digest(auth.token)}});await audit(tx,actorOf(res),'LOGOUT','USER',auth.user.id);});
    res.clearCookie(cookieName,cookieOptions);res.status(204).end();
  });
  return {routes,guards:{read,write} satisfies Guards};
}
