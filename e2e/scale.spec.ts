import { expect, test } from '@playwright/test';
import { bigKitchen } from '../src/core/__tests__/bigKitchen';

const main = (page: import('@playwright/test').Page) =>
  page.getByRole('main', { name: 'Main view' });

test('a 64-cabinet kitchen opens, renders and stays responsive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Projects' })
    .locator('input[type=file]')
    .setInputFiles({
      name: 'big.cabinets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bigKitchen())),
    });
  await expect(page.getByRole('banner').getByRole('button', { name: /Big kitchen/ })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Cabinets' }).getByRole('listitem'),
  ).toHaveCount(64);

  await page.keyboard.press('r');
  await expect(main(page).getByRole('img', { name: '3D model of Big kitchen' })).toBeVisible();

  // Moving a cabinet changes no part, so it never waits on sheet layout. (Timed in plan: the
  // 3D room is software-rendered in CI, which would time the GPU emulator instead.)
  await page.getByRole('tab', { name: 'Plan' }).click();
  const fromStart = page.getByLabel('From wall start');
  await expect(fromStart).toHaveValue('24"');
  const start = Date.now();
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(fromStart).toHaveValue('34"');
  expect(Date.now() - start).toBeLessThan(5000);

  // Changing a size re-nests and the outputs follow.
  const total = page.getByTestId('summary-total');
  const before = await total.textContent();
  const width = page.getByRole('textbox', { name: 'Width', exact: true });
  await width.fill('30');
  await width.press('Enter');
  await expect(total).not.toHaveText(before!);

  await page.getByRole('tab', { name: 'Sheets', exact: true }).click();
  await expect(
    main(page).getByRole('img', { name: /^3\/4" Plywood, sheet 1 of \d+$/ }),
  ).toBeVisible();
});
