import {pagesIdentity,getPagesIdentity,updatePagesProfile} from './pagesIdentity';
import {pagesPlayer,configurePagesPlayerIdentity} from './pagesPlayer';
import {pagesLore} from './pagesLore';
export const PAGES=(import.meta as any).env.VITE_PAGES!=='false';
export const REPO='https://github.com/RwdRo/Community-Lore-Portal';
export function openSubmission(title:string,content:string){
 if(content.length>5000){const url=URL.createObjectURL(new Blob([content],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='lore-manuscript.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const body=content.length>5000?content.slice(0,5000)+'\n\n[Attach the complete manuscript file before submitting.]':content;
 window.open(REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body),'_blank','noopener,noreferrer');
}
async function localApi(path:string,body?:any){
 if(path.startsWith('auth/'))return pagesIdentity(path,body);
 if(path==='player'||path.startsWith('player/')){const user=getPagesIdentity();if(!user)throw Error('Create a local explorer profile first.');configurePagesPlayerIdentity(user.uid);return pagesPlayer(path,body);}
 if(path.startsWith('canon/')||path.startsWith('corpus/'))return pagesLore(path);
 if(path.startsWith('analytics/'))return {success:true,data:null};
 if(path.startsWith('app/documents/')){const [, ,collection,id]=path.split('/');const user=getPagesIdentity();const document=collection==='users'&&user&&(!id||decodeURIComponent(id)===user.uid)?{id:user.uid,data:user,version:1}:null;return id?{document}:{documents:document?[document]:[]};}
 if(path==='app/batch'){const user=getPagesIdentity();if(!user)throw Error('Connect your local profile first.');for(const op of body.operations||[]){if(op.collection!=='users'||op.id!==user.uid)throw Error('Shared contributions are submitted through GitHub.');updatePagesProfile(op.data||{});}return {success:true};}
 throw Object.assign(Error('This action uses GitHub submissions in the Pages edition.'),{status:400});
}
export async function portalFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 if(!PAGES)return window.fetch(input,init);
 const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return window.fetch(input,init);
 try{const body=init?.body?JSON.parse(String(init.body)):undefined;const result=await localApi(url.pathname.slice(5)+url.search,body);return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});}catch(e:any){return new Response(JSON.stringify({error:e.message}),{status:e.status||400,headers:{'Content-Type':'application/json'}});}
}
