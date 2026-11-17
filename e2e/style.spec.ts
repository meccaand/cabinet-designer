import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const editor = (page: Page) => page.getByRole('region', { name: 'Edit cabinet' });
const style = (page: Page) =>
  editor(page).getByRole('group', { name: 'Style Traditional painted built-in' });

/** The text of every "Door stile" row in the cut list. */
async function doorStileRows(page: Page): Promise<string[]> {
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const list = main(page).getByRole('region', { name: 'Cut list' });
  return list
    .getByRole('row')
    .filter({ hasText: /^\d+Door stile/ })
    .allTextContents();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('a style preset restyles its cabinets; inset → overlay updates the cut list', async ({
  page,
}) => {
  await editor(page)
    .getByLabel('Follows')
    .selectOption({ label: 'New style: Traditional painted built-in…' });
  await expect(editor(page).getByLabel('Follows')).toHaveValue(/.+/);
  await editor(page).getByText('Edit “Traditional painted built-in”').click();
  await expect(style(page).getByLabel('Mounting')).toHaveValue('inset');

  // Shaker doors now: door stiles appear in the cut list.
  const inset = await doorStileRows(page);
  expect(inset.length).toBeGreaterThan(0);

  await style(page).getByLabel('Mounting').selectOption('overlay');
  const overlay = await doorStileRows(page);
  expect(overlay.length).toBeGreaterThan(0);
  expect(overlay).not.toEqual(inset);

  // Knobs are bought instead of pulls.
  await page.getByRole('tab', { name: 'Materials & cost' }).click();
  await expect(main(page).getByRole('cell', { name: 'Knob', exact: true })).toBeVisible();

  // One undo puts the mounting back, and the cut list with it.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await doorStileRows(page)).toEqual(inset);
});

test('the style editor passes axe', async ({ page }) => {
  await editor(page)
    .getByLabel('Follows')
    .selectOption({ label: 'New style: Traditional painted built-in…' });
  await editor(page).getByText('Edit “Traditional painted built-in”').click();
  await expect(style(page)).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include('[aria-label="Edit cabinet"]')
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
