import { Router } from 'express';
import { SOURCE_TAXONOMY } from './sourceTaxonomy';
import verifiedProposals from './data/verified_pr_sources.json';
import { createHash } from 'node:crypto';
import { SOURCE_STORIES, SOURCE_REVISION } from '../src/constants/sourceArchive';
import { normalizeLoreEntry } from '../src/constants/loreIndex';
import { getAuthenticatedUser } from './authentication';
import { readApplication, updateApplication } from './applicationStore';

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export interface Evidence {sourceId:string;start:number;end:number;quote:string;context:string;sourceHash:string;scope:'canon'|'proposal'}
export interface Entity {id:string;name:string;type:string;aliases:string[];state:'source-mention'|'candidate';evidence:Evidence[];references:any[];relationships:any[];scope:'canon'|'proposal'|'mixed';classification?:string;summary?:string}
function contextSpan(body:string,start:number,end:number){
 const paragraphStart=body.lastIndexOf('\n\n',start)+2;
 let from=Math.max(0,paragraphStart,body.lastIndexOf('. ',start)+2);
 if(start-from>1000){const boundary=body.indexOf(' ',start-240);from=boundary>=0&&boundary<start?boundary+1:start;}
 const paragraphEnd=body.indexOf('\n\n',end),sentenceEnd=body.indexOf('. ',end);
 let to=Math.min(paragraphEnd<0?body.length:paragraphEnd,sentenceEnd<0?body.length:sentenceEnd+1,end+700);
 if(to<body.length&&to===end+700){const boundary=body.lastIndexOf(' ',to);if(boundary>end)to=boundary;}
 return body.slice(from,to);
}
export function buildRegistry(records:any[]){
 const entities=new Map<string,Entity>(),sources=new Map<string,any>();
 for(const original of records){
  const story=normalizeLoreEntry(original),body=String(original.content||'');
  const scope:'canon'|'proposal'=original.type==='proposed'?'proposal':'canon';
  const sourceHash=createHash('sha256').update(body).digest('hex');
  sources.set(story.id,{id:story.id,title:original.title,author:original.authorName,url:original.sourceUrl||null,hash:sourceHash,primaryWorld:story.primaryWorld,mentionedWorlds:story.mentionedWorlds,scope,status:original.status,provenance:original.provenance||'bundled-source-snapshot'});
  const candidates:any[]=[];
  const add=(name:string,type:string,state:Entity['state'],start:number,end:number)=>{
    const id=state==='candidate'?'candidate:'+story.id+':'+type+':'+slug(name):(scope==='proposal'?'proposal-entity:':'entity:')+type+':'+slug(name);
    const entity=entities.get(id)||{id,name,type,aliases:[],state,evidence:[],references:[],relationships:[],scope};
    if(!entity.evidence.some(e=>e.sourceId===story.id&&e.start===start))entity.evidence.push({sourceId:story.id,start,end,quote:body.slice(start,end),context:contextSpan(body,start,end),sourceHash,scope});
    entities.set(id,entity);return entity;
  };
  for(const e of SOURCE_TAXONOMY){
   if(e.sourceIds&&!e.sourceIds.includes(story.id))continue;
   const aliases=[e.name,...(e.aliases||[])];
   for(const alias of aliases){
    const re=new RegExp('(^|[^A-Za-z0-9])('+escape(alias)+(e.type==='species'&&!alias.endsWith('s')?'s?':'')+')(?=$|[^A-Za-z0-9])',e.caseSensitive?'g':'gi');
    for(const m of body.matchAll(re)){
     const entity=add(e.name,e.type,'source-mention',m.index!+m[1].length,m.index!+m[1].length+m[2].length);
     entity.classification=e.classification;entity.aliases=e.aliases||[];
     // The preview is a quoted excerpt, never an invented encyclopedia entry.
     entity.summary ||= entity.evidence[0].context;
     const lineStart=body.lastIndexOf('\n',m.index!)+1,lineEnd=body.indexOf('\n',m.index!);
     const line=body.slice(lineStart,lineEnd<0?body.length:lineEnd).replace(/^#{1,6}\s*/, '').replace(/[*_]/g,'').trim();
     if(aliases.some(name=>line.toLowerCase()===name.toLowerCase()||line.toLowerCase()===name.toLowerCase()+'s')){
       const paragraphStart=lineEnd+1;const next=body.indexOf('\n\n',paragraphStart+2);
       const paragraph=body.slice(paragraphStart,next<0?paragraphStart+900:Math.min(next,paragraphStart+900)).trim();if(paragraph)entity.summary=paragraph;
     }
    }
   }
  }
  // Conservative proper-name candidates. Candidate identity stays source-scoped.
  const patterns=[
   {type:'character',regex:/\b(?:Captain|Commander|Doctor|Professor|Engineer|General|Chief|Dr\.)\s+([A-Z][a-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Z][a-z]+){0,2})/g},
   {type:'character',regex:/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:said|asked|replied|whispered|shouted)\b/g},
   {type:'vehicle',regex:/\b(?:ship|vessel|vehicle|cruiser)\s+(?:called|named)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})/g},
   {type:'location',regex:/\b(?:city|settlement|station|village)\s+(?:of|called|named)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3})/g},
   {type:'creature',regex:/\b(?:creature|animal|beast)\s+(?:called|named)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})/g}
  ];
  for(const p of patterns)for(const m of body.matchAll(p.regex)){
   const start=m.index!+m[0].lastIndexOf(m[1]);const entity=add(m[1],p.type,'candidate',start,start+m[1].length);candidates.push(entity);
  }
  for(const entity of new Set<Entity>(candidates)){
   const parts=entity.name.split(' ');if(parts.length>1)entity.aliases=[parts[0],parts[parts.length-1]];
   for(const evidence of entity.evidence.filter(e=>e.sourceId===story.id)){
    const end=body.indexOf('\n\n',evidence.end);const paragraph=body.slice(evidence.end,end<0?Math.min(body.length,evidence.end+600):end);
    for(const m of paragraph.matchAll(/\b(he|she|they|him|her|their|the captain|the engineer)\b/gi)){
     const start=evidence.end+m.index!;
     const possible=Array.from(new Set(candidates.filter(c=>c.type==='character').filter(c=>c.evidence.some((e:any)=>e.start<start&&start-e.end<600)).map(c=>c.id)));
     entity.references.push({sourceId:story.id,start,end:start+m[0].length,text:m[0],candidateIds:possible,confidence:possible.length===1?0.65:0.25,status:'requires-review'});
    }
   }
  }
  for(const relation of story.relationships||[]){
   const subject=Array.from(entities.values()).find(e=>e.name===relation.subject&&e.state==='source-mention'&&e.scope===scope&&e.evidence.some(v=>v.sourceId===story.id));
   const object=Array.from(entities.values()).find(e=>e.name===relation.object&&e.state==='source-mention'&&e.scope===scope&&e.evidence.some(v=>v.sourceId===story.id));
   if(subject&&object){
    const predicatePatterns:Record<string,RegExp>={native_to:/is native to|are native to|originated on|comes from|came from/i,belongs_to:/is part of|belongs to|joined/i,located_on:/is located on|was located on|is found on/i};
    const sentence=Array.from(body.matchAll(/[^.!?\n]+[.!?]?/g)).find(m=>new RegExp(escape(subject.name),'i').test(m[0])&&new RegExp(escape(object.name),'i').test(m[0])&&predicatePatterns[relation.predicate]?.test(m[0]));
    if(sentence)subject.relationships.push({predicate:relation.predicate,targetId:object.id,sourceId:story.id,status:'candidate',confidence:0.7,evidence:{sourceId:story.id,start:sentence.index,end:sentence.index!+sentence[0].length,quote:sentence[0],sourceHash,scope}});
   }
  }
 }
 const robotronSource=records.find(r=>r.id==='github_pr_89');
 if(robotronSource){const body=robotronSource.content;const start=body.indexOf('### **Chapter 9:');const end=body.indexOf('### **Chapter 11:',start);if(start>=0&&end>start){
 const sourceHash=createHash('sha256').update(body).digest('hex');
 for(const [subjectName,targetName,predicate] of [['Elsewhere','Designate Null','subterranean_city_on'],['Robotron','Elsewhere','inhabits_in_this_account'],['A-01','Elsewhere','works_in_archives_of']] as const){
 const subject=Array.from(entities.values()).find(e=>e.name===subjectName&&e.scope==='proposal'),target=Array.from(entities.values()).find(e=>e.name===targetName&&e.scope==='proposal');
 if(subject&&target)subject.relationships.push({predicate,targetId:target.id,sourceId:'github_pr_89',status:'source-supported interpretation',evidence:{sourceId:'github_pr_89',start,end,quote:body.slice(start,end),sourceHash,scope:'proposal'}});
 }
 }}
 return {entities:Array.from(entities.values()).sort((a,b)=>a.name.localeCompare(b.name)),sources:Array.from(sources.values())};
}
let registry:ReturnType<typeof buildRegistry>|undefined;
/** Compare complete bodies only. Merge state and similar titles do not prove canon membership. */
export function supplementaryRegistrySources(archive:{content:string}[],proposals:any[]){
 const normalize=(body:string)=>body.replace(/\r\n?/g,'\n').trim();
 const bodies=archive.map(s=>normalize(s.content));
 return proposals.filter(p=>p.status==='resolved'&&/^verified_git_(merge|pull_ref)_diff$/.test(p.source_kind)&&typeof p.content==='string'&&normalize(p.content).length>0&&!bodies.some(body=>body.includes(normalize(p.content))));
}
export function getRegistryRecords(){return [...SOURCE_STORIES,...supplementaryRegistrySources(SOURCE_STORIES,Object.values(verifiedProposals)).map(p=>({id:'github_pr_'+p.pr_id,title:p.title,content:p.content,authorName:p.author||'Unspecified',type:'proposed',status:'PR source; canon acceptance not inferred',sourceUrl:p.pr_url,provenance:p.source_kind,sourceRevision:p.head_sha,sourceFile:p.file_path,tags:[]}))];}
export function getCanonRegistry(){return registry ||= buildRegistry(getRegistryRecords());}
export function getCanonDiscovery(id:string){return getCanonRegistry().entities.find(e=>e.id===id&&e.state==='source-mention'&&e.scope!=='proposal');}
export function canonRegistryRouter(){
 const router=Router();
 router.get('/registry-source/:id',(req,res)=>{
  const record=getRegistryRecords().find(s=>s.id===req.params.id);
  if(!record)return res.status(404).json({error:'Source not found.'});
  res.json({...record,sourceHash:createHash('sha256').update(record.content).digest('hex'),contentComplete:true});
 });
 router.get('/registry',(_req,res)=>{
  const data=getCanonRegistry();
  res.json({sources:data.sources,entities:data.entities.map(({evidence,references,relationships,...e})=>({...e,sourceIds:Array.from(new Set(evidence.map(v=>v.sourceId))),mentions:evidence.length,referenceCount:references.length,relationshipCount:relationships.length,evidencePreview:evidence[0]||null})),revision:SOURCE_REVISION});
 });
 router.get('/registry/:id',(req,res)=>{
  const entity=getCanonRegistry().entities.find(e=>e.id===req.params.id);
  if(!entity)return res.status(404).json({error:'Entity not found.'});
  res.json({...entity,review:readApplication().documents.registry_reviews?.[entity.id]||null});
 });
 router.post('/registry/:id/review',(req,res)=>{
  const user=getAuthenticatedUser(req);if(user?.role!=='scribe')return res.status(403).json({error:'Scribe authorization required.'});
  const entity=getCanonRegistry().entities.find(e=>e.id===req.params.id);
  if(!entity||!['accepted','rejected','disputed'].includes(req.body.status)||typeof req.body.note!=='string'||!req.body.note.trim()||req.body.note.length>2000)return res.status(400).json({error:'Valid entity, review state and evidence note are required.'});
  updateApplication(s=>{
   s.documents.registry_reviews ||= {};
   const previous=s.documents.registry_reviews[entity.id];
   s.documents.registry_reviews[entity.id]={status:req.body.status,note:req.body.note,reviewer:user.uid,at:Date.now(),history:[...(previous?.history||[]),...(previous?[{status:previous.status,note:previous.note,reviewer:previous.reviewer,at:previous.at}]:[])]};
  });
  res.json({success:true});
 });
 return router;
}
