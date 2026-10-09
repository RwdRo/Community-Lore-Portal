import assert from 'node:assert/strict';
import {buildRegistry,getCanonRegistry,getCanonDiscovery,getRegistryRecords,supplementaryRegistrySources} from '../server/canonRegistry';
const fixture=(id:string,content:string,type='canon')=>({id,title:id,content,type,status:'active',tags:[],authorName:'Fixture'});
const r=buildRegistry([fixture('one','The Veilwalkers crossed the Thunder Peaks on Velgemmis. Khaureds are native to Khaur. Captain Joyce Astrid said hello. She left.'),fixture('two','She waited. KavTech maintained a facility on Kavian.','proposed')]);
const tribe=r.entities.find(e=>e.name==='Veilwalkers')!;assert.equal(tribe.type,'factions');assert.equal(tribe.classification,'Elgem tribe');assert.equal(tribe.scope,'canon');
const proposal=r.entities.find(e=>e.name==='KavTech')!;assert.equal(proposal.scope,'proposal');assert.match(proposal.id,/^proposal-entity:/);
assert.equal(buildRegistry([fixture('collision','Khaureds appeared.')]).entities.some(e=>e.name==='Khaur'),false);
for(const e of r.entities)for(const v of e.evidence){const body=v.sourceId==='one'?'The Veilwalkers crossed the Thunder Peaks on Velgemmis. Khaureds are native to Khaur. Captain Joyce Astrid said hello. She left.':'She waited. KavTech maintained a facility on Kavian.';assert.equal(body.slice(v.start,v.end),v.quote);assert.match(v.sourceHash,/^[a-f0-9]{64}$/);}
for(const e of r.entities)assert.ok(e.references.every(ref=>ref.sourceId!=='two'),'Pronouns must not leak across stories');
const all=getCanonRegistry();assert.ok(all.entities.some(e=>e.name==='Veilwalkers'&&e.scope==='canon'));assert.ok(all.entities.some(e=>e.name==='Planet B.'&&e.scope==='proposal'));assert.equal(getCanonDiscovery('proposal-entity:planets:planet-b'),undefined);
for(const e of all.entities)for(const v of e.evidence)assert.ok(all.sources.some(s=>s.id===v.sourceId&&s.hash===v.sourceHash));
console.log(JSON.stringify({sources:all.sources.length,entities:all.entities.length,documented:all.entities.filter(e=>e.state==='source-mention').length,types:[...new Set(all.entities.map(e=>e.type))]}));
assert.equal(all.entities.find(e=>e.name==='WAXbits')?.type,'creatures','Animal population is not a playable species');
assert.equal(all.entities.find(e=>e.name==='Zarithon Prime')?.type,'locations','Ecumenopolis reference alone does not establish a planet');
assert.equal(buildRegistry([fixture('nonsense','The Grand Purple Cloud stood silently.')]).entities.some(e=>e.state==='source-mention'),false,'Capitalized text is not confirmed taxonomy');
assert.equal(all.entities.find(e=>e.name==='Nordic')?.classification,'Human branch');
assert.equal(all.entities.find(e=>e.name==='Hodlodytes')?.classification,'Documented population');

const cradle=getRegistryRecords().find(s=>s.id==='github_pr_85');assert.ok(cradle,'Merged Cradle narrative absent from main README remains discoverable');assert.equal(cradle.type,'proposed');assert.ok(cradle.content.length>40000);assert.ok(all.sources.some(s=>s.id===cradle.id&&s.scope==='proposal'));
const supplemental=(content:string,id:number)=>({pr_id:id,content,title:'Same title',status:'resolved',source_kind:'verified_git_merge_diff'});
assert.deepEqual(supplementaryRegistrySources([{content:'Full canon body\n'}],[supplemental('Full canon body\r\n',1),supplemental('Different complete source version',2)]).map(p=>p.pr_id),[2],'Exact complete containment excludes duplicates; title collisions preserve distinct versions');
