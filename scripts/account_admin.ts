import 'dotenv/config';
import {readApplication,updateApplication} from '../server/applicationStore';
const [username,role]=process.argv.slice(2);
if(!username||!['reader','skiv','skribus','scribe'].includes(role)){
 console.error('Stop the Loreworks server, then run: npm run account:admin -- USERNAME reader|skiv|skribus|scribe');process.exit(1);
}
const state=readApplication();
const account=Object.entries(state.accounts).find(([,a])=>a.username===username.toLowerCase());
const wallet=Object.values(state.documents.users).find((u:any)=>u.waxAccount===username);
const uid=account?.[0]||wallet?.uid;
if(!uid){console.error('Existing username or verified wallet account not found.');process.exit(1);}
updateApplication(s=>{s.documents.users[uid].role=role;delete s.documents.users[uid].walletAdminGrant;s.documents.users[uid]._version=(s.documents.users[uid]._version||0)+1;for(const [key,session]of Object.entries(s.sessions))if(session.uid===uid)delete s.sessions[key];});
console.log('Role updated to '+role+'. Existing sessions revoked. Restart the server.');