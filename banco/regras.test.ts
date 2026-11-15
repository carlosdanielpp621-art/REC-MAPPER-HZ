import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync('assets/app.js', 'utf8');
function actor(role: string, server: string | null) {
 const ctx = createContext({ window: {}, console, Date, localStorage: { getItem: () => null } });
 runInContext(source, ctx);
 runInContext(`CURRENT_ROLE=${JSON.stringify(role)};CURRENT_SERVIDOR=${JSON.stringify(server)};`,ctx);
 return (expr: string) => runInContext(expr,ctx);
}
describe('Mapper requested permissions',()=>{
 it('general responsible grants all four roles',()=>{expect(Array.from(actor('responsavel_geral',null)('allowedRoles()'))).toEqual(['responsavel_geral','aux_responsavel_geral','responsavel','auxiliar']);});
 it('general assistant grants responsible and assistant only',()=>{expect(Array.from(actor('aux_responsavel_geral',null)('allowedRoles()'))).toEqual(['responsavel','auxiliar']);});
 it('responsible grants assistant only',()=>{expect(Array.from(actor('responsavel','Servidor 3')('allowedRoles()'))).toEqual(['auxiliar']);});
 it('assistant cannot grant any roles',()=>{expect(Array.from(actor('auxiliar','Servidor 1')('allowedRoles()'))).toEqual([]);});
 it('responsible can manage assistants only on their own server',()=>{const a=actor('responsavel','Servidor 3');expect(a('canManageTarget({role:"auxiliar",servidor:"Servidor 3"})')).toBe(true);expect(a('canManageTarget({role:"auxiliar",servidor:"Servidor 2"})')).toBe(false);});
 it('assistant can lock their assigned server only',()=>{const a=actor('auxiliar','Servidor 1');expect(a('canLockForms()')).toBe(true);expect(Array.from(a('allowedServers()'))).toEqual(['Servidor 1']);});
 it('both general roles command all three servers',()=>{for(const r of ['responsavel_geral','aux_responsavel_geral'])expect(Array.from(actor(r,null)('allowedServers()'))).toEqual(['Servidor 1','Servidor 2','Servidor 3']);});
 it('review is available to responsible and general roles, not assistant',()=>{for(const r of ['responsavel','responsavel_geral','aux_responsavel_geral'])expect(actor(r,'Servidor 1')('canReview()')).toBe(true);expect(actor('auxiliar','Servidor 1')('canReview()')).toBe(false);});
 it('only general roles can see emails',()=>{for(const r of ['responsavel_geral','aux_responsavel_geral'])expect(actor(r,null)('isSuperAdmin()')).toBe(true);for(const r of ['responsavel','auxiliar'])expect(actor(r,'Servidor 1')('isSuperAdmin()')).toBe(false);});
 it('founder and own membership cannot be edited or removed',()=>{const a=actor('responsavel_geral',null);expect(a('canManageTarget({role:"auxiliar",protected:true})')).toBe(false);expect(a('canManageTarget({role:"auxiliar",self:true})')).toBe(false);});
});
