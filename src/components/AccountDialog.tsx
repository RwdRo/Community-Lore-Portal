import { useEffect, useRef, useState } from 'react';
import { api, refreshIdentity } from '../services/applicationClient';
import { Card } from './UI';
export function AccountDialog({onClose}:{onClose:()=>void}){
 const [register,setRegister]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.querySelector('input')?.focus();return()=>previous?.focus();},[]);
 async function submit(e:any){e.preventDefault();setBusy(true);setError('');try{await api(register?'auth/register':'auth/login',{username,password});await refreshIdentity();onClose();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
 <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="account-title" className="w-full max-w-md" onKeyDown={e=>{
  if(e.key==='Escape'&&!busy)onClose();
  if(e.key==='Tab'){const nodes=dialog.current?.querySelectorAll<HTMLElement>('input,button');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 }}>
 <Card><div className="flex justify-between mb-6"><h2 id="account-title" className="text-gold-default uppercase tracking-widest">{register?'Create your account':'Connect your terminal'}</h2><button aria-label="Close account dialog" disabled={busy} onClick={onClose}>×</button></div>
 <p className="text-sm text-neutral-grey mb-5">Your profile, discoveries and saved lore stay with your Loreworks account. You can also link a WAX wallet.</p>
 <form onSubmit={submit} className="space-y-4">
 <label className="block text-xs uppercase tracking-widest">Username<input required autoComplete="username" minLength={3} maxLength={32} value={username} onChange={e=>setUsername(e.target.value)} className="block w-full mt-2 p-3 bg-black border border-neutral-grey/40" /></label>
 <label className="block text-xs uppercase tracking-widest">Password<input required type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)} className="block w-full mt-2 p-3 bg-black border border-neutral-grey/40" /></label>
 {register&&<p className="text-xs text-neutral-grey">At least 12 characters. Save your credentials securely.</p>}
 {error&&<p role="alert" className="text-error-default text-sm">{error}</p>}
 <button disabled={busy} className="w-full p-3 bg-gold-default text-black uppercase tracking-widest disabled:opacity-50">{busy?'Connecting…':register?'Create account':'Sign in'}</button>
 </form><button className="mt-5 text-blue-default text-sm" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>{register?'Already have an account? Sign in':'New explorer? Create an account'}</button>
 </Card></div></div>;
}
