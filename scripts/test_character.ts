import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import express from 'express';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import CharacterBuilder from '../src/components/CharacterBuilder';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'loreworks-character-'));
process.env.APP_DATA_DIR=directory;
const {characterFields,playerRouter}=await import('../server/player');
const {getCanonRegistry}=await import('../server/canonRegistry');
const {readApplication,updateApplication}=await import('../server/applicationStore');
const {apiErrors,sameOriginWrites}=await import('../server/requestSecurity');
const registry=getCanonRegistry();
const choice=(type:string)=>registry.entities.find(e=>e.state==='source-mention'&&(e as any).scope!=='proposal'&&e.type===type)!;
const values={name:'Field Explorer',species:choice('species').name,homeworld:choice('planets').name,affiliation:choice('factions').name,specialty:'researcher',pronouns:'they/them',backstory:'A personal journey through the archive.',color:'cyan',emblem:'archive'};

test('character setting choices use canonical documented entities and distinguish proposal setting choices and reject invented membership',()=>{
 assert.deepEqual(characterFields({...values,xp:999999,role:'scribe'}),values);
 for(const key of ['species','homeworld','affiliation'])assert.throws(()=>characterFields({...values,[key]:'Invented '+key}),/documented/);
 assert.throws(()=>characterFields({...values,affiliation:{name:values.affiliation}}),/Invalid character/);
 const proposal=registry.entities.find(e=>(e as any).scope==='proposal'&&e.type==='species'&&!registry.entities.some(c=>(c as any).scope!=='proposal'&&c.type==='species'&&c.name===e.name));
 if(proposal)assert.equal(characterFields({...values,species:proposal.name}).species,proposal.name);
 assert.equal(characterFields({name:'Open identity'}).affiliation,'');
});

test('creation displays all origin sections immediately with real choices and game purpose',()=>{
 const catalog={entities:[...['species','planets','factions'].map(type=>({...choice(type),summary:'Exact source excerpt for '+type,sourceIds:['source-one']})),{id:'proposal-only',name:'Proposal-only Species',type:'species',scope:'proposal',state:'source-mention'}],sources:[]};
 const html=renderToStaticMarkup(createElement(CharacterBuilder,{registry:catalog,busy:false,onSave:()=>{}}));
 for(const label of ['Species and origins','Species','Homeworld','Organization affinity',values.species,values.homeworld,values.affiliation,'Your first expedition','Choose a source-backed investigation'])assert.ok(html.includes(label),label);
 assert.ok(html.includes('Proposal-only Species'));assert.ok(html.includes('PR source · not established canon'));
 assert.ok(html.includes('aria-pressed'));
});

test('character edit persists origins while preserving earned state, isolating accounts and leaving canon unchanged',async()=>{
 const canonBefore=JSON.stringify(registry);
 const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
 updateApplication(s=>{for(const uid of ['a','b']){s.documents.users[uid]={uid,displayName:uid,role:'reader'};s.sessions[hash('token-'+uid)]={uid,expires:Date.now()+60000};}});
 const app=express();app.use(express.json());app.use('/api',sameOriginWrites);app.use('/api/player',playerRouter());app.use(apiErrors);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 const request=async(body:any,endpoint='character',uid='a')=>{const res=await fetch(origin+'/api/player/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Loreworks':'1',Cookie:uid?'lw_session=token-'+uid:''},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 try{
  assert.equal((await request(values,'character','')).status,401);
  assert.equal((await request(values)).status,200);
  updateApplication(s=>{s.players.a.xp=70;s.players.a.awarded['first-contact']=1000;s.players.a.discoveries.entity[choice('species').id]=1000;});
  const edited=await request({...values,name:'Revised Explorer',xp:90000,discoveries:{},role:'scribe'},'character/update');
  assert.equal(edited.status,200);assert.equal(edited.body.player.xp,70);assert.equal(edited.body.player.affiliation,values.affiliation);assert.equal(edited.body.player.name,'Revised Explorer');
  assert.equal((await request(values,'character/update','b')).status,409);
  assert.equal((await request({...values,homeworld:'Imaginary'},'character/update')).status,400);
  const saved=JSON.parse(fs.readFileSync(path.join(directory,'application.json'),'utf8'));
  assert.equal(saved.players.a.species,values.species);assert.equal(saved.players.a.name,'Revised Explorer');assert.equal(saved.players.a.awarded['first-contact'],1000);assert.equal(saved.players.b,undefined);assert.equal(readApplication().documents.users.a.role,'reader');
  assert.equal(JSON.stringify(registry),canonBefore);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
