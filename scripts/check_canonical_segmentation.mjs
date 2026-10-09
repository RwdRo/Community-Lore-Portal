import fs from 'node:fs';

const source = JSON.parse(fs.readFileSync('server/data/loreDataset.json', 'utf8'));
const ts = fs.readFileSync('src/constants/canonicalLore.ts', 'utf8');
const start = ts.indexOf('= [') + 2;
const end = ts.lastIndexOf('];') + 1;
if (start < 2 || end <= start) {
  console.error('FAIL unable to locate canonical lore array');
  process.exit(1);
}

let canonical;
try {
  canonical = JSON.parse(ts.slice(start, end));
} catch (error) {
  console.error('FAIL canonicalLore.ts array is not parseable JSON:', error.message);
  process.exit(1);
}

if (canonical.length !== source.length) {
  console.error(`FAIL canonical segmentation count ${canonical.length} != source snapshot ${source.length}`);
  process.exit(1);
}

const ids = new Set();
for (let i = 0; i < source.length; i++) {
  const expected = String(source[i]?.content || '').trim();
  const actual = String(canonical[i]?.content || '').trim();
  if (actual !== expected) {
    console.error(`FAIL canonical record ${i + 1} does not match source narrative boundary: ${canonical[i]?.title || 'untitled'}`);
    process.exit(1);
  }
  const id = String(canonical[i]?.id || '');
  if (!id || ids.has(id)) {
    console.error(`FAIL duplicate or missing canonical id at record ${i + 1}: ${id}`);
    process.exit(1);
  }
  ids.add(id);
}

console.log(`Canonical segmentation passed (${canonical.length} source-aligned records).`);
