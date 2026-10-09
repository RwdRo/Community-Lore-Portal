import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {PrivateKey} from '@wharfkit/antelope';
import {IdentityProof} from '@wharfkit/signing-request';
process.env.APP_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'loreworks-owner-'));
const {authRouter,WAX_CHAIN,administratorWallets}=await import('../server/authentication');
const {readApplication,updateApplication}=await import('../server/applicationStore');
const {sameOriginWrites,apiErrors}=await import('../server/requestSecurity');
test('designated owner requires a real signed challenge, replay fails, wallet replacement removes only wallet-derived administration',async()=>{
 const key=PrivateKey.generate('K1'),wrong=PrivateKey.generate('K1');
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=async(input:any,init:any)=>{
  if(String(input).endsWith('/v1/chain/get_account')){
   const {account_name}=JSON.parse(init.body);
   return new Response(JSON.stringify({account_name,permissions:[{perm_name:'active',required_auth:{threshold:1,keys:[{key:String(key.toPublic()),weight:1}],accounts:[],waits:[]}}]}),{status:200});
  }
  return nativeFetch(input,init);
 };
 const app=express();app.use(express.json());app.use(sameOriginWrites);app.use(authRouter());app.use(apiErrors);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+(server.address() as any).port;
 const jar=new Map<string,string>();
 async function req(route:string,body?:any){
  const res=await fetch(url+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Loreworks':'1',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},...(body===undefined?{}:{body:JSON.stringify(body)})});
  for(const c of res.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar.set(k,v);}
  return {status:res.status,body:await res.json()};
 }
 async function proofFor(actor:string,signer=key){
  const challenge=await req('/wallet/challenge',{});assert.equal(challenge.status,200);
  const proof=IdentityProof.from({chainId:WAX_CHAIN,scope:challenge.body.scope,expiration:new Date(Date.now()+60000),signer:{actor,permission:'active'},signature:signer.signDigest('00'.repeat(32))});
  proof.signature=signer.signDigest(proof.transaction.signingDigest(WAX_CHAIN));return String(proof);
 }
 try{
  assert.ok(administratorWallets().has('4ulb.wam'));
  let result=await req('/register',{username:'4ulb.wam',password:'owner-test-password'});
  assert.equal(result.body.user.role,'reader');
  assert.equal((await req('/wallet/verify',{proof:await proofFor('4ulb.wam',wrong)})).status,401);
  assert.equal((await req('/session')).body.user.role,'reader');
  const signed=await proofFor('4ulb.wam');result=await req('/wallet/verify',{proof:signed});
  assert.equal(result.status,200);assert.equal(result.body.user.role,'scribe');
  const uid=result.body.user.uid;assert.equal(result.body.user.walletAdminGrant.actor,'4ulb.wam');
  assert.equal((await req('/wallet/verify',{proof:signed})).status,401);
  process.env.ADMIN_WAX_ACCOUNTS='';assert.equal((await req('/session')).body.user.role,'reader');delete process.env.ADMIN_WAX_ACCOUNTS;
  result=await req('/wallet/verify',{proof:await proofFor('otherwallet')});
  assert.equal(result.body.user.role,'reader');assert.equal(readApplication().documents.users[uid].walletAdminGrant,undefined);
  updateApplication(s=>{s.documents.users[uid].role='scribe';});
  result=await req('/wallet/verify',{proof:await proofFor('thirdwallet')});
  assert.equal(result.body.user.role,'scribe');assert.equal(result.body.user.walletAdminGrant,undefined);
 }finally{globalThis.fetch=nativeFetch;delete process.env.ADMIN_WAX_ACCOUNTS;server.close();}
});
