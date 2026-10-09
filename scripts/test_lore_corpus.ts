import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {LoreCorpusStore,parseCorpusSections} from '../server/loreCorpus';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lore-corpus-test-'));
const fixture='\ufeff<h1 class="title">Exact\nTitle</h1>\r\nIntro é世界.\r\n## Chapter α\r\nVelgemmis and Elgem.\r\n### Child\r\n'+('🌌 café 世界 continuity. '.repeat(7000))+'\r\n```md\n# Not a heading\n<h2>Not HTML heading</h2>\n```\n## Final\nLast evidence.';
const sections=parseCorpusSections(fixture);assert.equal(sections.map(s=>fixture.slice(s.start,s.end)).join(''),fixture);assert.equal(sections[0].start,0);assert.equal(sections.at(-1)!.end,fixture.length);
assert.ok(sections.some(s=>s.heading==='Exact\nTitle'));assert.ok(sections.some(s=>s.heading==='Child'&&s.ancestry.includes('Chapter α')));assert.ok(!sections.some(s=>s.heading.includes('Not a heading')||s.heading==='Not HTML heading'));
for(const s of sections){assert.equal(s.hash,hash(fixture.slice(s.start,s.end)));assert.ok(s.end-s.start<=8192);assert.ok(!/[\uD800-\uDBFF]$/.test(fixture.slice(s.start,s.end)));}
const store=new LoreCorpusStore(dir,1024*1024);const source=store.ingest(Buffer.from(fixture),{sourceId:'exact',title:'Exact source',scope:'proposed',provenance:{fixture:true}});assert.equal(store.raw(source.id),fixture);assert.equal(source.hash,hash(Buffer.from(fixture)));assert.ok(source.taxonomy?.some(t=>t.name==='Velgemmis'));
assert.equal(store.ingest(Buffer.from(fixture),{sourceId:'exact',title:'Ignored replacement',scope:'proposed',provenance:{}}).id,source.id);
assert.ok(store.search('café 世界').total>10);assert.equal(store.search('café 世界',1,2).results.length,2);assert.equal(store.search('nonexistentterm').total,0);
const restarted=new LoreCorpusStore(dir,1024*1024);assert.equal(restarted.raw(source.id),fixture);assert.equal(restarted.search('café 世界').total,store.search('café 世界').total);
assert.throws(()=>store.ingest(Buffer.alloc(1024*1024+1),{sourceId:'large',title:'large',scope:'proposed',provenance:{}}),/limit/);assert.throws(()=>store.ingest(Buffer.from([0xff]),{sourceId:'invalid',title:'invalid',scope:'proposed',provenance:{}}));
const jobId=randomUUID();fs.writeFileSync(path.join(dir,'uploads',jobId+'.utf8'),'# Restored\nOriginal Unicode café.');fs.writeFileSync(path.join(dir,'jobs',jobId+'.json'),JSON.stringify({id:jobId,state:'running',title:'Restored upload',userId:'test-scribe',createdAt:new Date().toISOString()}));restarted.resume();await new Promise(r=>setTimeout(r,50));assert.equal(restarted.job(jobId)?.state,'complete');const imported=restarted.source(restarted.job(jobId)!.sourceId!)!;assert.equal(imported.scope,'proposed');
fs.appendFileSync(path.join(dir,'sources',source.id,'raw.utf8'),'damage');assert.throws(()=>store.raw(source.id),/integrity/);
console.log('Corpus: exact raw bytes, hierarchy, Unicode long chunks/search, persistence, resumed jobs, limits, corruption checks passed.');
// The OS temp fixture remains available for investigation; no recursive deletion.
