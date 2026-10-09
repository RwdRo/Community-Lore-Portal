import {LoginHookTypes, type LoginPlugin} from '@wharfkit/session';
// Session 1.6.1 reads login plugins from the kit constructor, not login options.
export const walletChallengePlugin:LoginPlugin={register(context){
 context.addHook(LoginHookTypes.beforeLogin,async()=>{
  const scope=context.arbitrary.loreworksScope;
  if(typeof scope!=='string'||!/^[a-z1-5]{12}$/.test(scope))throw Error('Missing wallet challenge. Start the connection again.');
  context.appName=scope;
 });
}};