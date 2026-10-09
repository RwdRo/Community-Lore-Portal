import {portalFetch as fetch} from './pagesRuntime';
export const db = {};
export interface User {uid:string;displayName:string;role:string;email?:string;isAnonymous?:boolean;photoURL?:string}
export const auth:{currentUser:User|null}={currentUser:null};
const listeners=new Set<(u:User|null)=>void>();
export async function api(path:string,body?:any){
 const response=await fetch('/api/'+path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Loreworks':'1'},body:JSON.stringify(body)})});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.error||'Request failed'),{status:response.status});
 return result;
}
export async function refreshIdentity(){
 const {user}=await api('auth/session');auth.currentUser=user;listeners.forEach(fn=>fn(user));window.dispatchEvent(new Event('loreworks-data'));return user;
}
export function onAuthStateChanged(_:any,callback:(u:User|null)=>void){
 listeners.add(callback);api('auth/session').then(({user})=>{auth.currentUser=user;if(listeners.has(callback))callback(user);}).catch(()=>{if(listeners.has(callback))callback(null);});
 return ()=>{listeners.delete(callback);};
}
export async function signOut(_:any){await api('auth/logout',{});auth.currentUser=null;listeners.forEach(fn=>fn(null));window.dispatchEvent(new Event('loreworks-data'));}
export const serverTimestamp=()=>({seconds:Math.floor(Date.now()/1000),nanoseconds:0});
type Ref={collection:string;id?:string;constraints?:any[]};
export const collection=(_:any,name:string):Ref=>({collection:name});
export function doc(...args:any[]):Ref{return args.length===1?{...args[0],id:crypto.randomUUID()}:{collection:args[1],id:args[2]};}
export const where=(field:string,op:string,value:any)=>({field,op,value});
export const orderBy=(field:string,direction='asc')=>({sort:field,direction});
export const limit=(count:number)=>({count});
export const query=(ref:Ref,...constraints:any[]):Ref=>({...ref,constraints});
const snap=(d:any)=>({id:d?.id,exists:()=>!!d,data:()=>d?.data,version:d?.version||0});
export async function getDoc(ref:Ref){return snap((await api('app/documents/'+ref.collection+'/'+encodeURIComponent(ref.id!))).document);}
export async function getDocs(ref:Ref){
 let rows=(await api('app/documents/'+ref.collection)).documents;
 for(const c of ref.constraints||[]){
  if(c.field)rows=rows.filter((r:any)=>c.op==='=='?r.data[c.field]===c.value:c.op==='in'?c.value.includes(r.data[c.field]):false);
  if(c.sort)rows.sort((a:any,b:any)=>{const av=a.data[c.sort]?.seconds??a.data[c.sort],bv=b.data[c.sort]?.seconds??b.data[c.sort];return (av>bv?1:av<bv?-1:0)*(c.direction==='desc'?-1:1);});
  if(c.count)rows=rows.slice(0,c.count);
 }
 const docs=rows.map(snap);return {docs,forEach:(f:any)=>docs.forEach(f),empty:!docs.length,size:docs.length};
}
export function onSnapshot(ref:Ref,callback:any,onError?:(e:any)=>void){
 let live=true,busy=false;
 const load=async()=>{if(busy||!live)return;busy=true;try{const s=await getDocs(ref);if(live)callback(s);}catch(e){if(live)onError?.(e);}finally{busy=false;}};
 load();const timer=setInterval(load,15000);window.addEventListener('loreworks-data',load);
 return()=>{live=false;clearInterval(timer);window.removeEventListener('loreworks-data',load);};
}
async function write(operations:any[],reads:any[]=[]){await api('app/batch',{operations,reads});window.dispatchEvent(new Event('loreworks-data'));}
export const setDoc=(ref:Ref,data:any)=>write([{...ref,mode:'set',data}]);
export const updateDoc=(ref:Ref,data:any)=>write([{...ref,mode:'update',data}]);
export const deleteDoc=(ref:Ref)=>write([{...ref,mode:'delete'}]);
export async function addDoc(ref:Ref,data:any){const id=crypto.randomUUID();await setDoc({...ref,id},data);return {id};}
export async function runTransaction(_:any,callback:any){
 for(let attempt=0;attempt<3;attempt++){
  const operations:any[]=[],reads:any[]=[];
  const tx={get:async(ref:Ref)=>{const s=await getDoc(ref);reads.push({...ref,version:s.version});return s;},
   set:(ref:Ref,data:any)=>operations.push({...ref,mode:'set',data}),
   update:(ref:Ref,data:any)=>operations.push({...ref,mode:'update',data}),
   delete:(ref:Ref)=>operations.push({...ref,mode:'delete'})};
  await callback(tx);try{await write(operations,reads);return;}catch(e:any){if(e.status!==409||attempt===2)throw e;}
 }
}
