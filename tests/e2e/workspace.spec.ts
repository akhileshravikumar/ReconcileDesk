import {test,expect} from '@playwright/test';
const empty={batches:[],counts:{},pending:0,rejected:0,quarantined:0,latest:null};
test.beforeEach(async({page})=>{
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
