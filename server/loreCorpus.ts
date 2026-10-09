import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Router} from 'express';
import {SOURCE_TAXONOMY} from './sourceTaxonomy';
import {getAuthenticatedUser} from './authentication';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const indexRevision=sha('corpus-v3:'+JSON.stringify(SOURCE_TAXONOMY));
export interface CorpusMention {name:string;type:string;classification:string;start:number;end:number}
export interface CorpusSection {mentions?:CorpusMention[];id:string;start:number;end:number;heading:string;level:number;parentId:string|null;ancestry:string[];hash:string}
export interface CorpusSource {taxonomy?:{name:string;type:string;classification:string}[];id:string;sourceId:string;title:string;scope:'canon'|'proposed';provenance:unknown;hash:string;bytes:number;characters:number;sections:number;createdAt:string;indexRevision?:string}
interface Job {id:string;state:'queued'|'running'|'complete'|'failed';title:string;userId:string;sourceId?:string;error?:string;createdAt:string}
const tokens=(text:string)=>Array.from(new Set((text.toLocaleLowerCase('en').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{1,63}/gu)||[])));
/** Offsets are UTF-16 positions in decoded UTF-8 text. Raw bytes are stored independently unchanged. */
export function parseCorpusSections(text:string,chunkSize=8192):CorpusSection[]{
 if(!Number.isInteger(chunkSize)||chunkSize<64)throw new Error('Invalid chunk size');
 const headings:{start:number;end:number;name:string;level:number}[]=[];const codeRanges:{start:number;end:number}[]=[];let fenced=false;let fence='';let codeStart=0;
 for(const m of text.matchAll(/[^\n]*(?:\n|$)/g)){
  const line=m[0];const f=line.match(/^ {0,3}(`{3,}|~{3,})/);if(f){if(!fenced){fenced=true;fence=f[1][0];codeStart=m.index!;}else if(f[1][0]===fence){fenced=false;codeRanges.push({start:codeStart,end:m.index!+line.length});}continue;}
  if(fenced)continue;const h=line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*\r?\n?$/);if(h)headings.push({start:m.index!,end:m.index!+line.length,name:h[2].replace(/[ \t]+#+[ \t]*$/,'').trim(),level:h[1].length});
  
 }
 if(fenced)codeRanges.push({start:codeStart,end:text.length});
 for(const html of text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi))if(!codeRanges.some(r=>html.index!>=r.start&&html.index!<r.end))headings.push({start:html.index!,end:html.index!+html[0].length,name:html[2].replace(/<[^>]*>/g,'').trim(),level:Number(html[1])});
 headings.sort((a,b)=>a.start-b.start);const result:CorpusSection[]=[];let stack:{id:string;level:number;heading:string}[]=[];
 const boundaries=[{start:0,end:0,name:'',level:0},...headings.filter(h=>h.start!==0||h.end>0)];
 for(let i=0;i<boundaries.length;i++){
  const h=boundaries[i],end=boundaries[i+1]?.start??text.length;if(end===h.start)continue;
  if(h.level)while(stack.length&&stack.at(-1)!.level>=h.level)stack.pop();
  const parentId=stack.at(-1)?.id||null,ancestry=stack.map(x=>x.heading);let first='';
  for(let start=h.start;start<end;){let stop=Math.min(end,start+chunkSize);if(stop<end&&/[\uD800-\uDBFF]/.test(text[stop-1]))stop--;const id='section_'+start;first ||= id;
   result.push({id,start,end:stop,heading:h.name,level:h.level,parentId,ancestry,hash:sha(text.slice(start,stop))});start=stop;
  }
  if(h.level)stack.push({id:first,level:h.level,heading:h.name});
 }
 return result;
}
export class LoreCorpusStore {
 readonly directory:string;readonly maxBytes:number;private jobsRunning=false;
 constructor(directory=process.env.LORE_CORPUS_DIR||path.join(process.env.DATA_DIR||'data','corpus'),maxBytes=Number(process.env.LORE_IMPORT_MAX_BYTES||20*1024*1024)){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>100*1024*1024)throw new Error('LORE_IMPORT_MAX_BYTES must be 1024..104857600');this.directory=path.resolve(directory);this.maxBytes=maxBytes;
  for(const dir of ['sources','uploads','jobs'])fs.mkdirSync(path.join(this.directory,dir),{recursive:true});
  this.resume();
 }
 private json(file:string,value:unknown){const tmp=file+'.'+randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
 private dir(id:string){if(!/^corpus_[a-f0-9]{64}$/.test(id))throw new Error('Invalid source ID');return path.join(this.directory,'sources',id);}
 sources(){return fs.readdirSync(path.join(this.directory,'sources')).filter(id=>/^corpus_[a-f0-9]{64}$/.test(id)).flatMap(id=>{const f=path.join(this.dir(id),'manifest.json');return fs.existsSync(f)?[JSON.parse(fs.readFileSync(f,'utf8')) as CorpusSource]:[];});}
 source(id:string):CorpusSource|undefined{const f=path.join(this.dir(id),'manifest.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):undefined;}
 raw(id:string){const s=this.source(id);if(!s)throw new Error('Unknown source');const bytes=fs.readFileSync(path.join(this.dir(id),'raw.utf8'));if(sha(bytes)!==s.hash)throw new Error('Source integrity failure');return bytes.toString('utf8');}
 sections(id:string){if(!this.source(id))throw new Error('Unknown source');return JSON.parse(fs.readFileSync(path.join(this.dir(id),'sections.json'),'utf8')) as CorpusSection[];}
 ingest(raw:Buffer,meta:{sourceId:string;title:string;scope:'canon'|'proposed';provenance:unknown}){
  if(raw.length>this.maxBytes)throw new Error('Source exceeds configured byte limit');const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);if(!text.trim())throw new Error('Source is empty');const hash=sha(raw),id='corpus_'+sha(meta.sourceId+'\0'+hash);if(this.source(id)?.indexRevision===indexRevision)return this.source(id)!;
  const sections=parseCorpusSections(text);
  for(const section of sections){section.mentions=[];const body=text.slice(section.start,section.end);for(const taxon of SOURCE_TAXONOMY){if(taxon.sourceIds&&!taxon.sourceIds.includes(meta.sourceId))continue;for(const alias of [taxon.name,...taxon.aliases||[]]){const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp('(^|[^\\p{L}\\p{N}])('+escaped+')(?=$|[^\\p{L}\\p{N}])',taxon.caseSensitive?'gu':'giu');for(const m of body.matchAll(re)){const start=section.start+m.index!+m[1].length;if(!section.mentions.some(v=>v.name===taxon.name&&v.start===start))section.mentions.push({name:taxon.name,type:taxon.type,classification:taxon.classification,start,end:start+m[2].length});}}}}
  const taxonomy=Array.from(new Map(sections.flatMap(s=>s.mentions||[]).map(({name,type,classification})=>[type+':'+name,{name,type,classification}])).values());
  const index:Record<string,number[]>=Object.create(null);for(let i=0;i<sections.length;i++)for(const token of tokens(text.slice(sections[i].start,sections[i].end))){index[token] ||= [];index[token].push(i);}
  if(Object.keys(index).length>250000)throw new Error('Source exceeds 250000 unique search terms');const dir=this.dir(id);fs.mkdirSync(dir,{recursive:true});const rawFile=path.join(dir,'raw.utf8');if(fs.existsSync(rawFile)){if(sha(fs.readFileSync(rawFile))!==hash)throw new Error('Existing immutable source integrity failure');}else{const fd=fs.openSync(rawFile,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  const manifest:CorpusSource={...meta,id,hash,indexRevision,taxonomy,bytes:raw.length,characters:text.length,sections:sections.length,createdAt:new Date().toISOString()};this.json(path.join(dir,'sections.json'),sections);this.json(path.join(dir,'index.json'),index);this.json(path.join(dir,'manifest.json'),manifest);return manifest;
 }
 seed(records:any[]){return records.map(r=>this.ingest(Buffer.from(r.content,'utf8'),{sourceId:r.id,title:r.title,scope:r.type==='canon'?'canon':'proposed',provenance:{url:r.sourceUrl||null,kind:r.provenance||'bundled-source-snapshot',revision:r.sourceRevision||null}}));}
 search(query:string,offset=0,limit=25){const terms=tokens(query).slice(0,12);if(!terms.length)return {total:0,results:[]};const hits:{source:CorpusSource;section:CorpusSection;sectionIndex:number}[]=[];for(const source of this.sources()){const index=JSON.parse(fs.readFileSync(path.join(this.dir(source.id),'index.json'),'utf8'));let matches:number[]=index[terms[0]]||[];for(const term of terms.slice(1)){const ids=new Set(index[term]||[]);matches=matches.filter(n=>ids.has(n));}if(matches.length){const sections=this.sections(source.id);for(const i of matches)hits.push({source,section:sections[i],sectionIndex:i});}}return {total:hits.length,results:hits.slice(offset,offset+limit)};}
 job(id:string):Job|undefined{if(!/^[a-f0-9-]{36}$/.test(id))return;const f=path.join(this.directory,'jobs',id+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):undefined;}
 enqueue(file:string,title:string,userId:string){const id=randomUUID();fs.renameSync(file,path.join(this.directory,'uploads',id+'.utf8'));const job:Job={id,state:'queued',title,userId,createdAt:new Date().toISOString()};this.json(path.join(this.directory,'jobs',id+'.json'),job);this.resume();return job;}
 resume(){if(this.jobsRunning)return;this.jobsRunning=true;setImmediate(()=>{try{for(const f of fs.readdirSync(path.join(this.directory,'jobs')).filter(f=>f.endsWith('.json'))){const job:Job=JSON.parse(fs.readFileSync(path.join(this.directory,'jobs',f),'utf8'));if(job.state!=='queued'&&job.state!=='running')continue;job.state='running';this.json(path.join(this.directory,'jobs',f),job);try{const source=this.ingest(fs.readFileSync(path.join(this.directory,'uploads',job.id+'.utf8')),{sourceId:'import_'+job.id,title:job.title,scope:'proposed',provenance:{kind:'scribe-import',importedBy:job.userId}});job.sourceId=source.id;job.state='complete';}catch(error){job.state='failed';job.error=error instanceof Error?error.message:'Processing failed';}this.json(path.join(this.directory,'jobs',f),job);}}finally{this.jobsRunning=false;}});}
}
export function createLoreCorpusRouter(store:LoreCorpusStore){
 const router=Router();const page=(q:any)=>({offset:Math.max(0,Math.min(1000000,Number(q.offset)||0)),limit:Math.max(1,Math.min(100,Number(q.limit)||25))});
 router.get('/sources',(req,res)=>{const {offset,limit}=page(req.query),all=store.sources();res.json({total:all.length,sources:all.slice(offset,offset+limit),maxImportBytes:store.maxBytes});});
 router.get('/sources/:id',(req,res)=>{try{const source=store.source(req.params.id);if(!source)return res.status(404).json({error:'Source not found'});res.json(source);}catch{res.status(404).json({error:'Source not found'});}});
 router.get('/sources/:id/sections',(req,res)=>{try{const {offset,limit}=page(req.query),sections=store.sections(req.params.id),text=store.raw(req.params.id);res.json({total:sections.length,sections:sections.slice(offset,offset+limit).map(s=>({...s,text:text.slice(s.start,s.end)}))});}catch{res.status(404).json({error:'Source unavailable or integrity check failed'});}});
 router.get('/search',(req,res)=>{const {offset,limit}=page(req.query);res.json(store.search(String(req.query.q||'').slice(0,500),offset,limit));});
 router.get('/jobs/:id',(req,res)=>{const user=getAuthenticatedUser(req);if(user?.role!=='scribe')return res.status(403).json({error:'Scribe authorization required'});const job=store.job(req.params.id);return job?res.json(job):res.status(404).json({error:'Job not found'});});
 router.post('/imports',(req,res)=>{
  const user=getAuthenticatedUser(req);if(user?.role!=='scribe')return res.status(403).json({error:'Scribe authorization required'});
  if(!/^text\/(plain|markdown)(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))return res.status(415).json({error:'Send UTF-8 text/plain or text/markdown'});
  let title:string;try{title=decodeURIComponent(String(req.headers['x-lore-title']||'Imported narrative')).trim();}catch{return res.status(400).json({error:'Invalid title encoding'});}if(!title||title.length>240)return res.status(400).json({error:'Title must contain 1–240 characters'});
  if(Number(req.headers['content-length'])>store.maxBytes)return res.status(413).json({error:'Import exceeds configured byte limit',maxBytes:store.maxBytes});
  const file=path.join(store.directory,'uploads',randomUUID()+'.pending');const fd=fs.openSync(file,'wx',0o600);let size=0,closed=false,failed=false;
  const close=()=>{if(!closed){fs.closeSync(fd);closed=true;}};const cleanup=()=>{close();if(fs.existsSync(file))fs.unlinkSync(file);};
  req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>store.maxBytes){failed=true;return;}try{fs.writeSync(fd,chunk);}catch{failed=true;}});
  req.on('aborted',cleanup);req.on('error',cleanup);req.on('end',()=>{if(failed){cleanup();return res.status(413).json({error:'Import exceeded byte limit or could not be written'});}try{fs.fsyncSync(fd);close();const job=store.enqueue(file,title,user.uid);res.status(202).json(job);}catch{cleanup();res.status(500).json({error:'Import could not be queued'});}});
 });return router;
}
