import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {createHash} from 'node:crypto';
process.env.APP_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'loreworks-admin-'));
const {updateApplication,readApplication}=await import('../server/applicationStore');
const {applicationRouter}=await import('../server/applicationApi');
const {apiErrors,sameOriginWrites}=await import('../server/requestSecurity');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
test('administrator role changes reject anonymous, reader, and self promotion; revoke target sessions',async()=>{
 updateApplication(s=>{
  for(const [uid,role] of [['admin','scribe'],['reader','reader']]){
   s.documents.users[uid]={uid,displayName:uid,role};
   s.sessions[hash(uid)]={uid,expires:Date.now()+60000};
  }
 });
 const app=express();app.use(express.json());app.use(sameOriginWrites);app.use(applicationRouter());app.use(apiErrors);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+(server.address() as any).port+'/batch';
 async function change(actor:string,id:string,role:string){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Loreworks':'1',Cookie:'lw_session='+actor},body:JSON.stringify({operations:[{collection:'users',id,mode:'update',data:{role}}]})});}
 try{
  assert.equal((await change('','reader','scribe')).status,401);
  assert.equal((await change('reader','reader','scribe')).status,403);
  assert.equal((await change('admin','admin','reader')).status,403);
  assert.equal((await change('admin','reader','scribe')).status,200);
  assert.equal(readApplication().documents.users.reader.role,'scribe');
  assert.equal(readApplication().sessions[hash('reader')],undefined);
  assert.ok(readApplication().sessions[hash('admin')]);
 }finally{server.close();}
});
