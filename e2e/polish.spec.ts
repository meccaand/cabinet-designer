import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const banner = (page: Page) => page.getByRole('banner');
const exportMenu = (page: Page) => page.getByRole('group', { name: 'Export' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
});

async function exportFile(page: Page, item: string) {
  await banner(page).getByRole('button', { name: 'Export ▾' }).click();
  const download = page.waitForEvent('download');
  await exportMenu(page)
    .getByRole('button', { name: new RegExp(`^${item}`) })
    .click();
  const file = await download;
  await expect(exportMenu(page)).toBeHidden();
  return { name: file.suggestedFilename(), data: await readFile(await file.path()) };
}

test('exports the shop packet as a PDF', async ({ page }) => {
  const pdf = await exportFile(page, 'Shop packet');
  expect(pdf.name).toBe('Sample kitchen shop packet.pdf');
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.data.length).toBeGreaterThan(20_000);
});

test('exports the cut list and shopping list as CSV', async ({ page }) => {
  const cuts = await exportFile(page, 'Cut list');
  expect(cuts.name).toBe('Sample kitchen cut list.csv');
  const text = cuts.data.toString('utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff); // BOM so spreadsheets read UTF-8
  const lines = text.slice(1).trimEnd().split('\r\n');
  expect(lines[0]).toMatch(/^Row,Material,Part,Cabinets,Qty,Length,Width,Thickness,Length \(in\)/);
  expect(lines[1]).toContain('Side');

  const shopping = await exportFile(page, 'Shopping list');
  expect(shopping.name).toBe('Sample kitchen shopping list.csv');
  expect(shopping.data.toString('utf8').trimEnd().split('\r\n').at(-1)).toBe('Total,,,,,705.19');

  const project = await exportFile(page, 'Project file');
  expect(JSON.parse(project.data.toString('utf8'))).toMatchObject({ name: 'Sample kitchen' });
});

test('keyboard: switch views, nudge, delete and undo, and list the shortcuts', async ({ page }) => {
  await page.keyboard.press('2');
  await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');

  const fromStart = page.getByLabel('From wall start');
  await expect(fromStart).toHaveValue('0"');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(fromStart).toHaveValue('1 1/16"');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(fromStart).toHaveValue('0"');

  const list = page.getByRole('complementary', { name: 'Cabinets' });
  await expect(list.getByRole('button', { name: /Frameless 30" base/ })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(list.getByRole('button', { name: /Frameless 30" base/ })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(list.getByRole('button', { name: /Frameless 30" base/ })).toBeVisible();

  // Typing in a field keeps its own keys.
  await page.getByRole('textbox', { name: 'Width', exact: true }).focus();
  await page.keyboard.press('3');
  await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Width', exact: true }).press('Escape');
  await page.getByRole('tab', { name: 'Plan' }).focus();

  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Move the cabinet or filler along its wall');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('a new project asks for the room, then invites a first cabinet', async ({ page }) => {
  await banner(page)
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Projects' })
    .getByRole('button', { name: 'New project', exact: true })
    .click();
  // Step 1: the room, on the 3D grid; no cabinets until it exists.
  await expect(main(page).getByRole('heading', { name: 'Set up the room' })).toBeVisible();
  await expect(main(page).locator('canvas')).toBeVisible();
  await expect(page.getByLabel('Add a cabinet')).toBeDisabled();
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(main(page).getByRole('heading', { name: 'Set up the room' })).toBeVisible();
  await page.getByRole('tab', { name: 'Cut list' }).click();
  await expect(main(page).getByRole('heading', { name: 'No cabinets yet' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Set up the room' }).click();
  await main(page).getByRole('button', { name: 'U-shaped' }).click();
  await expect(main(page).getByLabel(/^Wall \d length$/)).toHaveCount(3);
  await main(page).getByRole('button', { name: 'Create room' }).click();

  // Step 2: a first cabinet. Undo takes the room away again.
  await expect(main(page).getByRole('heading', { name: 'Add a first cabinet' })).toBeVisible();
  await expect(page.getByLabel('Add a cabinet')).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(main(page).getByRole('heading', { name: 'Set up the room' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await main(page).getByRole('button', { name: 'Add a base cabinet' }).click();
  await expect(page.getByRole('tab', { name: '3D' })).toHaveAttribute('aria-selected', 'true');
  await expect(main(page).locator('canvas')).toBeVisible();
  await expect(page.getByTestId('summary-total')).not.toHaveText('$0.00');
});

test.describe('on a tablet in portrait', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('side panels slide in on demand and the page never scrolls sideways', async ({ page }) => {
    const cabinets = page.getByRole('complementary', { name: 'Cabinets' });
    const properties = page.getByRole('complementary', { name: 'Properties' });
    await expect(cabinets).toBeHidden();
    await expect(properties).toBeHidden();
    await expect(main(page).locator('canvas')).toBeVisible();

    await banner(page).getByRole('button', { name: 'Properties' }).click();
    await expect(properties).toBeVisible();
    await expect(properties.getByRole('button', { name: 'Close' })).toBeFocused();
    await expect(properties.getByRole('textbox', { name: 'Width', exact: true })).toHaveValue(
      '30"',
    );
    await page.keyboard.press('Escape');
    await expect(properties).toBeHidden();

    await banner(page)
      .getByRole('button', { name: /Cabinets/ })
      .click();
    await expect(cabinets).toBeVisible();
    await cabinets.getByRole('button', { name: /18" drawer base/ }).click();
    await expect(cabinets).toBeHidden();
    await banner(page).getByRole('button', { name: 'Properties' }).click();
    await expect(properties.getByRole('textbox', { name: 'Width', exact: true })).toHaveValue(
      '18"',
    );

    for (const tab of ['Plan', 'Elevation', 'Cut list', 'Sheets', 'Materials & cost']) {
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: tab, exact: true }).click();
      expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
    }
  });
});
