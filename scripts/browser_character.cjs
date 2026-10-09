const {chromium}=require('C:/Users/RED/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.PLAYER_TEST_URL||'http://localhost:3112');
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await page.getByRole('button',{name:'New explorer? Create an account'}).click();
 await page.getByLabel('Username',{exact:true}).fill('characterqa'+Date.now());
 await page.getByLabel('Password',{exact:true}).fill('character-audit-local-test-password');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByLabel('Character name',{exact:true}).fill('Source Trail Explorer');
 const registry=await page.evaluate(async()=>await(await fetch('/api/canon/registry')).json());
 const choices={};
 for(const [field,type,label] of [['species','species','Species'],['homeworld','planets','Homeworld'],['affiliation','factions','Organization affinity']]){
  const options=registry.entities.filter(e=>e.state==='source-mention'&&e.scope!=='proposal'&&e.type===type);const choice=options[1];assert.ok(choice,'at least two '+field+' choices');choices[field]=choice.name;
  const group=page.getByRole('group',{name:new RegExp('^'+label+' ·')});
  await group.getByRole('button').filter({hasText:new RegExp('^'+choice.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
  await group.getByText('Source dossier · '+choice.name,{exact:true}).waitFor();
  await group.locator('blockquote').waitFor();
 }
 await page.getByLabel('Personal backstory',{exact:true}).fill('A player-authored journey following source evidence.');
 await page.getByRole('button',{name:/^researcher/}).click();
 await page.screenshot({path:'G:/Loreworks/research/character-origins-desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'creation overflow '+width);}
 await page.getByRole('button',{name:'Create character & choose expedition',exact:true}).click();
 await page.getByRole('heading',{name:'Explorer Profile',exact:true}).waitFor();
 let result=await page.evaluate(async()=>await(await fetch('/api/player')).json());
 for(const [field,value] of Object.entries(choices))assert.equal(result.player[field],value);
 await page.getByRole('button',{name:'Edit character',exact:true}).click();
 await page.getByLabel('Character name',{exact:true}).fill('Revised Source Explorer');
 await page.getByRole('button',{name:'Save character',exact:true}).click();
 await page.getByRole('heading',{name:'Explorer Profile',exact:true}).waitFor();
 await page.reload();
 await page.getByLabel('Primary navigation',{exact:true}).selectOption('player');
 await page.getByRole('heading',{name:'Explorer Profile',exact:true}).waitFor();
 result=await page.evaluate(async()=>await(await fetch('/api/player')).json());
 assert.equal(result.player.name,'Revised Source Explorer');for(const [field,value] of Object.entries(choices))assert.equal(result.player[field],value);
 assert.equal(result.player.xp,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'profile overflow');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({created:true,choices,sourcePreviews:true,edited:true,reloaded:true,widths:[1440,390,320],errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
