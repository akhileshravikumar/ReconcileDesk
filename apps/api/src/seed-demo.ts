import {randomBytes} from 'node:crypto';
import {createDatabase} from './connections.js';
import {hashPassword} from './auth.js';
import {audit,systemActor} from './audit.js';
if(process.env.NODE_ENV==='production')throw new Error('Demo seeding is disabled in production.');
if(!process.env.DATABASE_URL)throw new Error('Run this command inside the local API container.');
const db=createDatabase(process.env.DATABASE_URL);
const reset=process.argv.includes('--reset-passwords');
const accounts=[];
try {
  for(const [email,displayName,role] of [
    ['viewer@reconciledesk.local','Demo Viewer','VIEWER'],
    ['operator.one@reconciledesk.local','Operator One','OPERATOR'],
    ['operator.two@reconciledesk.local','Operator Two','OPERATOR']
  ] as const) {
    const existing=await db.user.findUnique({where:{email}});
    if(existing&&!reset){accounts.push({email,role,password:null,status:'Already exists; password unchanged'});continue;}
    const password=randomBytes(18).toString('base64url');const passwordHash=await hashPassword(password);
    await db.$transaction(async tx=>{
      const user=await tx.user.upsert({where:{email},create:{email,displayName,role,passwordHash},update:{passwordHash}});
      if(existing)await tx.session.deleteMany({where:{userId:user.id}});
      await audit(tx,systemActor,existing?'DEMO_PASSWORD_RESET':'DEMO_USER_CREATED','USER',user.id,{email,role});
    });
    accounts.push({email,role,password,status:existing?'Password reset; sessions revoked':'Created'});
  }
  if(process.argv.includes('--json'))console.log(JSON.stringify({accounts}));
  else {console.log('Local demo credentials. Save privately; do not commit or share them.');for(const a of accounts)console.log(`${a.email} | ${a.role} | ${a.password??a.status}`);}
} finally {await db.$disconnect();}
