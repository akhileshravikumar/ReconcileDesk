import { test, expect } from '@playwright/test';
test('shows live connectivity without invented financial metrics', async ({ page }) => {
  await page.route('**/api/ready', route => route.fulfill({ json: {
    status:'ready',dependencies:{database:'ok',redis:'ok',worker:'ok',aiService:'ok'}
  } }));
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'A clear view of every payment.'})).toBeVisible();
  await expect(page.getByText('Connected', {exact:true})).toHaveCount(4);
  await expect(page.getByText('No financial records loaded')).toBeVisible();
});
test('makes an API outage visible', async ({ page }) => {
  await page.route('**/api/ready', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Cannot reach the API');
  await expect(page.getByText('Connected', {exact:true})).toHaveCount(0);
});
