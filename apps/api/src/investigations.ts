import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PrismaClient,Prisma} from './generated/prisma/client.js';
import {InputError,type ResultItem} from './domain.js';
import {audit,userSelect,systemActor,type Actor} from './audit.js';

export async function syncInvestigations(tx:Prisma.TransactionClient,runId:string,items:ResultItem[],actor:Actor) {
  const existing=await tx.investigation.findMany({select:{transactionRef:true}});
  const known=new Set(existing.map(x=>x.transactionRef));
  for(let offset=0;offset<items.length;offset+=500) {
    const batch=items.slice(offset,offset+500);
    await tx.investigation.updateMany({where:{transactionRef:{in:batch.map(x=>x.transactionRef)}},data:{latestRunId:runId}});
    const fresh=batch.filter(x=>x.status==='EXCEPTION'&&!known.has(x.transactionRef)).map(item=>({id:randomUUID(),item}));
    if(!fresh.length)continue;
    await tx.investigation.createMany({data:fresh.map(({id,item})=>({id,transactionRef:item.transactionRef,latestRunId:runId}))});
    await tx.auditEvent.createMany({data:fresh.map(({id,item})=>({actorId:actor.id,actorLabel:actor.label,action:'INVESTIGATION_OPENED',entityType:'INVESTIGATION',entityId:id,details:{transactionRef:item.transactionRef,runId,codes:item.codes}}))});
  }
}
const note=z.string().trim().min(1).max(2000);
export const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('ASSIGN'),version:z.number().int().positive(),assigneeId:z.string().min(1).max(100).nullable()}).strict(),
  z.object({action:z.literal('NOTE'),version:z.number().int().positive(),body:note}).strict(),
  z.object({action:z.literal('STATUS'),version:z.number().int().positive(),status:z.enum(['OPEN','IN_PROGRESS','RESOLVED']),note:z.string().trim().max(2000).optional()}).strict()
]);
export type CaseAction=z.infer<typeof actionSchema>;
const allowed:Record<string,string[]>={OPEN:['IN_PROGRESS'],IN_PROGRESS:['RESOLVED'],RESOLVED:['OPEN']};
export function validateTransition(from:string,to:string,resolutionNote?:string) {
  if(!allowed[from]?.includes(to))throw new InputError(`Transition from ${from} to ${to} is not allowed.`,409);
  if(to==='RESOLVED'&&!resolutionNote?.trim())throw new InputError('A resolution note is required.');
}
export function createInvestigations(db:PrismaClient) {
  const include={assignee:{select:userSelect}} as const;
  async function get(id:string) {
    const investigation=await db.investigation.findUnique({where:{id},include:{...include,notes:{include:{author:{select:userSelect}},orderBy:[{createdAt:'asc'},{id:'asc'}]}}});
    if(!investigation)throw new InputError('Investigation not found.',404);
    const finding=await db.reconciliationItem.findUnique({where:{runId_transactionRef:{runId:investigation.latestRunId,transactionRef:investigation.transactionRef}}});
    return {investigation,finding};
  }
  return {
    get,
    async list(page:number,status?:string) {
      if(status&&!['OPEN','IN_PROGRESS','RESOLVED'].includes(status))throw new InputError('Invalid investigation status.');
      const where=status?{status:status as 'OPEN'|'IN_PROGRESS'|'RESOLVED'}:{};
      const [items,total]=await Promise.all([db.investigation.findMany({where,include,orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:(page-1)*50,take:50}),db.investigation.count({where})]);
      return {items,total,page,pageSize:50};
    },
    operators:()=>db.user.findMany({where:{role:'OPERATOR',active:true},select:userSelect,orderBy:{displayName:'asc'}}),
    async act(id:string,action:CaseAction,actor:Actor) {
      if(!actor.id)throw new InputError('An authenticated operator is required.',403);
      await db.$transaction(async tx=>{
        const user=await tx.user.findUnique({where:{id:actor.id!}});
        if(!user?.active||user.role!=='OPERATOR')throw new InputError('Operator access is required.',403);
        const current=await tx.investigation.findUnique({where:{id}});
        if(!current)throw new InputError('Investigation not found.',404);
        if(current.version!==action.version)throw new InputError('This investigation changed. Reload it before saving.',409);
        let data:Prisma.InvestigationUncheckedUpdateManyInput={version:{increment:1}};
        let actionName:string;let details:Prisma.InputJsonValue;
        if(action.action==='ASSIGN') {
          if(action.assigneeId){const assignee=await tx.user.findUnique({where:{id:action.assigneeId}});if(!assignee?.active||assignee.role!=='OPERATOR')throw new InputError('Assign only to an active operator.');}
          data={...data,assigneeId:action.assigneeId};actionName='INVESTIGATION_ASSIGNED';details={from:current.assigneeId,to:action.assigneeId};
        } else if(action.action==='NOTE') {actionName='INVESTIGATION_NOTE_ADDED';details={};}
        else {validateTransition(current.status,action.status,action.note);data={...data,status:action.status};actionName='INVESTIGATION_STATUS_CHANGED';details={from:current.status,to:action.status};}
        const changed=await tx.investigation.updateMany({where:{id,version:action.version},data});
        if(changed.count!==1)throw new InputError('This investigation changed. Reload it before saving.',409);
        const body=action.action==='NOTE'?action.body:action.action==='STATUS'?action.note:undefined;
        if(body) {
          const created=await tx.investigationNote.create({data:{investigationId:id,authorId:actor.id!,body,kind:action.action==='STATUS'?(action.status==='RESOLVED'?'RESOLUTION':'STATUS_NOTE'):'COMMENT'}});
          details={...details as Record<string,Prisma.InputJsonValue>,noteId:created.id};
        }
        await audit(tx,actor,actionName,'INVESTIGATION',id,{...details as Record<string,Prisma.InputJsonValue>,version:action.version+1});
      });
      return get(id);
    },
    async history(page:number,entityId?:string) {
      if(entityId&&entityId.length>128)throw new InputError('Invalid audit filter.');
      const where=entityId?{entityId}:{};
      const [items,total]=await Promise.all([db.auditEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*50,take:50}),db.auditEvent.count({where})]);
      return {items,total,page,pageSize:50};
    }
  };
}
export type Investigations=ReturnType<typeof createInvestigations>;
export {systemActor};
