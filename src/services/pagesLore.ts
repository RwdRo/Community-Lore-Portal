/** Read-only API compatibility for a static GitHub Pages build. No server modules or private data. */
const cached=new Map<string,Promise<any>>();
const base=()=>((import.meta as any).env?.BASE_URL||'/')+'pages-data/';
async function read(file:string){if(!cached.has(file))cached.set(file,fetch(base()+file).then(async r=>{if(!r.ok)throw Object.assign(Error('Published lore data is unavailable.'),{status:r.status});return r.json();}).catch(e=>{cached.delete(file);throw e;}));return cached.get(file)!;}
const fail=(message:string,status=404):never=>{throw Object.assign(Error(message),{status});};
const terms=(s:string)=>[...new Set(s.toLocaleLowerCase('en').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{1,63}/gu)||[])].slice(0,12);
const page=(u:URL)=>({offset:Math.max(0,Math.min(1000000,Math.floor(Number(u.searchParams.get('offset'))||0))),limit:Math.max(1,Math.min(100,Math.floor(Number(u.searchParams.get('limit'))||25)))});
export async function pagesLore(requestPath:string):Promise<any>{
 const url=new URL(requestPath.replace(/^\/api\//,''),'https://static.invalid/');const parts=url.pathname.replace(/^\//,'').split('/').map(decodeURIComponent);const {offset,limit}=page(url);
 if(parts[0]==='canon'){
  if(parts[1]==='registry'&&parts.length===2)return read('registry.json');
  if(parts[1]==='registry'||parts[1]==='registry-source'){const manifest=await read('manifest.json'),files=parts[1]==='registry'?manifest.entities:manifest.records;const file=files[parts[2]];return file?read(file):fail('Published source or entity not found.');}
  if(parts[1]==='proposals'){let {data}=await read('proposals.json');if(parts[2]){const value=data.find((p:any)=>p.id===parts[2]||String(p.pull_request_id)===parts[2]);return value?{data:value}:fail('Published proposal not found.');}const q=url.searchParams.get('query')?.toLowerCase();if(q)data=data.filter((p:any)=>(p.title+' '+p.content).toLowerCase().includes(q));for(const key of ['status','proposer','planet']){const value=url.searchParams.get(key);if(value)data=data.filter((p:any)=>String(p[key])===value||p.status_label===value);}return {data,readOnly:true,governanceAvailable:false};}
  if(parts[1]==='telemetry')return {data:null,available:false,reason:'Live governance is unavailable in this published archive.'};
  if(parts[1]==='graph')return {data:{nodes:[],links:[]},available:false};
  if(['events','planets','actions','activity'].includes(parts[1]))return {data:[],available:false};
 }
 if(parts[0]==='corpus'){
  if(parts[1]==='sources'&&parts.length===2){const data=await read('corpus-sources.json');let all=data.sources;const q=url.searchParams.get('q')?.toLowerCase(),scope=url.searchParams.get('scope');if(q)all=all.filter((s:any)=>s.title.toLowerCase().includes(q));if(scope)all=all.filter((s:any)=>s.scope===scope);return {...data,total:all.length,sources:all.slice(offset,offset+limit)};}
  if(parts[1]==='sources'&&parts[2]){const manifest=await read('manifest.json'),file=manifest.corpus[parts[2]];if(!file)return fail('Published corpus source not found.');const data=await read(file);if(parts[3]==='sections')return {total:data.sections.length,sections:data.sections.slice(offset,offset+limit)};return data.source;}
  if(parts[1]==='search'){const tokens=terms((url.searchParams.get('q')||'').slice(0,500));if(!tokens.length)return {total:0,results:[]};const [index,catalog]=await Promise.all([read('corpus-search.json'),read('corpus-sources.json')]);let matches:number[]=index.postings[tokens[0]]||[];for(const token of tokens.slice(1)){const ids=new Set(index.postings[token]||[]);matches=matches.filter(id=>ids.has(id));}const sources=new Map(catalog.sources.map((s:any)=>[s.id,s]));return {total:matches.length,results:matches.slice(offset,offset+limit).map(id=>({...index.rows[id],source:sources.get(index.rows[id].sourceId)}))};}
  if(['imports','jobs'].includes(parts[1]))return fail('Imports require the hosted server. This published archive is read-only.',405);
 }
 return fail('This operation is unavailable in the published archive.',404);
}
