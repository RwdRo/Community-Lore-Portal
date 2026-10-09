import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const run=(script,args=[])=>execFileSync(process.execPath,[script,...args],{stdio:'inherit',env:{...process.env,VITE_PAGES:'true'}});
run('scripts/sync_public_assets.mjs');run('node_modules/tsx/dist/cli.mjs',['scripts/export_pages.ts']);run('node_modules/vite/bin/vite.js',['build']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk('dist/client'))if(/\.(js|css|html)$/.test(file)){let text=fs.readFileSync(file,'utf8');text=text.replaceAll('"/assets/','"./assets/').replaceAll("'/assets/","'./assets/").replaceAll('"/asset-unavailable.svg','"./asset-unavailable.svg');fs.writeFileSync(file,text);}
fs.writeFileSync('dist/client/.nojekyll','');
