import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {PrivateKey} from '@wharfkit/antelope';
import {IdentityProof} from '@wharfkit/signing-request';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'loreworks-test-'));
process.env.APP_DATA_DIR=directory;
const {authRouter,verifyWalletIdentity,WAX_CHAIN}=await import('../server/authentication');
const {applicationRouter}=await import('../server/applicationApi');
const {playerRouter,awardDiscovery}=await import('../server/player');
const {buildRegistry,getCanonRegistry,canonRegistryRouter}=await import('../server/canonRegistry');
const {readApplication,updateApplication}=await import('../server/applicationStore');
const {sameOriginWrites,apiErrors}=await import('../server/requestSecurity');

test('wallet identity binds signature, account, permission, chain, scope and expiration',()=>{
 const key=PrivateKey.generate('K1'),other=PrivateKey.generate('K1');
 const proof=IdentityProof.from({chainId:WAX_CHAIN,scope:'loreworks',expiration:new Date(Date.now()+60000),signer:{actor:'testaccount',permission:'active'},signature:key.signDigest('00'.repeat(32))});
 proof.signature=key.signDigest(proof.transaction.signingDigest(WAX_CHAIN));
 const account={account_name:'testaccount',permissions:[{perm_name:'active',required_auth:{threshold:1,keys:[{key:String(key.toPublic()),weight:1}],accounts:[],waits:[]}}]};
 assert.equal(verifyWalletIdentity(String(proof),'loreworks',account),true);
 assert.equal(verifyWalletIdentity(String(proof),'wrongscope',account),false);
 assert.equal(verifyWalletIdentity(String(proof),'loreworks',{...account,account_name:'someoneelse'}),false);
 assert.equal(verifyWalletIdentity(String(proof),'loreworks',{...account,permissions:[]}),false);
 account.permissions[0].required_auth.keys[0].key=String(other.toPublic());
 assert.equal(verifyWalletIdentity(String(proof),'loreworks',account),false);
 const expired=IdentityProof.from({...proof,expiration:new Date(Date.now()-60000)});
 assert.equal(verifyWalletIdentity(String(expired),'loreworks',account),false);
 const wrongChain=IdentityProof.from({...proof,chainId:'00'.repeat(32)});
 assert.equal(verifyWalletIdentity(String(wrongChain),'loreworks',account),false);
});
test('registry retains exact evidence beyond 5000 characters and scopes uncertain identities',()=>{
 const content='Captain Mira Voss met Captain Lena Hale. She spoke.\n\n'+'x '.repeat(3000)+'Trilium and Khaurians.';
 const registry=buildRegistry([{id:'fixture-a',title:'Test A',content,category:'General'},{id:'fixture-b',title:'Test B',content:'Captain Mira Voss replied.',category:'General'}]);
 const names=registry.entities.filter(e=>e.name==='Mira Voss');assert.equal(names.length,2);assert.notEqual(names[0].id,names[1].id);
 const trilium=registry.entities.find(e=>e.name==='Trilium');assert.ok(trilium);assert.ok(trilium.evidence[0].start>5000);
 for(const entity of registry.entities)for(const evidence of entity.evidence){const source=evidence.sourceId==='fixture-a'?content:'Captain Mira Voss replied.';assert.equal(source.slice(evidence.start,evidence.end),evidence.quote);}
 assert.ok(registry.entities.some(e=>e.references.some(r=>r.candidateIds.length===2&&r.status==='requires-review')));
 assert.ok(getCanonRegistry().sources.some(s=>s.title==='Echoes of Earth'));
 assert.ok(!getCanonRegistry().sources.some(s=>s.title==='UNITY TESTED'));
});
test('rewards are idempotent, source-backed, dwell-gated and mission bonuses awarded once',()=>{
 const r=getCanonRegistry(),story=r.sources[0].id,entity=r.entities.find(e=>e.state==='source-mention'&&e.scope!=='proposal')!.id;
 const player={xp:0,discoveries:{story:{},entity:{},planet:{}},pending:{[story]:1000},activity:[],awarded:{}};
 assert.throws(()=>awardDiscovery(player,'story',story,2000),/20 seconds/);
 awardDiscovery(player,'story',story,22000);awardDiscovery(player,'entity',entity,23000);assert.equal(player.xp,70);
 awardDiscovery(player,'story',story,24000);awardDiscovery(player,'entity',entity,24000);assert.equal(player.xp,70);
 assert.throws(()=>awardDiscovery(player,'entity','candidate:invented',24000),/source-backed/);
});
test('HTTP accounts, authorization, persistence and reward isolation',async()=>{
 const app=express();app.use(express.json());app.use('/api',sameOriginWrites);app.use('/api/auth',authRouter());app.use('/api/app',applicationRouter());app.use('/api/player',playerRouter());app.use('/api/canon',canonRegistryRouter());app.use(apiErrors);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+(server.address() as any).port;
 const jar:Record<string,string>={};
 async function req(route:string,body?:any,who='a',extra:Record<string,string>={}){
  const response=await fetch(origin+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Loreworks':'1',Cookie:jar[who]||'',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const cookies=response.headers.getSetCookie();if(cookies.length)jar[who]=cookies.map(c=>c.split(';')[0]).join('; ');
  return {status:response.status,body:await response.json(),cookies};
 }
 const batch=(collection:string,id:string,data:any)=>({operations:[{collection,id,mode:'set',data}]});
 try{
  assert.equal((await req('player')).status,401);
  assert.equal((await req('auth/register',{username:'blocked',password:'long-password-for-tests'},'a',{Origin:'https://attacker.invalid'})).status,403);
  const a=await req('auth/register',{username:'explorer-a',password:'long-password-for-tests',role:'scribe'});assert.equal(a.status,200);assert.equal(a.body.user.role,'reader');const uid=a.body.user.uid;
  assert.match(a.cookies[0],/HttpOnly/);assert.match(a.cookies[0],/SameSite=Strict/);
  const b=await req('auth/register',{username:'explorer-b',password:'another-password-for-tests'},'b');const uidB=b.body.user.uid;
  assert.equal((await req('app/batch',batch('users',uid,{role:'scribe'}))).status,403);
  assert.equal((await req('app/batch',batch('users',uid,{waxAccount:'fakewallet'}))).status,403);
  assert.equal((await req('app/batch',batch('users',uidB,{bio:'hijacked'}))).status,403);
  assert.equal((await req('app/batch',batch('users',uid,{bookmarks:['canon_1']}))).status,200);
  assert.equal((await req('app/documents/users/'+uid,undefined,'b')).body.document.data.bookmarks,undefined);
  const source={title:'Test narrative',content:'Trilium glows.',category:'General',type:'canon',authorId:uidB,voteCount:999,onChain:true};
  assert.equal((await req('app/batch',batch('lore','canon_999',source))).status,400);
  assert.equal((await req('app/batch',batch('lore','submission-test',source))).status,200);
  const submitted=(await req('app/documents/lore/submission-test')).body.document.data;assert.equal(submitted.authorId,uid);assert.equal(submitted.type,'proposed');assert.equal(submitted.voteCount,0);assert.equal(submitted.onChain,undefined);
  await Promise.all([req('app/vote',{loreId:'submission-test',type:'up'}),req('app/vote',{loreId:'submission-test',type:'up'},'b')]);
  assert.equal((await req('app/documents/lore/submission-test')).body.document.data.voteCount,2);
  await req('app/vote',{loreId:'submission-test',type:'up'});assert.equal((await req('app/documents/lore/submission-test')).body.document.data.voteCount,1);
  await req('app/batch',batch('comments','comment-test',{text:'Pending test',loreEntryId:'canon_1',status:'approved',userId:uidB}));
  assert.equal((await req('app/documents/comments/comment-test',undefined,'b')).body.document,null);
  assert.equal((await req('player/character',{name:'Explorer A',emblem:'star',xp:99999})).body.player.xp,0);
  assert.equal((await req('player/character',{name:'Duplicate',emblem:'star'})).status,409);
  assert.equal((await req('player',undefined,'b')).body.player,null);
  const entity=getCanonRegistry().entities.find(e=>e.state==='source-mention'&&e.scope!=='proposal')!.id;
  await req('player/discover',{kind:'entity',target:entity});await req('player/discover',{kind:'entity',target:entity});assert.equal((await req('player')).body.player.xp,10);
  assert.equal((await req('player/discover',{kind:'story',target:getCanonRegistry().sources[0].id})).status,409);
  assert.equal((await req('canon/registry/'+encodeURIComponent(entity)+'/review',{status:'accepted',note:'No authorization'})).status,403);
  assert.equal((await req('auth/wallet/verify',{proof:'fake'})).status,401);
  const stored=JSON.parse(fs.readFileSync(path.join(directory,'application.json'),'utf8'));assert.equal(stored.players[uid].xp,10);assert.ok(stored.accounts[uid].key);assert.equal(stored.accounts[uid].password,undefined);
  const before=JSON.stringify(readApplication());assert.throws(()=>updateApplication(s=>{s.players[uid].xp=999;throw Error('rollback');}));assert.equal(JSON.stringify(readApplication()),before);
  await req('auth/logout',{});assert.equal((await req('auth/session')).body.user,null);
  assert.equal((await req('auth/login',{username:'explorer-a',password:'wrong'})).status,401);
  assert.equal((await req('auth/login',{username:'explorer-a',password:'long-password-for-tests'})).status,200);assert.equal((await req('player')).body.player.xp,10);
  assert.equal((await req('auth/credentials',{username:'explorer-a',currentPassword:'wrong',password:'updated-long-password'})).status,401);
  const oldSession=jar.a;
  assert.equal((await req('auth/credentials',{username:'explorer-a',currentPassword:'long-password-for-tests',password:'updated-long-password'})).status,200);
  jar.old=oldSession;assert.equal((await req('auth/session',undefined,'old')).body.user,null);
  await req('auth/logout',{});
  assert.equal((await req('auth/login',{username:'explorer-a',password:'long-password-for-tests'})).status,401);
  assert.equal((await req('auth/login',{username:'explorer-a',password:'updated-long-password'})).status,200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});