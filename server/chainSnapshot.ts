export async function fetchTableSnapshot(endpoints:string[],query:Record<string,any>,fetcher:typeof fetch=fetch):Promise<any[]>{
 const deadline=Date.now()+15000;
 for(const endpoint of endpoints){
  try{
   const all:any[]=[];let cursor='';const seen=new Set<string>();
   for(let page=0;page<20;page++){
    if(Date.now()>=deadline)throw Error('Snapshot time budget exhausted.');
    const response=await fetcher(endpoint+'/v1/chain/get_table_rows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...query,...(cursor?{lower_bound:cursor}:{})}),signal:AbortSignal.timeout(Math.max(1,Math.min(6000,deadline-Date.now())))});
    if(!response.ok)throw Error('RPC request failed.');
    const data=await response.json();if(!Array.isArray(data.rows))throw Error('Invalid RPC rows.');
    all.push(...data.rows);
    if(!data.more)return all;
    const next=String(data.next_key||'');if(!next||seen.has(next))throw Error('Incomplete RPC pagination.');
    seen.add(next);cursor=next;
   }
  }catch{/* Discard the partial snapshot and try the next provider. */}
 }
 throw Error('Complete WAX table snapshot unavailable. Cached records retained.');
}