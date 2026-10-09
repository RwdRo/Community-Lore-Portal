import {getCanonRegistry} from '../server/canonRegistry';
import test from 'node:test';import assert from 'node:assert/strict';import {expeditionCatalog,expeditionBoard,startExpedition,completeExpedition,expeditionAction} from '../server/playerExpeditions';
const make=()=>({xp:0,discoveries:{story:{},entity:{},planet:{}},activity:[],expeditions:{}} as any);
test('evidence trails use different real works and require recorded sources before completion',()=>{const p=make(),m=expeditionCatalog()[0];assert.equal(new Set(m.sourceIds).size,2);startExpedition(p,m.id,1000);delete p.expeditions[m.id].version;assert.throws(()=>completeExpedition(p,m.id,m.answerSourceId,2000),/both source works/);assert.equal(p.xp,0);for(const id of m.sourceIds)p.discoveries.story[id]=1000;assert.equal(expeditionBoard(p).find(e=>e.id===m.id)!.ready,true);assert.equal(completeExpedition(p,m.id,'wrong-source',4000).correct,false);assert.equal(p.xp,0);assert.equal(completeExpedition(p,m.id,m.answerSourceId,8000).correct,true);assert.equal(p.xp,120);completeExpedition(p,m.id,m.answerSourceId,12000);assert.equal(p.xp,120);});
test('two active trails limit scope; forged trail identities fail',()=>{const p=make(),missions=expeditionCatalog();assert.throws(()=>startExpedition(p,'fake',1000),/Unknown/);startExpedition(p,missions[0].id,1000);startExpedition(p,missions[1].id,1000);assert.throws(()=>startExpedition(p,missions[2].id,1000),/Finish or abandon/);assert.ok(expeditionBoard(p).every(m=>!('answerSourceId' in m)));});
import {sourceStoryForId} from '../src/constants/sourceArchive';
test('every playable trail uses canonical source works and excludes proposal entities',()=>{for(const mission of expeditionCatalog()){assert.ok(!mission.entityId.startsWith('proposal-entity:'));assert.ok(mission.sourceIds.every(id=>!!sourceStoryForId(id)));}});

test('new investigations persist route choices and staged evidence with one final reward',()=>{
 const p=make(),m=expeditionCatalog()[0];startExpedition(p,m.id,1000);
 assert.equal(expeditionBoard(p).find(e=>e.id===m.id)!.stage,'route');
 assert.throws(()=>expeditionAction(p,m.id,'clue',m.clues[0].answerKey,2000),/route first/);
 assert.throws(()=>expeditionAction(p,m.id,'route','forged-source',2000),/Choose one/);
 expeditionAction(p,m.id,'route',m.sourceIds[1],2000);
 assert.equal(expeditionBoard(p).find(e=>e.id===m.id)!.objectives[0].id,m.sourceIds[1]);
 assert.throws(()=>completeExpedition(p,m.id,'shared-appearance',3000),/both field notes/);
 assert.equal(expeditionAction(p,m.id,'clue','forged-key',4000).correct,false);assert.equal(p.xp,0);
 assert.throws(()=>expeditionAction(p,m.id,'clue',m.clues[1].answerKey,5000),/moment/);
 assert.equal(expeditionAction(p,m.id,'clue',m.clues[1].answerKey,8000).correct,true);
 assert.throws(()=>expeditionAction(p,m.id,'route',m.sourceIds[0],8500),/locked/);
 const restored=JSON.parse(JSON.stringify(p));
 assert.equal(expeditionAction(restored,m.id,'clue',m.clues[0].answerKey,12000).correct,true);
 assert.equal(expeditionBoard(restored).find(e=>e.id===m.id)!.stage,'conclusion');
 assert.equal(completeExpedition(restored,m.id,'causation',16000).correct,false);assert.equal(restored.xp,0);
 assert.equal(completeExpedition(restored,m.id,'shared-appearance',20000).correct,true);assert.equal(restored.xp,120);
 completeExpedition(restored,m.id,'shared-appearance',24000);startExpedition(restored,m.id,25000);assert.equal(restored.xp,120);
 assert.deepEqual(restored.discoveries.story,{});assert.equal(expeditionBoard(restored).find(e=>e.id===m.id)!.stage,'complete');
});
test('client caseboard hides verification keys while retaining real quote choices',()=>{
 const p=make(),m=expeditionCatalog()[0];startExpedition(p,m.id,1000);const visible=expeditionBoard(p).find(e=>e.id===m.id)!;
 assert.ok(visible.clues.every(c=>!('answerKey' in c)&&c.options.length===3));
 for(const clue of m.clues)for(const option of clue.options)assert.ok(getCanonRegistry().entities.some(e=>e.evidence.some(v=>v.context===option.quote)));
});
