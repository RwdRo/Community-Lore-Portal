import fs from 'node:fs';
import path from 'node:path';
const failures=[];
for(const file of ['firebase-applet-config.json','firebase-blueprint.json','firestore.indexes.json','firestore.rules','src/firebase.ts']) if(fs.existsSync(file)) failures.push(`Obsolete integration file: ${file}`);
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
for(const name of Object.keys(lock.packages||{})) if(/(?:^|node_modules\/)(?:firebase(?:\/|$)|@firebase\/|@google\/genai(?:\/|$)|google-auth-library(?:\/|$))/.test(name)) failures.push(`Google SDK: ${name}`);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=[...walk('src'),...walk('shared'),...walk('server'),...walk('public'),'server.ts','index.html','vite.config.ts'];
if(fs.existsSync('dist/client')) files.push(...walk('dist/client'));
if(fs.existsSync('dist/server.cjs')) files.push('dist/server.cjs');
const blocked=/(?:^|\.)(?:google\.[a-z.]+|googleapis\.com|gstatic\.com|firebaseapp\.com|firebasestorage\.app|firebaseio\.com|googletagmanager\.com|google-analytics\.com|recaptcha\.net)$/i;
for(const file of files){
 if(!/\.(?:[cm]?[jt]sx?|css|html)$/.test(file))continue;
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/https?:\/\/[^\s"'<>`\\)]+/g)){
  try{if(blocked.test(new URL(match[0]).hostname))failures.push(`Google service URL in ${file}: ${match[0].slice(0,160)}`);}catch{}
 }
 if(/(?:from\s*|import\s*\(|require\s*\()\s*['"](?:firebase|@firebase|@google\/genai)(?:[/'"])/.test(source))failures.push(`Google SDK import: ${file}`);
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Google independence checks passed: obsolete files absent; dependency lock and ${files.length} source/asset paths checked. External wallet-provider pages are outside this check.`);
