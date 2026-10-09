import {IdentityProof} from '@wharfkit/signing-request';

const WAX_CHAIN='1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01af5a41';
const ACTIVE='loreworks.pages.active.v1';
const PROFILE='loreworks.pages.profile.v1.';
export interface PagesProfile {
 uid:string; displayName:string; bio?:string; role:'reader'; waxAccount?:string;
 bookmarks:string[]; following:string[]; persistence:'browser-local';
 identityKind:'visitor'|'wallet'; walletVerifiedAt?:number;
}
const failure=(message:string,status=400)=>Object.assign(new Error(message),{status});
function readProfile(uid:string):PagesProfile|null {
 try{
  const value=JSON.parse(localStorage.getItem(PROFILE+uid)||'null');
  if(!value || value.uid!==uid || typeof value.displayName!=='string')return null;
  // Local data is user-editable and can never establish server or publishing authority.
  return {...value,role:'reader',persistence:'browser-local',bookmarks:Array.isArray(value.bookmarks)?value.bookmarks:[],following:Array.isArray(value.following)?value.following:[]};
 }catch{return null;}
}
export function getPagesIdentity():PagesProfile|null {
 const uid=localStorage.getItem(ACTIVE);return uid?readProfile(uid):null;
}
function save(profile:PagesProfile):PagesProfile {
 const value={...profile,role:'reader' as const,persistence:'browser-local' as const};
 localStorage.setItem(PROFILE+value.uid,JSON.stringify(value));localStorage.setItem(ACTIVE,value.uid);return value;
}
function name(value:unknown){return typeof value==='string'?value.trim().slice(0,60):'';}
export function createPagesVisitor(displayName?:string):PagesProfile {
 const current=getPagesIdentity();
 if(current)return displayName?updatePagesProfile({displayName}):current;
 return save({uid:'visitor-'+crypto.randomUUID(),displayName:name(displayName)||'Explorer',role:'reader',bookmarks:[],following:[],identityKind:'visitor',persistence:'browser-local'});
}
export function updatePagesProfile(patch:{displayName?:string;bio?:string;bookmarks?:string[];following?:string[]}):PagesProfile {
 const current=getPagesIdentity();if(!current)throw failure('Create a local explorer profile first.',401);
 const next={...current};
 if(patch.displayName!==undefined){next.displayName=name(patch.displayName);if(!next.displayName)throw failure('Display name is required.');}
 if(patch.bio!==undefined){if(typeof patch.bio!=='string')throw failure('Invalid biography.');next.bio=patch.bio.slice(0,2000);}
 for(const field of ['bookmarks','following'] as const)if(patch[field]!==undefined){const list=patch[field];if(!Array.isArray(list)||list.length>2000||list.some(x=>typeof x!=='string'||x.length>160))throw failure('Invalid profile list.');next[field]=[...new Set(list)];}
 return save(next);
}
let challenge:{scope:string;expires:number;uid:string|null}|null=null;
export function clearPagesIdentity(){localStorage.removeItem(ACTIVE);challenge=null;}
export async function pagesIdentity(path:string,body?:any):Promise<any> {
 const route=path.replace(/^\/?api\//,'').replace(/^\//,'');
 if(route==='auth/session')return {user:getPagesIdentity()};
 if(route==='auth/logout'){clearPagesIdentity();return {user:null};}
 if(route==='auth/visitor')return {user:createPagesVisitor(body?.displayName)};
 if(route==='auth/profile')return {user:updatePagesProfile(body||{})};
 if(route==='auth/wallet/challenge'){
  const alphabet='abcdefghijklmnopqrstuvwxyz12345';
  const scope=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>alphabet[b%alphabet.length]).join('');
  challenge={scope,expires:Date.now()+300000,uid:getPagesIdentity()?.uid||null};
  return {scope,chainId:WAX_CHAIN,persistence:'browser-local'};
 }
 if(route==='auth/wallet/verify'){
  const pending=challenge;challenge=null;
  if(!pending||pending.expires<Date.now())throw failure('Wallet challenge expired. Connect again.',401);
  if(typeof body?.proof!=='string'||body.proof.length>4000)throw failure('The wallet did not provide an identity proof.');
  let proof:IdentityProof;try{proof=IdentityProof.from(body.proof);}catch{throw failure('The wallet identity proof is invalid.',401);}
  if(String(proof.chainId)!==WAX_CHAIN||String(proof.scope)!==pending.scope||proof.expiration.toMilliseconds()<=Date.now())throw failure('Wallet proof does not match this request.',401);
  const actor=String(proof.signer.actor),permission=String(proof.signer.permission);
  let account:any=null;
  for(const rpc of ['https://wax.greymass.com','https://wax.eosusa.io']){
   try{const response=await fetch(rpc+'/v1/chain/get_account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_name:actor}),signal:AbortSignal.timeout(6000)});if(response.ok){account=await response.json();if(account?.account_name===actor)break;account=null;}}catch{}
  }
  if(!account)throw failure('WAX account verification is unavailable. Retry later; your local profile has not changed.',503);
  const authority=account.permissions?.find((p:any)=>p.perm_name===permission)?.required_auth;
  if(!authority||!proof.verify(authority))throw failure('Wallet signature is not authorized by this account.',401);
  if(pending.expires<Date.now()||proof.expiration.toMilliseconds()<=Date.now()||(getPagesIdentity()?.uid||null)!==pending.uid)throw failure('The active profile or challenge changed. Connect again.',409);
  // Bind a visitor profile locally, preserving its progress ID. This is not account linking on a server.
  const previous=getPagesIdentity();
  const uid=previous?.uid||'wallet-'+actor;
  const existing=previous||readProfile(uid);
  const user=save({...existing,uid,displayName:existing?.displayName||actor,bio:existing?.bio,bookmarks:existing?.bookmarks||[],following:existing?.following||[],role:'reader',waxAccount:actor,identityKind:'wallet',walletVerifiedAt:Date.now(),persistence:'browser-local'});
  return {user,notice:'Wallet ownership verified in this browser. Publishing requires separate GitHub repository permission.'};
 }
 if(['auth/login','auth/register','auth/credentials'].includes(route))throw failure('This GitHub Pages edition uses local explorer profiles or verified wallets. Password accounts require the server edition.',501);
 throw failure('Unknown Pages identity operation.',404);
}
