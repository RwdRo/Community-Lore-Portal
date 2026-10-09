/** GitHub Pages practice progress. Browser storage is user-editable, device-local and
 * not authenticated game authority. This module never writes to the canonical archive. */
import {sourceStoryForId} from '../constants/sourceArchive';
type Catalog={registry:{sources:any[];entities:any[]};expeditions:any[]};
let catalog:Catalog|undefined;
let loading:Promise<Catalog>|undefined;
let identity='local';
const error=(message:string,status=400)=>Object.assign(new Error(message),{status});
export function configurePagesPlayer(data:Catalog){catalog=data;}
export function configurePagesPlayerIdentity(uid:string){identity=uid||'local';}
async function loadCatalog(){
 if(catalog)return catalog;
 if(!loading)loading=fetch(((import.meta as any).env?.BASE_URL||'/')+'pages-data/player-catalog.json').then(async response=>{
  if(!response.ok)throw error('The offline expedition catalog could not load. Refresh the page and try again.',503);
  const data=await response.json();if(!Array.isArray(data.registry?.entities)||!Array.isArray(data.registry?.sources)||!Array.isArray(data.expeditions))throw error('The published expedition catalog is invalid.',503);
  return catalog=data;
 }).catch(e=>{loading=undefined;throw e;});
 return loading;
}
const getCanonRegistry=()=>catalog!.registry;
const getCanonDiscovery=(id:string)=>catalog!.registry.entities.find(e=>e.id===id&&e.state==='source-mention'&&e.scope!=='proposal');
const expeditionCatalog=()=>catalog!.expeditions;
const storageKey=()=> 'loreworks.pages.player.v1:'+encodeURIComponent(identity);
function readPlayer(){
 let raw:string|null;try{raw=localStorage.getItem(storageKey());}catch{throw error('Browser storage is unavailable. Allow site storage to save this device’s progress.',503);}
 if(!raw)return null;
 try{
  const saved=JSON.parse(raw),p=saved.player;
  if(saved.version!==1||!p||!Number.isFinite(p.xp)||p.xp<0||!Array.isArray(p.activity)||!p.discoveries?.story||!p.discoveries?.entity||!p.discoveries?.planet||!p.awarded||!p.pending)throw Error();
  return p;
 }catch{throw error('This browser’s saved player data could not be read. It has been left intact; export your site storage before resetting it.',409);}
}
function savePlayer(player:any){try{localStorage.setItem(storageKey(),JSON.stringify({version:1,player}));}catch{throw error('Progress could not be saved on this device. Browser storage may be full or disabled.',507);}}
const MISSIONS=[
 {id:'first-contact',name:'First Contact',description:'Study one story and record one entity.',stories:1,entities:1,planets:0,xp:40},
 {id:'world-trail',name:'A World of Stories',description:'Explore a world and study three stories.',stories:3,entities:0,planets:1,xp:80},
 {id:'pathfinder',name:'Pathfinder',description:'Visit three worlds and discover five entities.',stories:0,entities:5,planets:3,xp:120},
 {id:'archivist',name:'Archive Expedition',description:'Study ten stories and discover ten entities.',stories:10,entities:10,planets:0,xp:150}
];
function playerSummary(player:any){
 const counts={stories:new Set(Object.keys(player.discoveries.story).map(id=>sourceStoryForId(id)?.id||id)).size,entities:Object.keys(player.discoveries.entity).length,planets:Object.keys(player.discoveries.planet).length};
 const level=Math.floor(Math.sqrt(player.xp/100))+1;
 const missions=MISSIONS.map(m=>({...m,completed:!!player.awarded[m.id],progress:Math.min(m.stories,counts.stories)+Math.min(m.entities,counts.entities)+Math.min(m.planets,counts.planets),total:m.stories+m.entities+m.planets}));
 const {pending,...visible}=player;
 return {...visible,expeditions:expeditionBoard(player),counts,level,nextLevelXp:100*level*level,missions,achievements:[
  ...(Object.values(player.expeditions||{}).some((e:any)=>e.completedAt)?['Evidence keeper']:[]),...(counts.stories>=1?['First transmission']:[]),...(counts.entities>=5?['Field researcher']:[]),...(counts.planets>=3?['Pathfinder']:[]),...(counts.stories>=10?['Archivist']:[])
 ]};
}
function awardDiscovery(player:any,kind:string,target:string,at:number){
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
function characterFields(body:any){
 const name=typeof body.name==='string'?body.name.trim():'';const emblem=String(body.emblem||'compass');
 if(name.length<2||name.length>40||!['compass','star','archive','signal'].includes(emblem))throw Object.assign(Error('Choose a name of 2–40 characters and an available emblem.'),{status:400});
 const fields:any={name,emblem};
 for(const [key,max]of [['pronouns',40],['backstory',1200]] as const){const value=body[key]||'';if(typeof value!=='string'||value.length>max)throw Object.assign(Error('Character text exceeds its allowed length.'),{status:400});fields[key]=value.trim();}
 const role=body.specialty||'explorer';if(!['explorer','cartographer','researcher','archivist'].includes(role))throw Object.assign(Error('Choose an available specialty.'),{status:400});fields.specialty=role;
 const color=body.color||'amber';if(!['amber','cyan','violet'].includes(color))throw Object.assign(Error('Choose an available signal color.'),{status:400});fields.color=color;
 for(const [field,type]of [['homeworld','planets'],['species','species'],['affiliation','factions']]){const value=body[field]??'';if(typeof value!=='string'||value.length>160)throw Object.assign(Error('Invalid character setting choice.'),{status:400});if(value&&!getCanonRegistry().entities.some(e=>e.state==='source-mention'&&e.type===type&&e.name===value))throw Object.assign(Error('Choose a documented '+field+' or leave it open.'),{status:400});fields[field]=value;}
 return fields;
}
const studied=(player:any,id:string)=>!!player.discoveries.story[id]||!!sourceStoryForId(id)?.legacyIds?.some(old=>player.discoveries.story[old]);
function expeditionBoard(player:any){return expeditionCatalog().map(({answerSourceId,clues,...mission})=>{
 const state=player.expeditions?.[mission.id];const order=state?.route?[state.route,...mission.sourceIds.filter(id=>id!==state.route)]:mission.sourceIds;
 const objectives=order.map(id=>({id,title:getCanonRegistry().sources.find(s=>s.id===id)?.title||id,complete:state?.version===2?!!state.findings?.[id]:studied(player,id)}));
 const ready=objectives.every(o=>o.complete);
 return {...mission,state:state?.completedAt?'completed':state?'active':'available',version:state?.version||1,route:state?.route||null,objectives,ready,stage:state?.completedAt?'complete':!state?.route&&state?.version===2?'route':!ready?'fieldwork':'conclusion',completedAt:state?.completedAt||null,attempts:state?.attempts||0,clues:clues.map(({answerKey,...clue})=>clue)};
 });}
function startExpedition(player:any,id:string,at:number){
 if(!expeditionCatalog().some(m=>m.id===id))throw error('Unknown expedition.');player.expeditions||={};
 if(player.expeditions[id])return;
 if(Object.values(player.expeditions).filter((s:any)=>!s.completedAt).length>=2)throw error('Finish or abandon an active expedition before starting another.',409);
 player.expeditions[id]={version:2,startedAt:at,attempts:0,findings:{}};
}
function expeditionAction(player:any,id:string,action:string,value:string,at:number){
 const mission=expeditionCatalog().find(m=>m.id===id),state=player.expeditions?.[id];
 if(!mission||!state||state.version!==2)throw error('Start a new field investigation first.',409);
 if(state.completedAt)return {correct:true,feedback:'This expedition is complete. Its evidence remains in your journey.'};
 if(action==='route'){
  if(!mission.sourceIds.includes(value))throw error('Choose one of this expedition’s sources.');
  if(Object.keys(state.findings).length)throw error('Your source route is locked once a field note is recovered.',409);
  state.route=value;player.updatedAt=at;return {correct:true,feedback:'Route selected. Open your first source and match its field note.'};
 }
 if(action!=='clue')throw error('Unknown expedition action.');
 if(!state.route)throw error('Choose your source route first.',409);
 const order=[state.route,...mission.sourceIds.filter(id=>id!==state.route)];
 const next=order.find(source=>!state.findings[source]);
 if(!next)return {correct:true,feedback:'Both field notes are recovered. Compare them and draw your conclusion.'};
 if(state.lastAttempt&&at-state.lastAttempt<3000)throw error('Take a moment to compare the passage with its source.',429);
 state.lastAttempt=at;state.attempts++;
 if(mission.clues.find(clue=>clue.sourceId===next)?.answerKey!==value)return {correct:false,feedback:'This passage belongs to another source. Open the target work and compare the surrounding wording; the shared entity name alone is not enough.'};
 state.findings[next]={at,key:value};player.updatedAt=at;
 return {correct:true,feedback:Object.keys(state.findings).length===2?'Second field note recovered. Your board now holds evidence from both works. What can you safely conclude?':'First field note recovered. Follow the same entity into the second work and compare its context.'};
}
function completeExpedition(player:any,id:string,answer:string,at:number){
 const mission=expeditionCatalog().find(m=>m.id===id),state=player.expeditions?.[id];if(!mission||!state)throw error('Start this expedition first.',409);
 if(state.completedAt)return {correct:true,alreadyCompleted:true,feedback:'This expedition has already awarded its XP.'};
 const modern=state.version===2;
 if(modern?!mission.sourceIds.every(source=>state.findings?.[source]):!mission.sourceIds.every(source=>studied(player,source)))throw error(modern?'Recover both field notes before drawing your conclusion.':'Study and record both source works before completing the evidence checkpoint.',409);
 if(state.lastAttempt&&at-state.lastAttempt<3000)throw error('Review the evidence before trying again.',429);
 state.lastAttempt=at;state.attempts++;
 if(answer!==(modern?'shared-appearance':mission.answerSourceId))return {correct:false,feedback:modern?'The passages establish an appearance in each work. They do not, by themselves, prove chronology or a causal relationship. Compare what is stated with what is inferred.':'That source does not contain this passage. Return to the linked works and compare the wording.'};
 state.completedAt=at;player.xp+=mission.xp;player.activity.unshift({kind:'expedition',target:mission.id,at,xp:mission.xp});player.activity=player.activity.slice(0,100);player.updatedAt=at;
 return {correct:true,feedback:modern?'Investigation complete: two source appearances verified, with no unsupported timeline or relationship added to canon. +120 XP.':'Evidence verified. Expedition complete.',xp:mission.xp};
}

export async function pagesPlayer(path:string,body?:any):Promise<any>{
 await loadCatalog();
 const route=path.replace(/^\/?(?:api\/)?player\/?/,'').replace(/\/$/,'');
 let player=readPlayer();
 if(body===undefined){if(route)throw error('Unknown local player request.',404);return {player:player?playerSummary(player):null,storageMode:'browser-local',progressNotice:'Practice progress is saved only in this browser. It is not a shared account or leaderboard.'};}
 const input=body&&typeof body==='object'?body:{};const now=Date.now();let result:any={};
 if(route==='character'){
  if(player)throw error('Your local character already exists.',409);
  player={...characterFields(input),xp:0,createdAt:now,discoveries:{story:{},entity:{},planet:{}},awarded:{},activity:[],pending:{},expeditions:{}};
 }else{
  if(!player)throw error('Create a character on this device first.',409);
  switch(route){
   case 'character/update':Object.assign(player,characterFields(input),{updatedAt:now});break;
   case 'begin':{
    const target=String(input.target||'');if(!getCanonRegistry().sources.some(s=>s.id===target))throw error('Unknown story.');
    if(!player.discoveries.story[target]&&!player.pending[target])player.pending[target]=now;result.success=true;break;
   }
   case 'discover':awardDiscovery(player,String(input.kind||''),String(input.target||''),now);break;
   case 'expeditions/start':startExpedition(player,String(input.id||''),now);break;
   case 'expeditions/action':result=expeditionAction(player,String(input.id||''),String(input.action||''),String(input.value||''),now);break;
   case 'expeditions/complete':result=completeExpedition(player,String(input.id||''),String(input.sourceId||''),now);break;
   case 'expeditions/abandon':{const id=String(input.id||'');if(!expeditionCatalog().some(m=>m.id===id))throw error('Unknown expedition.');const state=player.expeditions?.[id];if(state&&!state.completedAt)delete player.expeditions[id];break;}
   default:throw error('This player action is unavailable in local practice mode.',404);
  }
 }
 savePlayer(player);
 return {...result,player:playerSummary(player),storageMode:'browser-local',progressNotice:'Practice progress is saved only in this browser. It is not a shared account or leaderboard.'};
}
