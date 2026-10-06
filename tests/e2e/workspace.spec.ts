import {test,expect} from '@playwright/test';
const user={id:'op',email:'operator@test.local',displayName:'Operator One',role:'OPERATOR'};
const empty={batches:[],counts:{},pending:0,rejected:0,quarantined:0,latest:null};
test.beforeEach(async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{user,csrfToken:'a'.repeat(64)}}));
  await page.route('**/api/investigations?*',route=>route.fulfill({json:{items:[],total:0}}));
  await page.route('**/api/operators',route=>route.fulfill({json:{items:[user]}}));
  await page.route('**/api/audit?*',route=>route.fulfill({json:{items:[],total:0}}));
  await page.route('**/api/ready',route=>route.fulfill({json:{status:'ready',dependencies:{database:'ok',redis:'ok',worker:'ok',aiService:'ok'}}}));
  await page.route('**/api/workspace',route=>route.fulfill({json:empty}));
  await page.route('**/api/reconciliation/latest?*',route=>route.fulfill({json:{run:null,items:[],total:0,page:1,pageSize:50}}));
});
test('shows connectivity without invented financial results',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'A clear view of every payment.'})).toBeVisible();
  await expect(page.getByText('Connected',{exact:true})).toHaveCount(4);
  await expect(page.getByText('No financial records loaded')).toBeVisible();
  await expect(page.getByRole('button',{name:'Run reconciliation'})).toBeDisabled();
});
test('makes an API outage visible',async({page})=>{
  await page.route('**/api/ready',route=>route.abort());await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Cannot reach the API');
});
test('uploads CSV using the selected record type',async({page})=>{
  let received='';
  await page.route('**/api/imports/PAYMENT',async route=>{received=route.request().postData()??'';await route.fulfill({status:202,json:{id:'batch1',status:'QUEUED'}});});
  await page.goto('/');
  await page.getByLabel('CSV file').setInputFiles({name:'payments.csv',mimeType:'text/csv',buffer:Buffer.from('transaction_ref,amount_paise,currency,paid_at\nP1,100,INR,2026-10-01T10:00:00Z\n')});
  await page.getByRole('button',{name:'Upload CSV'}).click();
  await expect(page.getByRole('status')).toContainText('Import queued');expect(received).toContain('P1,100,INR');
});
test('shows file validation errors without fabricating success',async({page})=>{
  await page.route('**/api/imports/PAYMENT',route=>route.fulfill({status:400,json:{error:'Required columns are missing.'}}));
  await page.goto('/');await page.getByLabel('CSV file').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('bad\n1\n')});
  await page.getByRole('button',{name:'Upload CSV'}).click();
  await expect(page.getByRole('status')).toContainText('Required columns are missing');
});

test('viewer controls are read-only',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{...user,role:'VIEWER'},csrfToken:'a'.repeat(64)}}));
  await page.goto('/');await expect(page.getByLabel('CSV file')).toBeDisabled();await expect(page.getByRole('button',{name:'Upload CSV'})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Audit history'})).toBeVisible();
});
test('unauthenticated users can sign in through the login form',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({status:401,json:{error:'Sign in to continue.'}}));
  await page.route('**/api/auth/login',route=>route.fulfill({json:{user,csrfToken:'a'.repeat(64)}}));
  await page.goto('/');await page.getByLabel('Email',{exact:true}).fill('operator@test.local');await page.getByLabel('Password',{exact:true}).fill('test-only');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
});
test('an operator can start and resolve an investigation with a note',async({page})=>{
  const item={id:'case1',transactionRef:'P1',status:'OPEN',assigneeId:null,assignee:null,version:1,updatedAt:new Date().toISOString(),notes:[]};
  await page.route('**/api/investigations?*',route=>route.fulfill({json:{items:[item],total:1}}));
  await page.route('**/api/investigations/case1',route=>route.fulfill({json:{investigation:item,finding:{status:'EXCEPTION',codes:['MISSING_SETTLEMENT']}}}));
  const actions:Record<string,unknown>[]=[];
  await page.route('**/api/investigations/case1/actions',async route=>{
    const action=route.request().postDataJSON();actions.push(action);item.status=action.status;item.version+=1;
    await route.fulfill({json:{investigation:item,finding:{status:'EXCEPTION',codes:['MISSING_SETTLEMENT']}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Open investigation'}).click();await page.getByRole('button',{name:'Start investigation'}).click();
  await expect(page.getByRole('button',{name:'Resolve investigation'})).toBeDisabled();
  await page.getByLabel('Resolution note',{exact:true}).fill('Reviewed the settlement discrepancy.');await page.getByRole('button',{name:'Resolve investigation'}).click();
  await expect(page.getByRole('button',{name:'Reopen investigation'})).toBeVisible();expect(actions[1]?.note).toBe('Reviewed the settlement discrepancy.');
});
