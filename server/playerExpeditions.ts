import {createHash} from 'node:crypto';
import {getCanonRegistry} from './canonRegistry';
import {sourceStoryForId} from '../src/constants/sourceArchive';
const error=(message:string,status=400)=>Object.assign(new Error(message),{status});
const key=(e:any)=>createHash('sha256').update(`${e.sourceId}:${e.start}:${e.end}:${e.sourceHash}`).digest('hex').slice(0,20);
let catalogCache:ReturnType<typeof buildExpeditionCatalog>|undefined;
export function expeditionCatalog(){return catalogCache ||= buildExpeditionCatalog();}
function buildExpeditionCatalog(){
 const registry=getCanonRegistry();
 return registry.entities.filter(e=>e.state==='source-mention'&&e.scope!=='proposal'&&new Set(e.evidence.filter(v=>!!sourceStoryForId(v.sourceId)).map(v=>v.sourceId)).size>=2).map(e=>{
 const sources=[...new Set(e.evidence.filter(v=>!!sourceStoryForId(v.sourceId)).map(v=>v.sourceId))].slice(0,2),evidence=e.evidence.find(v=>v.sourceId===sources[1])!;
 const clues=sources.map(sourceId=>{
  const correct=e.evidence.find(v=>v.sourceId===sourceId)!;
  const alternatives=registry.entities.filter(other=>other.scope!=='proposal').flatMap(other=>other.evidence).filter(v=>v.sourceId!==sourceId&&!!sourceStoryForId(v.sourceId)&&v.context!==correct.context);
  const seen=new Set([correct.context]);const distractors=alternatives.filter(v=>{if(seen.has(v.context))return false;seen.add(v.context);return true;}).slice(0,2);
  return {sourceId,answerKey:key(correct),options:[correct,...distractors].map(v=>({key:key(v),quote:v.context})).sort((a,b)=>a.key.localeCompare(b.key))};
 });
 return {id:'trail:'+e.id,name:'Trace '+e.name,entityId:e.id,entityName:e.name,discipline:e.type,sourceIds:sources,xp:120,brief:'Choose your starting source, recover two field notes, and decide what the evidence actually establishes about '+e.name+'.',quote:evidence.context,answerSourceId:evidence.sourceId,options:registry.sources.filter(s=>sources.includes(s.id)).map(s=>({id:s.id,title:s.title})),clues};
 });
}
const studied=(player:any,id:string)=>!!player.discoveries.story[id]||!!sourceStoryForId(id)?.legacyIds?.some(old=>player.discoveries.story[old]);
export function expeditionBoard(player:any){return expeditionCatalog().map(({answerSourceId,clues,...mission})=>{
 const state=player.expeditions?.[mission.id];const order=state?.route?[state.route,...mission.sourceIds.filter(id=>id!==state.route)]:mission.sourceIds;
 const objectives=order.map(id=>({id,title:getCanonRegistry().sources.find(s=>s.id===id)?.title||id,complete:state?.version===2?!!state.findings?.[id]:studied(player,id)}));
 const ready=objectives.every(o=>o.complete);
 return {...mission,state:state?.completedAt?'completed':state?'active':'available',version:state?.version||1,route:state?.route||null,objectives,ready,stage:state?.completedAt?'complete':!state?.route&&state?.version===2?'route':!ready?'fieldwork':'conclusion',completedAt:state?.completedAt||null,attempts:state?.attempts||0,clues:clues.map(({answerKey,...clue})=>clue)};
 });}
export function startExpedition(player:any,id:string,at:number){
 if(!expeditionCatalog().some(m=>m.id===id))throw error('Unknown expedition.');player.expeditions||={};
 if(player.expeditions[id])return;
 if(Object.values(player.expeditions).filter((s:any)=>!s.completedAt).length>=2)throw error('Finish or abandon an active expedition before starting another.',409);
 player.expeditions[id]={version:2,startedAt:at,attempts:0,findings:{}};
}
export function expeditionAction(player:any,id:string,action:string,value:string,at:number){
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
export function completeExpedition(player:any,id:string,answer:string,at:number){
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
