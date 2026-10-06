import {describe,it,expect} from 'vitest';
import {hashPassword,checkPassword,sessionToken,csrfFor} from '../src/auth.js';
import {validateTransition,actionSchema} from '../src/investigations.js';
describe('security and workflow primitives',()=>{
  it('stores salted scrypt hashes and checks passwords',async()=>{
    const password='Only-a-unit-test-password';const hash=await hashPassword(password);
    expect(hash).not.toContain(password);expect(hash).toMatch(/^scrypt-32768-8-3/);
    expect(await checkPassword(password,hash)).toBe(true);expect(await checkPassword('wrong',hash)).toBe(false);
  });
  it('rejects malformed hashes',async()=>expect(await checkPassword('x','bad')).toBe(false));
  it('rejects ambiguous or malformed session cookies',()=>{
    const token='a'.repeat(43);expect(sessionToken(`reconciledesk_session=${token}`)).toBe(token);
    expect(sessionToken(`reconciledesk_session=${token}; reconciledesk_session=${token}`)).toBe(null);
    expect(sessionToken('reconciledesk_session=short')).toBe(null);
  });
  it('binds CSRF tokens to a session',()=>expect(csrfFor('a'.repeat(43))).not.toBe(csrfFor('b'.repeat(43))));
  it('requires sequential status transitions and a resolution note',()=>{
    expect(()=>validateTransition('OPEN','RESOLVED','note')).toThrow();
    expect(()=>validateTransition('IN_PROGRESS','RESOLVED','  ')).toThrow('resolution note');
    expect(()=>validateTransition('OPEN','IN_PROGRESS')).not.toThrow();
    expect(()=>validateTransition('IN_PROGRESS','RESOLVED','Reviewed evidence')).not.toThrow();
    expect(()=>validateTransition('RESOLVED','OPEN')).not.toThrow();
  });
  it('requires optimistic versions and bounded notes',()=>{
    expect(actionSchema.safeParse({action:'NOTE',body:'hello'}).success).toBe(false);
    expect(actionSchema.safeParse({action:'NOTE',version:1,body:'x'.repeat(2001)}).success).toBe(false);
    expect(actionSchema.safeParse({action:'NOTE',version:1,body:'  '}).success).toBe(false);
  });
});
