import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.getByRole('region', { name: 'Edit cabinet' });
const field = (page: Page, name: string) => editor(page).getByLabel(name, { exact: true });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Cabinets' });

async function setLength(page: Page, name: string, text: string) {
  await field(page, name).fill(text);
  await field(page, name).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('drag a cabinet along the wall in plan: it snaps to the wall end; undo and redo', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Plan' }).click();
  const drawer = page.getByRole('button', { name: '18" drawer base on plan' });
  const box = (await drawer.boundingBox())!;
  const pxPerInch = box.width / 18;
  // From 54" to near the wall end (102"): within the snap distance of it.
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 3 });
  await page.mouse.move(x + 47.6 * pxPerInch, y, { steps: 5 });
  await page.mouse.up();
  await expect(field(page, 'From wall start')).toHaveValue('102"');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(field(page, 'From wall start')).toHaveValue('54"');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(field(page, 'From wall start')).toHaveValue('102"');
});

test('overlaps are reported and gaps can be filled', async ({ page }) => {
  await sidebar(page)
    .getByRole('button', { name: /18" drawer base/ })
    .click();
  await setLength(page, 'From wall start', '50');
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(page.getByRole('list', { name: 'Layout problems' })).toContainText(
    'Face-frame 24" shaker base overlaps 18" drawer base.',
  );

  await setLength(page, 'From wall start', '55');
  await expect(page.getByRole('list', { name: 'Layout problems' })).toBeEmpty();
  await editor(page).getByRole('button', { name: 'Fill 1" gap on the left' }).click();
  const filler = page.getByRole('region', { name: 'Edit filler' });
  await expect(filler.getByLabel('Filler width')).toHaveValue('1"');
  await expect(sidebar(page).getByRole('button', { name: 'Filler 1" · Wall 1' })).toBeVisible();
  await filler.getByRole('button', { name: 'Delete filler' }).click();
  await expect(sidebar(page).getByRole('button', { name: /^Filler/ })).toHaveCount(0);
});

test('end panels are added to the cabinet', async ({ page }) => {
  await editor(page).getByLabel('Left end panel').check();
  await page.getByRole('tab', { name: 'Parts' }).click();
  await page
    .getByRole('region', { name: 'Parts' })
    .getByRole('button', { name: /^Left end panel/ })
    .click();
  // 34 1/2" tall, 24" + 18 mm doors deep.
  await expect(page.getByTestId('cut-size')).toHaveText('34 1/2" × ≈24 11/16" × ≈11/16"');
  // 4" toe kick; from the door face (24" + 18 mm) back to the platform front (21").
  await expect(page.getByRole('region', { name: 'Selected part' })).toContainText(
    'Notch4" × ≈3 11/16" at the bottom front (toe kick)',
  );
});

test('walls can be added and are drawn in plan and elevation', async ({ page }) => {
  await sidebar(page).getByText('Room & walls').click();
  await sidebar(page).getByRole('button', { name: 'Add wall' }).click();
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(page.getByRole('img', { name: 'Plan of Sample kitchen' })).toContainText(
    'Wall 2 · 96"',
  );
  await page.getByRole('tab', { name: 'Elevation' }).click();
  await page
    .getByRole('main', { name: 'Main view' })
    .getByLabel('Wall', { exact: true })
    .selectOption({ label: 'Wall 2' });
  await expect(page.getByRole('img', { name: 'Elevation of Wall 2' })).toContainText('96"');
});

test('work is saved in the browser and survives a reload', async ({ page }) => {
  await setLength(page, 'Width', '33');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(sidebar(page).getByRole('button', { name: /Frameless 30" base/ })).toContainText(
    '33" × 34 1/2" × 24"',
  );
  // History starts fresh after a reload.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('projects: new, switch back, export and re-import', async ({ page }) => {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Projects' });
  await dialog.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(
    page.getByRole('banner').getByRole('button', { name: /Untitled project/ }),
  ).toBeVisible();
  await expect(sidebar(page)).toContainText('No cabinets yet');

  await page
    .getByRole('banner')
    .getByRole('button', { name: /Untitled project/ })
    .click();
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Sample kitchen' })
    .getByRole('button', { name: 'Open' })
    .click();
  await expect(
    page.getByRole('banner').getByRole('button', { name: /Sample kitchen/ }),
  ).toBeVisible();

  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export JSON' }).click();
  const file = await (await download).path();
  const json = JSON.parse(await readFile(file, 'utf8'));
  expect(json).toMatchObject({ schemaVersion: 1, name: 'Sample kitchen' });
  expect(json.cabinets).toHaveLength(4);

  await dialog.locator('input[type=file]').setInputFiles(file);
  // Same id as an existing project, so it comes in as a copy.
  await expect(dialog).toBeHidden();
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Sample kitchen' })).toHaveCount(2);

  await dialog.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1, "name": 3}'),
  });
  await expect(dialog.getByRole('alert')).toContainText("broken.json can't be imported");
});

test('the room view shows every cabinet', async ({ page }) => {
  await page
    .getByRole('toolbar', { name: 'View' })
    .getByRole('button', { name: 'Room', exact: true })
    .click();
  await expect(page.getByLabel('3D model of Sample kitchen')).toBeVisible();
});
