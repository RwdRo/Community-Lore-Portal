import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('server/data');
const jsonFiles = fs.readdirSync(dataDir).filter((name) => name.endsWith('.json')).sort();
let failed = false;

for (const name of jsonFiles) {
  const filePath = path.join(dataDir, name);
  const raw = fs.readFileSync(filePath, 'utf8');
  const controlMatch = raw.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  if (controlMatch) {
    console.error(`FAIL ${name}: contains an invalid control character at index ${controlMatch.index}`);
    failed = true;
    continue;
  }

  try {
    const parsed = JSON.parse(raw);
    if (name === 'pr_stories.json') {
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('expected an object keyed by GitHub pull-request ID');
      }
      for (const [id, story] of Object.entries(parsed)) {
        if (!/^\d+$/.test(id)) throw new Error(`invalid PR key: ${id}`);
        if (!story || typeof story !== 'object') throw new Error(`PR ${id} is not an object`);
        if (Number(story.pr_id) !== Number(id)) throw new Error(`PR ${id} has mismatched pr_id`);
        if (typeof story.content !== 'string' || !story.content.trim()) throw new Error(`PR ${id} has no narrative content`);
      }
    }
    console.log(`OK   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Validated ${jsonFiles.length} data files.`);
