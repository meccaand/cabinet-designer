import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const total = (page: Page) => page.getByTestId('summary-total');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('the cut list merges identical parts across cabinets', async ({ page }) => {
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const list = main(page).getByRole('region', { name: 'Cut list' });
  await expect(list.getByRole('heading', { name: /3\/4" Plywood/ })).toBeVisible();
  // The 30" frameless base and the 18" drawer base share 30 1/2" × 24" sides: 4 of them.
  const sides = list
    .getByRole('row')
    .filter({ hasText: /^\d+Side/ })
    .first();
  await expect(sides.getByRole('cell').nth(3)).toHaveText('4');
  await expect(sides).toContainText('Frameless 30" base, 18" drawer base');
  await expect(sides).toContainText('30 1/2"');
  await expect(sides).toContainText('≈23/32"'); // thicknesses at 1/32"
});

test('sheet layouts show numbered cuts and follow the kerf setting', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sheets', exact: true }).click();
  const ply = main(page).getByRole('region', { name: '3/4" Plywood sheets' });
  await expect(ply.getByRole('img', { name: /3\/4" Plywood, sheet 1 of \d/ })).toBeVisible();
  await expect(
    ply.getByRole('list', { name: 'Cuts for sheet 1' }).getByRole('listitem').first(),
  ).toContainText('strip');
  const kerf = main(page).getByLabel('Saw kerf');
  await kerf.fill('1/4');
  await kerf.press('Enter');
  await expect(kerf).toHaveValue('1/4"');
  await expect(ply.getByRole('img').first()).toBeVisible();
});

test('prices drive the estimate; materials in use cannot be removed', async ({ page }) => {
  await page.getByRole('tab', { name: 'Materials & cost' }).click();
  const before = await total(page).textContent();
  const library = main(page).getByRole('region', { name: 'Material library' });
  const price = library.getByLabel('Price per sheet').first();
  await price.fill('100');
  await price.press('Enter');
  // 3/4" ply goes from $85 to $100 a sheet.
  await expect(total(page)).not.toHaveText(before!);
  await expect(main(page).getByTestId('estimate-total')).toHaveText(
    (await total(page).textContent())!,
  );

  await library.getByRole('button', { name: 'Remove 3/4" Plywood' }).click();
  await expect(library.getByRole('alert')).toContainText('3/4" Plywood is in use');

  await library.getByRole('button', { name: 'Add sheet material' }).click();
  await expect(library.getByRole('button', { name: 'Remove New sheet material' })).toBeVisible();
  await library.getByRole('button', { name: 'Remove New sheet material' }).click();
  await expect(library.getByRole('button', { name: 'Remove New sheet material' })).toHaveCount(0);
});

test('editing a cabinet updates the outputs', async ({ page }) => {
  const before = await page.getByRole('region', { name: 'Shop outputs' }).textContent();
  await page.getByRole('region', { name: 'Edit cabinet' }).getByLabel('Left end panel').check();
  await expect(page.getByRole('region', { name: 'Shop outputs' })).not.toHaveText(before!);
  await page.getByRole('tab', { name: 'Cut list' }).click();
  await expect(main(page).getByRole('row').filter({ hasText: 'End panel' })).toContainText(
    'Notch 4" × ≈3 11/16"',
  );
});
