import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {projectRoot} from './fixtures.js';

const source=process.env.DATABASE_URL;
if(!source) throw new Error('DATABASE_URL is required. Run this command inside the local API container.');
const name=`reconciledesk_${randomUUID().replaceAll('-','')}_test`;
const admin=new Pool({connectionString:source,max:1});
let created=false;
try {
  // The identifier is generated here; it never comes from request input.
  await admin.query(`CREATE DATABASE "${name}"`);created=true;
  const target=new URL(source);target.pathname=`/${name}`;
  const isolated=new Pool({connectionString:target.toString(),max:1});
  try {
    for(const migration of ['202610060001_foundation','202610060002_imports_reconciliation']) {
      await isolated.query(await readFile(join(projectRoot,'apps/api/prisma/migrations',migration,'migration.sql'),'utf8'));
    }
  } finally {await isolated.end();}
  console.log('Running integration tests in a newly created, isolated test database.');
  const child=spawn(process.execPath,[join(projectRoot,'node_modules/vitest/vitest.mjs'),'run','tests/database.integration.test.ts'],{
    cwd:join(projectRoot,'apps/api'),stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:target.toString()}
  });
  const exitCode=await new Promise<number>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  process.exitCode=exitCode;
} finally {
  if(created) {
    try {await admin.query(`DROP DATABASE "${name}"`);console.log('Isolated test database removed. Application data was not cleared.');}
    catch {console.error(`Could not remove the temporary test database ${name}; inspect active test connections.`);process.exitCode=1;}
  }
  await admin.end();
}
