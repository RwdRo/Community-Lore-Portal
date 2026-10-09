import {expeditionBoard,startExpedition,completeExpedition,expeditionAction} from './playerExpeditions';
import {sourceStoryForId} from '../src/constants/sourceArchive';
import { Router } from 'express';
import { getAuthenticatedUser } from './authentication';
import { readApplication, updateApplication } from './applicationStore';
import { getCanonRegistry, getCanonDiscovery } from './canonRegistry';
export const MISSIONS=[
 {id:'first-contact',name:'First Contact',description:'Study one story and record one entity.',stories:1,entities:1,planets:0,xp:40},
 {id:'world-trail',name:'A World of Stories',description:'Explore a world and study three stories.',stories:3,entities:0,planets:1,xp:80},
 {id:'pathfinder',name:'Pathfinder',description:'Visit three worlds and discover five entities.',stories:0,entities:5,planets:3,xp:120},
 {id:'archivist',name:'Archive Expedition',description:'Study ten stories and discover ten entities.',stories:10,entities:10,planets:0,xp:150}
];
export function playerSummary(player:any){
 const counts={stories:new Set(Object.keys(player.discoveries.story).map(id=>sourceStoryForId(id)?.id||id)).size,entities:Object.keys(player.discoveries.entity).length,planets:Object.keys(player.discoveries.planet).length};
 const level=Math.floor(Math.sqrt(player.xp/100))+1;
 const missions=MISSIONS.map(m=>({...m,completed:!!player.awarded[m.id],progress:Math.min(m.stories,counts.stories)+Math.min(m.entities,counts.entities)+Math.min(m.planets,counts.planets),total:m.stories+m.entities+m.planets}));
 const {pending,...visible}=player;
 return {...visible,expeditions:expeditionBoard(player),counts,level,nextLevelXp:100*level*level,missions,achievements:[
  ...(Object.values(player.expeditions||{}).some((e:any)=>e.completedAt)?['Evidence keeper']:[]),...(counts.stories>=1?['First transmission']:[]),...(counts.entities>=5?['Field researcher']:[]),...(counts.planets>=3?['Pathfinder']:[]),...(counts.stories>=10?['Archivist']:[])
 ]};
}
export function awardDiscovery(player:any,kind:string,target:string,at:number){
 if(!['story','entity','planet'].includes(kind))throw Object.assign(new Error('Invalid discovery type.'),{status:400});
 const registry=getCanonRegistry();
 const valid=kind==='story'?registry.sources.some(s=>s.id===target):kind==='entity'?!!getCanonDiscovery(target):registry.entities.some(e=>e.type==='planets'&&e.name===target&&e.state==='source-mention'&&(e as any).scope!=='proposal');
 if(!valid)throw Object.assign(new Error('This discovery is not in the source-backed registry.'),{status:400});
 if(kind==='story'){const source=sourceStoryForId(target);if(source){if(source.legacyIds?.some(id=>player.discoveries.story[id])){player.discoveries.story[target]=at;return;}}}
 if(player.discoveries[kind][target])return;
 if(kind==='story' && (!player.pending[target] || at-player.pending[target]<20000))throw Object.assign(new Error('Spend at least 20 seconds with this transmission before recording your discovery.'),{status:409});
 player.discoveries[kind][target]=at;
 const xp=kind==='story'?20:kind==='entity'?10:5;
 player.xp+=xp;player.activity.unshift({kind,target,at,xp});player.activity=player.activity.slice(0,100);
 if(kind==='story')delete player.pending[target];
 const counts=playerSummary(player).counts;
 for(const m of MISSIONS)if(!player.awarded[m.id]&&counts.stories>=m.stories&&counts.entities>=m.entities&&counts.planets>=m.planets){
  player.awarded[m.id]=at;player.xp+=m.xp;player.activity.unshift({kind:'mission',target:m.id,at,xp:m.xp});
 }
 player.updatedAt=at;
}
export function characterFields(body:any){
 const name=typeof body.name==='string'?body.name.trim():'';const emblem=String(body.emblem||'compass');
 if(name.length<2||name.length>40||!['compass','star','archive','signal'].includes(emblem))throw Object.assign(Error('Choose a name of 2–40 characters and an available emblem.'),{status:400});
 const fields:any={name,emblem};
 for(const [key,max]of [['pronouns',40],['backstory',1200]] as const){const value=body[key]||'';if(typeof value!=='string'||value.length>max)throw Object.assign(Error('Character text exceeds its allowed length.'),{status:400});fields[key]=value.trim();}
 const role=body.specialty||'explorer';if(!['explorer','cartographer','researcher','archivist'].includes(role))throw Object.assign(Error('Choose an available specialty.'),{status:400});fields.specialty=role;
 const color=body.color||'amber';if(!['amber','cyan','violet'].includes(color))throw Object.assign(Error('Choose an available signal color.'),{status:400});fields.color=color;
 for(const [field,type]of [['homeworld','planets'],['species','species'],['affiliation','factions']]){const value=body[field]??'';if(typeof value!=='string'||value.length>160)throw Object.assign(Error('Invalid character setting choice.'),{status:400});if(value&&!getCanonRegistry().entities.some(e=>e.state==='source-mention'&&e.type===type&&e.name===value))throw Object.assign(Error('Choose a documented '+field+' or leave it open.'),{status:400});fields[field]=value;}
 return fields;
}
export function playerRouter(){
 const router=Router();
 router.use((req,res,next)=>{if(!getAuthenticatedUser(req))return res.status(401).json({error:'Sign in to use your player profile.'});next();});
 router.get('/',(req,res)=>{
  const p=readApplication().players[getAuthenticatedUser(req)!.uid];res.json({player:p?playerSummary(p):null});
 });
 router.post('/character',(req,res,next)=>{
  try {
   const user=getAuthenticatedUser(req)!;
   const name=typeof req.body.name==='string'?req.body.name.trim():'';
   const emblem=String(req.body.emblem||'compass');
   if(name.length<2||name.length>40||!['compass','star','archive','signal'].includes(emblem))return res.status(400).json({error:'Choose a name of 2–40 characters and an available emblem.'});
   updateApplication(s=>{
    if(s.players[user.uid])throw Object.assign(new Error('Your character already exists.'),{status:409});
    s.players[user.uid]={...characterFields(req.body),xp:0,createdAt:Date.now(),discoveries:{story:{},entity:{},planet:{}},awarded:{},activity:[],pending:{}};
   });
   res.json({player:playerSummary(readApplication().players[user.uid])});
  }catch(e){next(e);}
 });
 router.post('/begin',(req,res)=>{
  const user=getAuthenticatedUser(req)!;const target=String(req.body.target||'');
  if(!getCanonRegistry().sources.some(s=>s.id===target))return res.status(400).json({error:'Unknown story.'});
  if(!readApplication().players[user.uid])return res.status(409).json({error:'Create your character first.'});
  updateApplication(s=>{const p=s.players[user.uid];if(!p.discoveries.story[target]&&!p.pending[target])p.pending[target]=Date.now();});
  res.json({success:true});
 });
 router.post('/discover',(req,res,next)=>{
  try{
   const user=getAuthenticatedUser(req)!;
   if(!readApplication().players[user.uid])return res.status(409).json({error:'Create your character first.'});
   updateApplication(s=>awardDiscovery(s.players[user.uid],req.body.kind,String(req.body.target||''),Date.now()));
   res.json({player:playerSummary(readApplication().players[user.uid])});
  }catch(e){next(e);}
 });
 router.post('/character/update',(req,res,next)=>{try{const uid=getAuthenticatedUser(req)!.uid;const fields=characterFields(req.body);updateApplication(s=>{if(!s.players[uid])throw Object.assign(Error('Create a character first.'),{status:409});Object.assign(s.players[uid],fields,{updatedAt:Date.now()});});res.json({player:playerSummary(readApplication().players[uid])});}catch(e){next(e);}});
 router.post('/expeditions/start',(req,res,next)=>{try{const uid=getAuthenticatedUser(req)!.uid;updateApplication(s=>{if(!s.players[uid])throw Object.assign(Error('Create a character first.'),{status:409});startExpedition(s.players[uid],String(req.body.id),Date.now());});res.json({player:playerSummary(readApplication().players[uid])});}catch(e){next(e);}});
 router.post('/expeditions/action',(req,res,next)=>{try{const uid=getAuthenticatedUser(req)!.uid;let result:any;updateApplication(s=>{if(!s.players[uid])throw Object.assign(Error('Create a character first.'),{status:409});result=expeditionAction(s.players[uid],String(req.body.id),String(req.body.action),String(req.body.value),Date.now());});res.json({...result,player:playerSummary(readApplication().players[uid])});}catch(e){next(e);}});
 router.post('/expeditions/abandon',(req,res,next)=>{try{const uid=getAuthenticatedUser(req)!.uid;updateApplication(s=>{if(!s.players[uid])throw Object.assign(Error('Create a character first.'),{status:409});const state=s.players[uid].expeditions?.[req.body.id];if(state&&!state.completedAt)delete s.players[uid].expeditions[req.body.id];});res.json({player:playerSummary(readApplication().players[uid])});}catch(e){next(e);}});
 router.post('/expeditions/complete',(req,res,next)=>{try{const uid=getAuthenticatedUser(req)!.uid;let result:any;updateApplication(s=>{if(!s.players[uid])throw Object.assign(Error('Create a character first.'),{status:409});result=completeExpedition(s.players[uid],String(req.body.id),String(req.body.sourceId),Date.now());});res.json({...result,player:playerSummary(readApplication().players[uid])});}catch(e){next(e);}});
 return router;
}
