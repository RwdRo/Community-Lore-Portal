import test from 'node:test';import assert from 'node:assert/strict';import {SessionKit} from '@wharfkit/session';import {PermissionLevel} from '@wharfkit/antelope';import {walletChallengePlugin} from '../src/services/walletChallenge';
const chain='1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01af5a41';
test('frozen SessionKit passes the server challenge to the actual wallet login context',async()=>{
 let received='';
 const wallet:any={id:'fixture',config:{requiresChainSelect:false,requiresPermissionSelect:false},metadata:{name:'Fixture'},data:{},serialize:()=>({id:'fixture',data:{}}),login:async(context:any)=>{received=String(context.appName);return {chain,permissionLevel:PermissionLevel.from('testaccount@active')}}};
 const ui:any={onLogin:async()=>{},onLoginComplete:async()=>{},onError:async()=>{},addTranslations:()=>{}};
 const kit=new SessionKit({appName:'loreworks',chains:[{id:chain,url:'https://rpc.invalid'}],ui,walletPlugins:[wallet]},{loginPlugins:[walletChallengePlugin],storage:{read:async()=>null,write:async()=>{},remove:async()=>{}}});
 await kit.login({chain,arbitrary:{loreworksScope:'abcdefghijk1'}});assert.equal(received,'abcdefghijk1');
 received='';await assert.rejects(()=>kit.login({chain}),/Missing wallet challenge/);assert.equal(received,'');
});