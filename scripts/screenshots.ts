/** README screenshots of the sample kitchen and the spec's reference room, in light mode. Run
 * with `npm run screenshots`. */
import { expect, test, type Page } from '@playwright/test';
import { referenceRoom } from '../src/core/__tests__/referenceRoom';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
}

test('screenshots', async ({ page }) => {
  await open(page);
  await shot(page, '3d-cabinet');

  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, '3d-room');

  await page.getByRole('button', { name: 'Cabinet', exact: true }).click();
  await page.getByRole('button', { name: 'Exploded' }).click();
  await page.getByRole('button', { name: 'Dimensions' }).click();
  await page.waitForTimeout(1200);
  await shot(page, '3d-exploded');
  await page.getByRole('button', { name: 'Exploded' }).click();
  await page.getByRole('button', { name: 'Dimensions' }).click();

  for (const [tab, name] of [
    ['Plan', 'plan'],
    ['Elevation', 'elevation'],
    ['Cut list', 'cut-list'],
    ['Sheets', 'sheets'],
    ['Materials & cost', 'materials'],
  ] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.waitForTimeout(400);
    await shot(page, name);
  }

  await page.getByRole('tab', { name: '3D' }).click();
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await shot(page, 'export');
});

test('built-in screenshots', async ({ page }) => {
  await open(page);
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Projects' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'reference.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(referenceRoom())),
  });
  await expect(dialog).toBeHidden();
  await page
    .getByRole('complementary', { name: 'Cabinets' })
    .getByRole('button', { name: /Living room built-ins/ })
    .click();
  await page.waitForTimeout(1000);
  await shot(page, 'builtin-room');
  await page.getByRole('tab', { name: 'Elevation', exact: true }).click();
  await page.locator('#elevation-wall').selectOption({ label: 'Media wall' });
  await page.waitForTimeout(400);
  await shot(page, 'builtin-elevation');
});

test.describe('tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  test('screenshots', async ({ page }) => {
    await open(page);
    await page.getByRole('banner').getByRole('button', { name: 'Properties' }).click();
    await page.waitForTimeout(400);
    await shot(page, 'tablet');
  });
});
