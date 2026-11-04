import { expect, test } from '@playwright/test';

test('app shell loads with its work areas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle('Cabinet Designer');
  await expect(page.getByRole('complementary', { name: 'Cabinets' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Main view' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shop outputs' })).toBeVisible();
  expect(errors).toEqual([]);
});
