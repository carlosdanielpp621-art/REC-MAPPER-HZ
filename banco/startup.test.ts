import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

const startup = readFileSync('assets/startup.js', 'utf8');
const app = readFileSync('assets/app.js', 'utf8');
function environment(provider: unknown) {
  const window = { supabase: provider, addEventListener: () => {} };
  const context = createContext({window,console:{warn:()=>{}},setTimeout,clearTimeout,Date});
  runInContext(startup, context);
  runInContext('var withPageTimeout = window.withPageTimeout;', context);
  runInContext(app, context);
  return context;
}
describe('Mapper session startup failures', () => {
 it('propagates session errors instead of leaving startup unresolved', async()=>{
  const ctx=environment({createClient:()=>({auth:{getSession:async()=>{throw new Error('Session unavailable');}}})});
  await expect(runInContext('refreshAuth()',ctx)).rejects.toThrow('Session unavailable');
 });
 it('does not treat identity lookup failure as missing permissions',async()=>{
  const ctx=environment({createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{email:'test@example.invalid',user_metadata:{}}}}})},rpc:async()=>({error:new Error('Identity unavailable')})})});
  await expect(runInContext('refreshAuth()',ctx)).rejects.toThrow('Identity unavailable');
 });
 it('bounds provider promises that never settle',async()=>{
  const ctx=environment(null);
  await expect(runInContext('window.withPageTimeout(new Promise(()=>{}),5)',ctx)).rejects.toThrow('A conexão demorou para responder');
 });
 it('rejects missing SDK instead of silently redirecting as signed out',async()=>{
  const ctx=environment(null);
  await expect(runInContext('refreshAuth()',ctx)).rejects.toThrow('O acesso ao Supabase não carregou');
 });
});
