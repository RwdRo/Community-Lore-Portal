import fs from 'node:fs';

const requiredFiles = ['Dockerfile', '.dockerignore', 'docker-compose.yml', '.env.example'];
let failed = false;

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL missing ${file}`);
    failed = true;
  } else {
    console.log(`OK   ${file}`);
  }
}

const server = fs.readFileSync('server.ts', 'utf8');
if (!/process\.env\.PORT/.test(server)) {
  console.error('FAIL server.ts does not honor PORT'); failed = true;
} else console.log('OK   server.ts honors PORT');

const db = fs.readFileSync('server/db.ts', 'utf8');
if (!/process\.env\.DATA_DIR/.test(db)) {
  console.error('FAIL server/db.ts does not honor DATA_DIR'); failed = true;
} else console.log('OK   server/db.ts honors DATA_DIR');

const compose = fs.readFileSync('docker-compose.yml', 'utf8');
if (!/DATA_DIR:\s*\/app\/data/.test(compose) || !/\.\/data:\/app\/data/.test(compose)) {
  console.error('FAIL docker-compose.yml does not persist the SQLite data directory'); failed = true;
} else console.log('OK   Docker volume matches DATA_DIR');

const envExample = fs.readFileSync('.env.example', 'utf8');
for (const key of ['GITHUB_TOKEN', 'GITHUB_SYNC_ENABLED', 'GITHUB_SYNC_MAX_PER_CYCLE', 'GITHUB_SOURCE_TTL_HOURS', 'GITHUB_FAILURE_TTL_MINUTES', 'LEGACY_PR_SALVAGE_ENABLED']) {
  if (!new RegExp(`^${key}=`, 'm').test(envExample)) {
    console.error(`FAIL .env.example missing ${key}`); failed = true;
  } else console.log(`OK   .env.example declares ${key}`);
}
if (!/GITHUB_TOKEN:\s*\$\{GITHUB_TOKEN:-\}/.test(compose) || !/LEGACY_PR_SALVAGE_ENABLED:/.test(compose)) {
  console.error('FAIL docker-compose.yml does not pass narrative runtime configuration through'); failed = true;
} else console.log('OK   Docker Compose passes narrative runtime configuration');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.dependencies?.['@google/genai']) {
  console.error('FAIL unused @google/genai remains a root dependency'); failed = true;
} else console.log('OK   unused @google/genai removed from root dependencies');

if (pkg.dependencies?.['@wharfkit/wallet-plugin-wombat']) {
  console.error('FAIL deprecated Wombat wallet plugin remains a root dependency'); failed = true;
} else console.log('OK   deprecated Wombat wallet plugin removed');

const expectedWharfkit = {
  '@wharfkit/antelope': '1.1.1',
  '@wharfkit/session': '1.6.1',
  '@wharfkit/wallet-plugin-anchor': '1.6.1',
  '@wharfkit/wallet-plugin-cloudwallet': '1.6.2',
  '@wharfkit/web-renderer': '1.4.3',
};
for (const [name, version] of Object.entries(expectedWharfkit)) {
  if (pkg.dependencies?.[name] !== version) {
    console.error(`FAIL ${name} drifted from the known-good wallet stack (${version})`); failed = true;
  } else console.log(`OK   ${name} pinned to known-good declaration ${version}`);
}

const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

if (!/npm ci/.test(dockerfile) || !/package-lock\.json/.test(dockerfile)) {
  console.error('FAIL Docker must use the verified dependency lock'); failed = true;
}
if (!fs.existsSync('package-lock.json')) {
  console.error('FAIL missing dependency lock'); failed = true;
} else {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  for (const field of ['dependencies', 'devDependencies']) {
    const declared = pkg[field] || {};
    const locked = lock.packages?.['']?.[field] || {};
    if (Object.keys(declared).length !== Object.keys(locked).length ||
        Object.entries(declared).some(([name, version]) => locked[name] !== version)) {
      console.error('FAIL lockfile differs from package.json: ' + field); failed = true;
    }
  }
  for (const [name, version] of Object.entries(expectedWharfkit)) {
    if (lock.packages?.['node_modules/' + name]?.version !== version) {
      console.error('FAIL wallet resolution differs: ' + name); failed = true;
    }
  }
  console.log('Checked dependency declarations and frozen wallet resolutions.');
}

if (fs.existsSync('bun.lock')) {
  console.error('FAIL stale bun.lock is still shipped and may reintroduce removed wallet dependencies'); failed = true;
} else console.log('OK   stale bun.lock removed');

if (failed) process.exit(1);
console.log('Deployment guardrails passed.');
