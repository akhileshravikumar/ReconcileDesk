import { Router, text, type ErrorRequestHandler } from 'express';
import type { Store } from './store.js';
import { InputError, kindOf } from './domain.js';
function pageOf(value:unknown) {
  if(value===undefined) return 1;
  if(typeof value!=='string'|| !/^[1-9]\d{0,6}$/.test(value)) throw new InputError('page must be a positive integer.');
  return Number(value);
}
export function domainRoutes(store:Store) {
  const router=Router();
  router.get('/workspace',async(_req,res)=>{res.json(await store.workspace());});
  router.post('/imports/:kind',text({type:'text/csv',limit:'5mb'}),async(req,res)=> {
    if(!req.is('text/csv')||typeof req.body!=='string') throw new InputError('Send CSV with Content-Type: text/csv.',415);
    const kind=kindOf(req.params.kind);
    const rawName=req.header('x-file-name')??`${kind.toLowerCase()}.csv`;
    let name:string;
    try { name=decodeURIComponent(rawName).replaceAll('\\','/').split('/').pop()??'upload.csv'; }
    catch { throw new InputError('Invalid file name.'); }
    if(name.length>128||[...name].some(character=>character.charCodeAt(0)<32)) throw new InputError('File name is too long or contains control characters.');
    const batch=await store.submit(kind,name,req.body);
    res.status(batch.status==='COMPLETED'?200:202).json(batch);
  });
  router.get('/imports/:id',async(req,res)=>{res.json(await store.batch(String(req.params.id),pageOf(req.query.page)));});
  router.post('/imports/:id/retry',async(req,res)=>{res.status(202).json(await store.retry(String(req.params.id)));});
  router.post('/reconciliation',async(_req,res)=>{res.json(await store.run());});
  router.get('/reconciliation/latest',async(req,res)=>{res.json(await store.results(pageOf(req.query.page),req.query.exceptions==='true'));});
  return router;
}
export const domainError:ErrorRequestHandler=(error,_req,res,_next)=> {
  void _next;
  if(error instanceof InputError) {res.status(error.status).json({error:error.message});return;}
  if(error?.type==='entity.too.large') {res.status(413).json({error:'File exceeds the 5 MiB limit.'});return;}
  _req.log.error({errorType:error?.name,code:error?.code},'Request failed');
  res.status(500).json({error:'Operation failed. Check service logs and retry.'});
};
