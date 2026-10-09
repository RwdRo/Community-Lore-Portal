import { parseLoreContent } from '../src/constants/loreParser';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { readApplication, updateApplication, type State } from './applicationStore';
import { getAuthenticatedUser } from './authentication';
const collections=new Set(['users','lore','comments','votes','bounties','activity']);
const now=()=>({seconds:Math.floor(Date.now()/1000),nanoseconds:0});
const fail=(message:string,status=403)=>{throw Object.assign(new Error(message),{status});};
const safe=(value:any,max=500)=>typeof value==='string' ? value.trim().slice(0,max) : '';
const keys=(value:any,allowed:string[])=>Object.keys(value).every(k=>allowed.includes(k));
function publicDoc(collection:string,id:string,data:any,user:any) {
  if(collection==='votes' && data.userId!==user?.uid && user?.role!=='scribe') return null;
  if(collection==='comments' && data.status!=='approved' && data.userId!==user?.uid && user?.role!=='scribe') return null;
  if(collection==='lore' && data.status==='draft' && data.authorId!==user?.uid && user?.role!=='scribe') return null;
  if(collection==='users' && user?.uid!==id && user?.role!=='scribe') {
    const {uid,displayName,role,bio,avatarUrl,waxAccount,reputation,rank}=data;
    return {id,data:{uid,displayName,role,bio,avatarUrl,waxAccount,reputation,rank},version:data._version||0};
  }
  return {id,data,version:data._version||0};
}
function apply(s:State,operation:any,user:any) {
  const {collection,id,mode}=operation;
  if(!collections.has(collection)||typeof id!=='string'||['__proto__','constructor','prototype'].includes(id)||!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) fail('Invalid record.',400);
  if(!['set','update','delete'].includes(mode)) fail('Invalid operation.',400);
  const records=s.documents[collection], old=Object.hasOwn(records,id)?records[id]:undefined;
  const admin=user.role==='scribe';
  const data=operation.data || {};
  if(!data || typeof data!=='object'||Array.isArray(data)) fail('Invalid fields.',400);
  if(mode==='delete'){
    if(!admin && !(collection==='comments' && old?.userId===user.uid)) fail('Not permitted.');
    if(collection==='users'||collection==='votes') fail('Use the account or voting workflow.');
    delete records[id]; return;
  }
  let value={...old,...data};
  if(collection==='users'){
    if(!old || (!admin && id!==user.uid)) fail('Not permitted.');
    const mutable=['displayName','bio','avatarUrl','bookmarks','following'];
    for(const [key,v] of Object.entries(data)) {
      if(!mutable.includes(key) && !(admin && ['role','reputation','rank','title'].includes(key)) &&
         JSON.stringify(v)!==JSON.stringify(old[key])) fail('Protected profile field: '+key);
    }
    if(data.role && !['reader','skiv','skribus','scribe'].includes(data.role)) fail('Invalid role.',400);
    if (data.role && data.role !== old.role) {
      if (id === user.uid) fail('You cannot change your own administrator role. Ask another administrator.');
      if (old.role === 'scribe' && Object.values(s.documents.users).filter((u:any) => u.role === 'scribe').length <= 1) fail('The last administrator cannot be removed.');
      for (const [key, session] of Object.entries(s.sessions)) if (session.uid === id) delete s.sessions[key];
    }
    if(admin && data.role && id!==user.uid) delete value.walletAdminGrant;
    value.displayName=safe(value.displayName,60);
    value.bio=safe(value.bio,2000);
    if(!value.displayName) fail('Display name is required.',400);
    for(const field of ['bookmarks','following']) if(value[field] && (!Array.isArray(value[field])||value[field].length>2000||value[field].some((x:any)=>typeof x!=='string'||x.length>160))) fail('Invalid profile list.',400);
    if(value.avatarUrl && !/^https:\/\//.test(value.avatarUrl)) fail('Avatar must use HTTPS.',400);
  } else if(collection==='lore') {
    if(old && !admin && old.authorId!==user.uid) fail('Not permitted.');
    if(!old){
      if (/^(canon_|source_|lore_worlds_|onchain_|entity:|candidate:)/.test(id)) fail('Reserved source identity.',400);
      const parsed = parseLoreContent(String(data.content || ''));
      const fields = ['title','content','category','imageUrl','sourceUrl','requiredNFT'];
      const submission = Object.fromEntries(fields.filter(key => data[key] !== undefined).map(key => [key,data[key]]));
      value={...submission,...parsed,authorId:user.uid,authorName:user.displayName,waxAccount:user.waxAccount||null,type:'proposed',status:'in-vote',voteCount:0,createdAt:now()};
    } else if(!admin && (value.type!==old.type || value.status!==old.status || value.authorId!==old.authorId || value.voteCount!==old.voteCount)) fail('Protected lore state.');
    value.title=safe(value.title,300); value.content=safe(value.content,70000);
    if(!value.title||!value.content) fail('Title and narrative are required.',400);
    if(!['General','Species','Technology','Planets','Factions','History'].includes(value.category)) fail('Invalid category.',400);
    for(const field of ['sourceUrl','imageUrl']) if(value[field] && !/^https?:\/\//.test(value[field])) fail('Invalid URL.',400);
    // Community moderation does not add records to the authoritative canon registry.
    for (const reserved of ['onChain','proposal_id','pull_request_id','narrative_source_status','narrative_source_sha256']) delete value[reserved];
    Object.assign(value,parseLoreContent(value.content));
    value.type='proposed';
    value.provenance='community-submission';
  } else if(collection==='comments') {
    if(old && !admin && old.userId!==user.uid) fail('Not permitted.');
    if(!old) value={loreEntryId:safe(data.loreEntryId,160),userId:user.uid,userName:user.displayName,text:safe(data.text,8000),status:admin?'approved':'pending',createdAt:now()};
    else if(!admin && (value.userId!==old.userId || value.loreEntryId!==old.loreEntryId || value.status!==old.status)) fail('Protected comment field.');
    if(!value.text || !value.loreEntryId || !['pending','approved','rejected'].includes(value.status)) fail('Invalid comment.',400);
  } else if(collection==='bounties') {
    if(!admin) {
      if(!old || old.status!=='open' || data.status!=='claimed' || data.claimantId!==user.uid ||
        !keys(data,['status','claimantId','claimantName','claimantWaxAccount','claimedAt'])) fail('This bounty cannot be claimed.');
      value={...old,status:'claimed',claimantId:user.uid,claimantName:user.displayName,claimantWaxAccount:user.waxAccount||null,claimedAt:now()};
    } else if(!old) value={...data,authorId:user.uid,createdAt:now()};
    if(!safe(value.title,300)||!safe(value.description,8000)) fail('Bounty title and description required.',400);
  } else if(collection==='activity') {
    if(old || !['new_lore','new_comment','new_bounty','follow','bounty_claimed',...(admin?['lore_accepted']:[])].includes(data.type)) fail('Invalid activity.');
    value={type:data.type,userId:user.uid,userName:user.displayName,targetId:safe(data.targetId,160),targetTitle:safe(data.targetTitle,300),createdAt:now()};
  } else fail('Use the voting endpoint.');
  value._version=(old?._version||0)+1;
  records[id]=value;
}
export function applicationRouter(){
 const router=Router();
 router.get('/documents/:collection',(req,res)=>{
   const c=String(req.params.collection);if(!collections.has(c)) return res.status(404).json({error:'Unknown collection.'});
   const user=getAuthenticatedUser(req);
   res.json({documents:Object.entries(readApplication().documents[c]).map(([id,d])=>publicDoc(c,id,d,user)).filter(Boolean).slice(0,5000)});
 });
 router.get('/documents/:collection/:id',(req,res)=>{
   const c=String(req.params.collection),id=String(req.params.id);
   if(!collections.has(c)) return res.status(404).json({error:'Unknown collection.'});
   const data=readApplication().documents[c][id];res.json({document:data?publicDoc(c,id,data,getAuthenticatedUser(req)):null});
 });
 router.post('/batch',(req,res,next)=>{
   try{
     const user=getAuthenticatedUser(req);if(!user)return res.status(401).json({error:'Sign in to continue.'});
     const {operations,reads=[]}=req.body;
     if(!Array.isArray(operations)||operations.length>20||!Array.isArray(reads)||reads.length>40)fail('Invalid batch.',400);
     updateApplication(s=>{
       for(const r of reads)if(!collections.has(r.collection)||(s.documents[r.collection][r.id]?._version||0)!==r.version)fail('Record changed. Retry.',409);
       for(const operation of operations)apply(s,operation,user);
     });res.json({success:true});
   }catch(e){next(e);}
 });
 router.post('/vote',(req,res,next)=>{
   try{
     const user=getAuthenticatedUser(req);if(!user)return res.status(401).json({error:'Sign in to vote.'});
     const {loreId,type}=req.body;if(typeof loreId!=='string'||!['up','down'].includes(type))fail('Invalid vote.',400);
     updateApplication(s=>{
       const lore=Object.hasOwn(s.documents.lore,loreId)?s.documents.lore[loreId]:null;if(!lore)fail('Community submission not found.',404);
       const id=user.uid+'_'+loreId,old=s.documents.votes[id];
       if(old?.voteType===type)delete s.documents.votes[id];
       else s.documents.votes[id]={userId:user.uid,loreEntryId:loreId,voteType:type,createdAt:now()};
       lore.voteCount=Object.values(s.documents.votes).filter((v:any)=>v.loreEntryId===loreId).reduce((n:number,v:any)=>n+(v.voteType==='up'?1:-1),0);
       lore._version=(lore._version||0)+1;
     });res.json({success:true});
   }catch(e){next(e);}
 });
 return router;
}
