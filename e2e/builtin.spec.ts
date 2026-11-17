import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { referenceRoom } from '../src/core/__tests__/referenceRoom';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Cabinets' });
const editor = (page: Page) => page.getByRole('region', { name: 'Edit built-in' });
const mediaRun = (page: Page) => editor(page).getByRole('region', { name: 'Run on Media wall' });

/** Open the spec's reference room by importing it. */
async function openReferenceRoom(page: Page) {
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
  await sidebar(page)
    .getByRole('button', { name: /Living room built-ins/ })
    .click();
  await expect(editor(page)).toBeVisible();
}

/** Total quantity of cut-list rows whose part name matches. */
async function qty(page: Page, name: RegExp): Promise<number> {
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const rows = main(page)
    .getByRole('region', { name: 'Cut list' })
    .getByRole('row')
    .filter({ hasText: name });
  let n = 0;
  for (const row of await rows.all()) n += Number(await row.getByRole('cell').nth(3).textContent());
  return n;
}

async function setField(scope: ReturnType<typeof editor>, label: string, v: string) {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(v);
  await field.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('the reference room builds: boxes, countertops and the fireplace in every view', async ({
  page,
}) => {
  await openReferenceRoom(page);
  await expect(editor(page).getByRole('alert')).toHaveCount(0);
  // 5 sections: base + upper each. Countertop pieces are in the cut list.
  expect(await qty(page, /^\d+Countertop edge/)).toBe(5);
  await page.getByRole('tab', { name: 'Elevation', exact: true }).click();
  await page.locator('#elevation-wall').selectOption({ label: 'Fireplace wall' });
  await expect(main(page).getByText('Fireplace + chimney breast')).toBeVisible();
  // Boxes from the built-in can be picked in a view; they open the built-in.
  await main(page)
    .getByRole('button', { name: 'Living room built-ins · Left tower base on elevation' })
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(
    editor(page).getByRole('button', { name: /^Left tower ·/, expanded: true }),
  ).toBeVisible();
});

test("acceptance #3: the run's shelf count re-spaces every linked bay", async ({ page }) => {
  await openReferenceRoom(page);
  // 5 upper bays × 4 shelves.
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(20);
  await setField(mediaRun(page), 'Shelves per bay', '5');
  // The media wall's 3 linked bays gain one each.
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(23);

  // Unlink the TV section: it keeps its own count when the run changes.
  await mediaRun(page)
    .getByRole('button', { name: /^TV section ·/ })
    .click();
  await mediaRun(page).getByLabel("Shelves follow the run's lines (5)").uncheck();
  await setField(mediaRun(page), 'Shelves in this bay', '2');
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(20);
  await setField(mediaRun(page), 'Shelves per bay', '3');
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(8 + 3 + 3 + 2);
});

test('acceptance #2: the countertop height moves the bases, the uppers and the top', async ({
  page,
}) => {
  await openReferenceRoom(page);
  await page.getByRole('tab', { name: 'Elevation', exact: true }).click();
  await page.locator('#elevation-wall').selectOption({ label: 'Media wall' });
  const upper = main(page).getByRole('button', {
    name: 'Living room built-ins · Left bay upper on elevation',
  });
  const before = await upper.boundingBox();
  await setField(mediaRun(page), 'Countertop height', '36');
  await expect
    .poll(async () => (await upper.boundingBox())?.height ?? 0)
    .toBeLessThan(before!.height);
  // Undo puts it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await upper.boundingBox())?.height).toBeCloseTo(before!.height, 0);
});

test('a built-in starts from an empty wall in a few steps; problems are shown', async ({
  page,
}) => {
  await sidebar(page).getByRole('button', { name: 'Add a built-in' }).click();
  await expect(editor(page)).toBeVisible();
  const run = editor(page).getByRole('region', { name: 'Run on Wall 1' });
  for (let i = 0; i < 2; i++) await run.getByLabel('Add a module').selectOption('section');
  // Stile, section, stile, section, stile.
  await expect(run.getByRole('list', { name: 'Modules' }).getByRole('listitem')).toHaveCount(5);
  await setField(run, 'Run length', '12');
  await expect(editor(page).getByRole('alert')).toContainText('auto-width section');
});

test('the built-in editor passes axe', async ({ page }) => {
  await openReferenceRoom(page);
  await mediaRun(page)
    .getByRole('button', { name: /^TV section ·/ })
    .click();
  const { violations } = await new AxeBuilder({ page })
    .include('[aria-label="Edit built-in"]')
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
