import type {Prisma} from './generated/prisma/client.js';
export type Actor={id:string|null;label:string};
export const systemActor:Actor={id:null,label:'System'};
export async function audit(tx:Prisma.TransactionClient,actor:Actor,action:string,entityType:string,entityId:string,details:Prisma.InputJsonValue={}) {
  await tx.auditEvent.create({data:{actorId:actor.id,actorLabel:actor.label,action,entityType,entityId,details}});
}
export const userSelect={id:true,email:true,displayName:true,role:true} as const;
