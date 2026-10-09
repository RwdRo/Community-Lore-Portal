import { Router, type Request, type Response } from 'express';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { IdentityProof } from '@wharfkit/signing-request';
import { readApplication, updateApplication } from './applicationStore';

const derive = promisify(scrypt);
// Server-only deployment policy. Empty value disables automatic wallet administration.
export function administratorWallets(): Set<string> {
  return new Set((process.env.ADMIN_WAX_ACCOUNTS ?? '4ulb.wam').split(',').map(s => s.trim()).filter(s => /^[a-z1-5.]{1,12}$/.test(s)));
}
function effectiveUser(user: any) {
  if (!user) return null;
  const grant = user.walletAdminGrant;
  if (grant && (grant.actor !== user.waxAccount || !administratorWallets().has(grant.actor)))
    return {...user, role: grant.previousRole || 'reader'};
  return user;
}
export const WAX_CHAIN = '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01af5a41';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookie = (req: Request, key: string) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(key + '='))?.slice(key.length + 1) || '';
export function getAuthenticatedUser(req: Request) {
  const session = readApplication().sessions[hash(cookie(req, 'lw_session'))];
  if (!session || session.expires < Date.now()) return null;
  return effectiveUser(readApplication().documents.users[session.uid]);
}
export function verifyWalletIdentity(proofValue:string,scope:string,chainAccount:any) {
  const proof=IdentityProof.from(proofValue);
  if(String(proof.chainId)!==WAX_CHAIN || String(proof.scope)!==scope || proof.expiration.toMilliseconds()<Date.now()) return false;
  if(chainAccount.account_name && chainAccount.account_name!==String(proof.signer.actor)) return false;
  const permission=chainAccount.permissions?.find((p:any)=>p.perm_name===String(proof.signer.permission));
  return !!permission && proof.verify(permission.required_auth);
}
export function isScribe(req: Request) { return getAuthenticatedUser(req)?.role === 'scribe'; }
function setCookie(req: Request, res: Response, name: string, value: string, maxAge: number) {
  res.cookie(name, value, { httpOnly: true, sameSite: 'strict', secure: req.secure || process.env.APP_URL?.startsWith('https://'), path: '/', maxAge });
}
export function issueSession(req: Request, res: Response, uid: string) {
  const token = randomBytes(32).toString('hex');
  updateApplication(s => {
    for (const [id, session] of Object.entries(s.sessions)) if (session.expires < Date.now()) delete s.sessions[id];
    delete s.sessions[hash(cookie(req, 'lw_session'))];
    s.sessions[hash(token)] = { uid, expires: Date.now() + 7 * 86400000 };
  });
  setCookie(req, res, 'lw_session', token, 7 * 86400000);
  res.json({ user: effectiveUser(readApplication().documents.users[uid]) });
}
const attempts = new Map<string, { count: number; until: number }>();
export function authRouter() {
  const router = Router();
  router.use((req, res, next) => {
    if (req.method !== 'GET') {
      const key = req.ip || 'unknown', now = Date.now();
      for (const [k,v] of attempts) if(v.until < now) attempts.delete(k);
      const entry = attempts.get(key) || {count:0,until:now+60000};
      if (++entry.count > 20 || attempts.size > 10000) { res.status(429).json({error:'Too many attempts. Please wait a minute.'}); return; }
      attempts.set(key,entry);
    }
    next();
  });
  router.get('/session', (req,res) => res.json({user:getAuthenticatedUser(req)}));
  router.post('/register', async (req,res,next) => {
    try {
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username) || password.length < 12 || password.length > 200)
        return res.status(400).json({error:'Use a 3–32 character username and a password of 12–200 characters.'});
      const salt = randomBytes(16).toString('hex');
      const key = Buffer.from(await derive(password,salt,64) as Buffer).toString('hex');
      const uid = randomUUID();
      updateApplication(s => {
        if (Object.values(s.accounts).some(a => a.username === username)) throw Object.assign(new Error('Username is unavailable.'), {status:409});
        s.accounts[uid] = {username,salt,key};
        s.documents.users[uid] = {uid,displayName:username,role:'reader',bookmarks:[],following:[]};
      });
      issueSession(req,res,uid);
    } catch(e) { next(e); }
  });
  router.post('/login', async (req,res,next) => {
    try {
      const username=String(req.body.username || '').trim().toLowerCase(), password=String(req.body.password || '');
      if(password.length>200) return res.status(400).json({error:'Invalid credentials.'});
      const entry=Object.entries(readApplication().accounts).find(([,a])=>a.username===username);
      const account=entry?.[1];
      const key=Buffer.from(await derive(password,account?.salt || 'invalid-account-salt',64) as Buffer);
      if(!account || !timingSafeEqual(key,Buffer.from(account.key,'hex'))) return res.status(401).json({error:'Username or password is incorrect.'});
      if(readApplication().accounts[entry![0]]?.key!==account.key) return res.status(409).json({error:'Credentials changed. Sign in again.'});
      issueSession(req,res,entry![0]);
    } catch(e) {next(e);}
  });
  router.post('/credentials',async(req,res,next)=>{
    try {
      const user=getAuthenticatedUser(req);if(!user)return res.status(401).json({error:'Sign in to manage your credentials.'});
      const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||''),current=String(req.body.currentPassword||'');
      if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)||password.length<12||password.length>200||current.length>200)return res.status(400).json({error:'Use a valid username and a password of 12–200 characters.'});
      const account=readApplication().accounts[user.uid];
      if(account){
        const key=Buffer.from(await derive(current,account.salt,64) as Buffer);
        if(!timingSafeEqual(key,Buffer.from(account.key,'hex')))return res.status(401).json({error:'Your current password is incorrect.'});
      }
      const salt=randomBytes(16).toString('hex'),key=Buffer.from(await derive(password,salt,64) as Buffer).toString('hex');
      updateApplication(s=>{
        if(JSON.stringify(s.accounts[user.uid])!==JSON.stringify(account))throw Object.assign(new Error('Credentials changed. Sign in again.'),{status:409});
        if(Object.entries(s.accounts).some(([id,a])=>id!==user.uid&&a.username===username))throw Object.assign(new Error('Username is unavailable.'),{status:409});
        s.accounts[user.uid]={username,salt,key};
        for(const [id,session]of Object.entries(s.sessions))if(session.uid===user.uid)delete s.sessions[id];
      });
      issueSession(req,res,user.uid);
    }catch(e){next(e);}
  });
  router.post('/logout',(req,res)=>{
    updateApplication(s=>{delete s.sessions[hash(cookie(req,'lw_session'))];});
    setCookie(req,res,'lw_session','',0);res.json({user:null});
  });
  const challenges=new Map<string,{scope:string,until:number,uid:string|null}>();
  router.post('/wallet/challenge',(req,res)=>{
    for(const [k,v] of challenges) if(v.until<Date.now()) challenges.delete(k);
    if(challenges.size>1000) return res.status(503).json({error:'Please retry shortly.'});
    const ticket=randomBytes(32).toString('hex');
    const alphabet='abcdefghijklmnopqrstuvwxyz12345';
    const scope=Array.from(randomBytes(12),b=>alphabet[b%alphabet.length]).join('');
    challenges.set(hash(ticket),{scope,until:Date.now()+300000,uid:getAuthenticatedUser(req)?.uid || null});
    setCookie(req,res,'lw_challenge',ticket,300000);
    res.json({scope,chainId:WAX_CHAIN});
  });
  router.post('/wallet/verify',async(req,res,next)=>{
    try {
      const ticket=hash(cookie(req,'lw_challenge'));
      const challenge=challenges.get(ticket);
      challenges.delete(ticket);
      if(!challenge || challenge.until<Date.now()) return res.status(401).json({error:'Wallet challenge expired. Connect again.'});
      if(typeof req.body.proof!=='string' || req.body.proof.length>4000) return res.status(400).json({error:'Wallet did not return a verifiable identity proof.'});
      const proof=IdentityProof.from(req.body.proof);
      if(String(proof.chainId)!==WAX_CHAIN || String(proof.scope)!==challenge.scope || proof.expiration.toMilliseconds()<Date.now())
        return res.status(401).json({error:'Wallet proof does not match this login request.'});
      const actor=String(proof.signer.actor);
      let chainAccount:any=null;
      for(const rpc of ['https://wax.greymass.com','https://wax.eosusa.io']) {
        try {const r=await fetch(rpc+'/v1/chain/get_account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_name:actor}),signal:AbortSignal.timeout(6000)});if(r.ok){chainAccount=await r.json();break;}} catch {}
      }
      if(!chainAccount) return res.status(503).json({error:'WAX verification is temporarily unavailable. Your account has not been changed.'});
      const permission=chainAccount.permissions?.find((p:any)=>p.perm_name===String(proof.signer.permission));
      if(!permission || !verifyWalletIdentity(req.body.proof,challenge.scope,chainAccount)) return res.status(401).json({error:'Wallet signature is not authorized by this WAX account.'});
      const current=getAuthenticatedUser(req)?.uid || null;
      if(current!==challenge.uid) return res.status(409).json({error:'Account changed during wallet login. Try again.'});
      const existing=Object.values(readApplication().documents.users).find((u:any)=>u.waxAccount===actor) as any;
      if(current && existing && existing.uid!==current) return res.status(409).json({error:'This wallet is already linked to another Loreworks account.'});
      const uid=current || existing?.uid || randomUUID();
      updateApplication(s=>{
        s.documents.users[uid] ||= {uid,displayName:actor,role:'reader',bookmarks:[],following:[]};
        const user = s.documents.users[uid];
        const previousWallet = user.waxAccount;
        if (user.walletAdminGrant && (user.walletAdminGrant.actor !== actor || !administratorWallets().has(actor))) {
          user.role = user.walletAdminGrant.previousRole || 'reader';
          delete user.walletAdminGrant;
        }
        user.waxAccount=actor;
        // This branch is reached only after chain permission and signature verification.
        // A pre-existing manually assigned Scribe role is independent of wallet policy.
        if (administratorWallets().has(actor) && user.role !== 'scribe') {
          user.walletAdminGrant = {actor, previousRole: user.role || 'reader'};
          user.role = 'scribe';
        }
        user._version = (user._version || 0) + 1;
        if (previousWallet !== actor) {
          for (const [id, session] of Object.entries(s.sessions)) if (session.uid === uid) delete s.sessions[id];
        }
      });
      issueSession(req,res,uid);
    }catch(e){next(e);}
  });
  return router;
}
