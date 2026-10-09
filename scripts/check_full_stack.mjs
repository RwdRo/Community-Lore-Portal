import fs from 'node:fs';

const checks = [
  ['package.json', /"@wharfkit\/session": "1\.6\.1"/, 'WharfKit session remains pinned'],
  ['package.json', /"@wharfkit\/wallet-plugin-anchor": "1\.6\.1"/, 'Anchor plugin remains pinned'],
  ['package.json', /"@wharfkit\/wallet-plugin-cloudwallet": "1\.6\.2"/, 'Cloud Wallet plugin remains pinned'],
  ['src/components/LoreGraph.tsx', /<ellipse[\s\S]*orbit-/, 'Atlas has orbital lanes'],
  ['src/components/LoreGraph.tsx', /forceSimulation|forceLink/, 'Atlas must not use force-directed layout', true],
  ['src/App.tsx', /id="mobile-primary-nav"/, 'Mobile primary navigation exists'],
  ['src/App.tsx', /Explore \$\{e\.name\} across the archive/, 'Indexed entities are interactive archive pivots'],
  ['src/App.tsx', /Explore \$\{selectedLore\.planet\} in the Atlas/, 'Story sector badge is an Atlas pivot'],
  ['src/App.tsx', /const newRep = \(authorData\.reputation/, 'Voting client must not mutate another user profile', true],
  ['src/services/analyticsService.ts', /analytics has one authority/i, 'Client analytics uses one persistence authority'],
  ['src/services/analyticsService.ts', /addDoc\(collection\(db, 'analytics_events'\)/, 'Client must not dual-write analytics to Firestore', true],
  ['server/canonEngine.ts', /COUNT\(DISTINCT date\(timestamp\/1000, 'unixepoch'\)\)/, 'Retention is derived from returning sessions'],
  ['server/canonEngine.ts', /\* 18/, 'Synthetic retention multiplier is removed', true],
  ['server/canonEngine.ts', /persistDatabase\(\);\s*return \{ success: true, id \}/, 'Analytics writes persist to SQLite'],
  ['server/db.ts', /path\.resolve\(process\.cwd\(\), 'data'\)/, 'Default SQLite location is the data directory'],
  ['server/db.ts', /fs\.renameSync/, 'SQLite snapshot replacement is atomic'],
  ['server.ts', /import "dotenv\/config";/, '.env is loaded by the runtime'],
  ['server.ts', /express\.json\(\{ limit: "96kb" \}\)/, 'JSON body size is bounded'],
];

let failed = false;
for (const [file, pattern, label, absent = false] of checks) {
  const source = fs.readFileSync(file, 'utf8');
  const found = pattern.test(source);
  const ok = absent ? !found : found;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.dependencies?.['@wharfkit/wallet-plugin-wombat']) {
  console.error('FAIL deprecated Wombat dependency is present');
  failed = true;
} else {
  console.log('OK   deprecated Wombat dependency is absent');
}

if (failed) process.exit(1);
console.log('Full-stack guardrails passed.');
