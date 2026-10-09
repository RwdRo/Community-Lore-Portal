import fs from 'node:fs';
fs.mkdirSync('public/assets', { recursive: true });
for (const name of fs.readdirSync('assets')) {
  if (/\.png$/i.test(name)) fs.copyFileSync('assets/' + name, 'public/assets/' + name);
}
console.log('Copied existing planet and community artwork to the public build.');
