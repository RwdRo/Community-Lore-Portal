/** Public, shipped narrative export only. Never reads application accounts, corpus imports or SQLite. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getCanonRegistry,getRegistryRecords} from '../server/canonRegistry';
import {LoreCorpusStore} from '../server/loreCorpus';
import {expeditionCatalog} from '../server/playerExpeditions';
import {SOURCE_REVISION} from '../src/constants/sourceArchive';
import verified from '../server/data/verified_pr_sources.json';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const output=path.resolve('public/pages-data');fs.mkdirSync(output,{recursive:true});
const write=(name:string,value:unknown)=>{const file=path.join(output,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
const registry=getCanonRegistry(),records=getRegistryRecords();
const listing={sources:registry.sources,entities:registry.entities.map(({evidence,references,relationships,...e})=>({...e,sourceIds:[...new Set(evidence.map(v=>v.sourceId))],mentions:evidence.length,referenceCount:references.length,relationshipCount:relationships.length,evidencePreview:evidence[0]||null})),revision:SOURCE_REVISION};
write('registry.json',listing);write('player-catalog.json',{registry,expeditions:expeditionCatalog()});
const manifest:{version:number;revision:string;entities:Record<string,string>;records:Record<string,string>;corpus:Record<string,string>}={version:1,revision:SOURCE_REVISION,entities:{},records:{},corpus:{}};
for(const entity of registry.entities){const file='entities/'+hash(entity.id)+'.json';manifest.entities[entity.id]=file;write(file,{...entity,review:null});}
for(const record of records){const file='records/'+hash(record.id)+'.json';manifest.records[record.id]=file;write(file,{...record,sourceHash:hash(record.content),contentComplete:true});}
// Dedicated fresh temporary store allows using the same parser/index without exposing persisted user imports.
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'loreworks-pages-public-'));const corpus=new LoreCorpusStore(scratch);const sources=corpus.seed(records);
const searchRows:any[]=[],postings:Record<string,number[]>=Object.create(null);
const tokens=(text:string)=>[...new Set(text.toLocaleLowerCase('en').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{1,63}/gu)||[])];
for(const source of sources){const raw=corpus.raw(source.id),sections=corpus.sections(source.id);assert.equal(sections.map(s=>raw.slice(s.start,s.end)).join(''),raw);assert.equal(hash(raw),source.hash);const file='corpus/'+source.id+'.json';manifest.corpus[source.id]=file;write(file,{source,sections:sections.map(s=>({...s,text:raw.slice(s.start,s.end)}))});for(let i=0;i<sections.length;i++){const section=sections[i],row=searchRows.length;searchRows.push({sourceId:source.id,sectionIndex:i,section});for(const token of tokens(raw.slice(section.start,section.end))){postings[token] ||= [];postings[token].push(row);}}}
write('corpus-sources.json',{sources,total:sources.length,maxImportBytes:0,readOnly:true});write('corpus-search.json',{rows:searchRows,postings});
const proposals=Object.values(verified).filter(p=>p.status==='resolved'&&p.content).map(p=>({id:'github_pr_'+p.pr_id,proposal_id:null,proposer:p.author||'',title:p.title,content:p.content,ipfs_cid:'',status:-1,status_label:'PR source — governance unavailable',votes_for:null,votes_against:null,threshold:null,planet:'',created_at:null,updated_at:null,source_url:p.pr_url,pull_request_id:p.pr_id,narrative_source_status:'resolved',narrative_source_reason:p.reason,narrative_source_path:p.file_path,narrative_source_sha256:p.content_sha256,narrative_title:p.title,narrative_author:p.author||'',narrative_content:p.content,content_complete:true,narrative_full_length:p.content.length,onChain:false,source_kind:p.source_kind,source_revision:p.head_sha}));
write('proposals.json',{data:proposals,readOnly:true,governanceAvailable:false});write('manifest.json',manifest);
assert.ok(records.some(r=>r.id==='github_pr_85'),'Cradle must be preserved');assert.equal(sources.length,records.length);
console.log(JSON.stringify({sources:sources.length,entities:registry.entities.length,sections:searchRows.length,proposals:proposals.length,output}));
// Scratch contains only newly generated public data; defer cleanup until the store's scheduled no-op resume completes.
setImmediate(()=>{if(path.dirname(scratch)===path.resolve(os.tmpdir())&&path.basename(scratch).startsWith('loreworks-pages-public-'))fs.rmSync(scratch,{recursive:true,force:true});});
