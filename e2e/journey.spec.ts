import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const banner = (page: Page) => page.getByRole('banner');
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Cabinets' });
const main = (page: Page) => page.getByRole('main', { name: 'Main view' });

async function exportFile(page: Page, item: string) {
  await banner(page).getByRole('button', { name: 'Export ▾' }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('group', { name: 'Export' })
    .getByRole('button', { name: new RegExp(`^${item}`) })
    .click();
  const file = await download;
  return { name: file.suggestedFilename(), data: await readFile(await file.path()) };
}

test('from a new project to a shop packet', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');

  // 1. A new, named project.
  await banner(page)
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await projects.getByRole('button', { name: 'New project', exact: true }).click();
  await banner(page)
    .getByRole('button', { name: /Untitled project/ })
    .click();
  await projects.getByLabel("This project's name").fill('Garage shop');
  await projects.getByLabel("This project's name").press('Enter');
  await projects.getByRole('button', { name: 'Close' }).click();
  await expect(banner(page).getByRole('button', { name: /Garage shop/ })).toBeVisible();

  // 2. The room comes first: an L, wall 1 at 10' and an 8' return wall.
  await expect(sidebar(page).getByLabel('Add a cabinet')).toBeDisabled();
  await main(page).getByRole('button', { name: 'L-shaped' }).click();
  const wall1 = main(page).getByLabel('Wall 1 length');
  await wall1.fill("10'");
  await wall1.press('Enter');
  await expect(wall1).toHaveValue('120"');
  await expect(main(page).getByLabel('Wall 2 length')).toHaveValue('96"');
  await main(page).getByRole('button', { name: 'Create room' }).click();

  // 3. Cabinets: a 36" base from the first steps, a drawer bank and a wall cabinet.
  await main(page).getByRole('button', { name: 'Add a base cabinet' }).click();
  const width = page.getByRole('textbox', { name: 'Width', exact: true });
  await width.fill('36');
  await width.press('Enter');
  await expect(width).toHaveValue('36"');
  await sidebar(page).getByLabel('Add a cabinet').selectOption({ label: 'Drawer base' });
  await sidebar(page).getByLabel('Add a cabinet').selectOption({ label: 'Wall cabinet' });
  await expect(sidebar(page).getByRole('list').first().getByRole('listitem')).toHaveCount(3);

  // 4. They sit side by side on wall 1 without overlaps.
  await page.getByRole('tab', { name: 'Plan' }).click();
  const plan = main(page).getByRole('group', { name: 'Plan of Garage shop' });
  await expect(plan.getByRole('button')).toHaveCount(3);
  await expect(main(page)).not.toContainText('overlap');

  // 5. The cut list: the 36" base and the drawer bank share four 30 1/2" × 24" sides.
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const list = main(page).getByRole('region', { name: 'Cut list' });
  const sides = list
    .getByRole('row')
    .filter({ hasText: /^\d+Side/ })
    .first();
  await expect(sides.getByRole('cell').nth(3)).toHaveText('4');
  await expect(sides).toContainText('30 1/2"');
  await expect(sides).toContainText('24"');
  const rows = await list.locator('tbody tr').count();
  expect(rows).toBeGreaterThan(10);

  // 6. Sheets are laid out with a cut order.
  await page.getByRole('tab', { name: 'Sheets', exact: true }).click();
  await expect(
    main(page).getByRole('list', { name: 'Cuts for sheet 1' }).getByRole('listitem').first(),
  ).toContainText('strip');

  // 7. Export: the CSV has one line per cut list row; the PDF is a PDF.
  const csv = await exportFile(page, 'Cut list');
  expect(csv.name).toBe('Garage shop cut list.csv');
  expect(csv.data.toString('utf8').trimEnd().split('\r\n')).toHaveLength(rows + 1);
  const pdf = await exportFile(page, 'Shop packet');
  expect(pdf.name).toBe('Garage shop shop packet.pdf');
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');

  // 8. Everything is still there after a reload.
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(banner(page).getByRole('button', { name: /Garage shop/ })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: /36" × 34 1\/2" × 24"/ })).toBeVisible();
});
