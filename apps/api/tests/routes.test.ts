import {describe,it,expect,vi} from 'vitest';
import request from 'supertest';
import {pino} from 'pino';
import {createApp} from '../src/app.js';
import {domainRoutes} from '../src/routes.js';
import {InputError} from '../src/domain.js';
import type {Store} from '../src/store.js';
function setup() {
  const store={submit:vi.fn(),workspace:vi.fn(),batch:vi.fn(),retry:vi.fn(),run:vi.fn(),results:vi.fn()} as unknown as Store;
  const ok=async()=>true;
  const app=createApp({database:ok,redis:ok,worker:ok,aiService:ok},pino({level:'silent'}),100,domainRoutes(store));
  return {store,app};
}
describe('import API contract',()=>{
  it('requires an explicit CSV content type',async()=>{
    const {app,store}=setup();const response=await request(app).post('/api/imports/PAYMENT').send({csv:'bad'});
    expect(response.status).toBe(415);expect(store.submit).not.toHaveBeenCalled();
  });
  it('rejects unknown record types before persistence',async()=>{
    const {app,store}=setup();const response=await request(app).post('/api/imports/OTHER').type('text/csv').send('x');
    expect(response.status).toBe(400);expect(store.submit).not.toHaveBeenCalled();
  });
  it('returns an accepted job and strips path components from display filenames',async()=>{
    const {app,store}=setup();vi.mocked(store.submit).mockResolvedValue({id:'id',status:'QUEUED'} as never);
    const response=await request(app).post('/api/imports/PAYMENT').set('x-file-name','..%2Fpayments.csv').type('text/csv').send('csv');
    expect(response.status).toBe(202);expect(store.submit).toHaveBeenCalledWith('PAYMENT','payments.csv','csv');
  });
  it('returns parser failures without a false success',async()=>{
    const {app,store}=setup();vi.mocked(store.submit).mockRejectedValue(new InputError('Missing columns'));
    const response=await request(app).post('/api/imports/PAYMENT').type('text/csv').send('csv');
    expect(response.status).toBe(400);expect(response.body.error).toBe('Missing columns');
  });
  it('validates pagination',async()=>{
    const {app,store}=setup();const response=await request(app).get('/api/imports/id?page=-1');
    expect(response.status).toBe(400);expect(store.batch).not.toHaveBeenCalled();
  });
  it('does not expose unexpected database errors',async()=>{
    const {app,store}=setup();vi.mocked(store.workspace).mockRejectedValue(new Error('password=secret'));
    const response=await request(app).get('/api/workspace');expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
