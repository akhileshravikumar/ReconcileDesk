import { Router, text, json, type ErrorRequestHandler } from 'express';
import {actorOf,type Guards} from './auth.js';
import {actionSchema,type Investigations} from './investigations.js';
import {generationSchema} from './summary-contract.js';
import type {Summaries} from './summaries.js';
import type { Store } from './store.js';
import { InputError, kindOf } from './domain.js';
function pageOf(value:unknown) {
  if(value===undefined) return 1;
  if(typeof value!=='string'|| !/^[1-9]\d{0,6}$/.test(value)) throw new InputError('page must be a positive integer.');
  return Number(value);
}
export function domainRoutes(store:Store,guards:Guards,investigations?:Investigations,summaries?:Summaries) {
  const router=Router();
  router.use(guards.read,guards.write);
  router.get('/workspace',async(_req,res)=>{res.json(await store.workspace());});
  router.post('/imports/:kind',text({type:'text/csv',limit:'5mb'}),async(req,res)=> {
    if(!req.is('text/csv')||typeof req.body!=='string') throw new InputError('Send CSV with Content-Type: text/csv.',415);
    const kind=kindOf(req.params.kind);
    const rawName=req.header('x-file-name')??`${kind.toLowerCase()}.csv`;
    let name:string;
    try { name=decodeURIComponent(rawName).replaceAll('\\','/').split('/').pop()??'upload.csv'; }
    catch { throw new InputError('Invalid file name.'); }
    if(name.length>128||[...name].some(character=>character.charCodeAt(0)<32)) throw new InputError('File name is too long or contains control characters.');
    const batch=await store.submit(kind,name,req.body,actorOf(res));
    res.status(batch.status==='COMPLETED'?200:202).json(batch);
  });
  router.get('/imports/:id',async(req,res)=>{res.json(await store.batch(String(req.params.id),pageOf(req.query.page)));});
  router.post('/imports/:id/retry',async(req,res)=>{res.status(202).json(await store.retry(String(req.params.id),actorOf(res)));});
  router.post('/reconciliation',async(_req,res)=>{res.json(await store.run(actorOf(res)));});
  router.get('/reconciliation/latest',async(req,res)=>{res.json(await store.results(pageOf(req.query.page),req.query.exceptions==='true'));});
  if(investigations) {
    router.get('/operators',async(_req,res)=>{res.json({items:await investigations.operators()});});
    router.get('/investigations',async(req,res)=>{res.json(await investigations.list(pageOf(req.query.page),typeof req.query.status==='string'?req.query.status:undefined));});
    router.get('/investigations/:id',async(req,res)=>{res.json(await investigations.get(String(req.params.id)));});
    router.post('/investigations/:id/actions',json({limit:'16kb'}),async(req,res)=>{
      const action=actionSchema.safeParse(req.body);
      if(!action.success)throw new InputError('Invalid action, version, assignment or note (maximum 2,000 characters).');
      res.json(await investigations.act(String(req.params.id),action.data,actorOf(res)));
    });
    router.get('/audit',async(req,res)=>{res.json(await investigations.history(pageOf(req.query.page),typeof req.query.entityId==='string'?req.query.entityId:undefined));});
  }
  if(summaries) {
    router.get('/investigations/:id/summaries',async(req,res)=>{res.json(await summaries.view(String(req.params.id)));});
    router.post('/investigations/:id/summaries',json({limit:'2kb'}),async(req,res)=>{
      const input=generationSchema.safeParse(req.body);if(!input.success)throw new InputError('Supply a request ID and current source hash.');
      res.json(await summaries.generate(String(req.params.id),input.data,actorOf(res)));
    });
  }
  return router;
}
export const domainError:ErrorRequestHandler=(error,_req,res,_next)=> {
  void _next;
  if(error instanceof InputError) {res.status(error.status).json({error:error.message});return;}
  if(error?.type==='entity.parse.failed'){res.status(400).json({error:'Malformed JSON request.'});return;}
  if(error?.type==='entity.too.large') {res.status(413).json({error:'Request exceeds the size limit.'});return;}
  _req.log.error({errorType:error?.name,code:error?.code},'Request failed');
  res.status(500).json({error:'Operation failed. Check service logs and retry.'});
};
