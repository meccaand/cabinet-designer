import { expect, test, type Page } from '@playwright/test';

const label = (page: Page, d: 'width' | 'height' | 'depth') =>
  page.locator(`[data-dimension=${d}]`);
const editor = (page: Page) => page.getByRole('region', { name: 'Edit cabinet' });
const field = (page: Page, name: string) => editor(page).getByLabel(name, { exact: true });

async function setLength(page: Page, name: string, text: string) {
  const input = field(page, name);
  await input.fill(text);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editor(page)).toBeVisible();
});

test('typing a fractional width rebuilds the cabinet and its parts', async ({ page }) => {
  await setLength(page, 'Width', '36 1/2');
  await expect(label(page, 'width')).toHaveText('36 1/2"');
  await expect(page.getByRole('button', { name: /Frameless 30" base/ })).toContainText(
    '36 1/2" × 34 1/2" × 24"',
  );

  await page.getByRole('tab', { name: 'Parts' }).click();
  await page
    .getByRole('region', { name: 'Parts' })
    .getByRole('button', { name: /^Bottom/ })
    .click();
  // 36 1/2" − 2 × 18 mm sides + 2 × 1/4" rabbets = 35.583" → nearest 1/16".
  await expect(page.getByTestId('cut-size')).toHaveText('≈35 9/16" × ≈23 13/16" × ≈11/16"');
});

test('metric and feet-inch input both work in an imperial project', async ({ page }) => {
  await setLength(page, 'Width', '900mm');
  await expect(label(page, 'width')).toHaveText('≈35 7/16"');
  await setLength(page, 'Height', `2' 10-1/2"`);
  await expect(label(page, 'height')).toHaveText('34 1/2"');
});

test('bad input is explained and can be abandoned', async ({ page }) => {
  const width = field(page, 'Width');
  await width.fill('abc');
  await width.press('Enter');
  await expect(editor(page).getByRole('alert')).toContainText(`Can't read "abc"`);
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await width.press('Escape');
  await expect(width).toHaveValue('30"');
  await expect(label(page, 'width')).toHaveText('30"');

  await width.fill('0');
  await width.press('Enter');
  await expect(editor(page).getByRole('alert')).toContainText('more than zero');
});

test('openings can be refilled, split and removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Opening 1: Drawer' }).click();
  const opening = page.getByRole('region', { name: 'Selected opening' });
  await opening.getByRole('button', { name: 'False front' }).click();
  await expect(page.getByRole('button', { name: 'Opening 1: False front' })).toBeVisible();

  await page.getByRole('button', { name: 'Opening 2: Pair of doors' }).click();
  await opening.getByRole('button', { name: 'Split into rows' }).click();
  await expect(page.getByRole('button', { name: /^Opening 3:/ })).toBeVisible();
  await page.getByRole('button', { name: 'Opening 3: Pair of doors' }).click();
  await opening.getByRole('button', { name: 'Drawer' }).click();
  await opening.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: /^Opening 3:/ })).toHaveCount(0);
});

test('an opening that does not fit is reported instead of drawn', async ({ page }) => {
  await page.getByRole('button', { name: 'Opening 1: Drawer' }).click();
  await setLength(page, 'Front height', '40');
  await expect(page.getByRole('main', { name: 'Main view' }).getByRole('alert')).toContainText(
    "can't be built as specified",
  );
  await expect(editor(page).getByRole('alert').first()).toContainText('leave no room');
});

test('adds cabinets of every type, switches units, and deletes', async ({ page }) => {
  const sidebar = page.getByRole('complementary', { name: 'Cabinets' });
  await sidebar.getByLabel('Add a cabinet').selectOption('wall');
  await expect(sidebar.getByRole('button', { name: /Wall cabinet 2/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(label(page, 'depth')).toHaveText('12"');
  await expect(field(page, 'Name')).toHaveValue('Wall cabinet 2');

  for (const type of ['blindBase', 'tall', 'openShelf', 'drawerBank', 'blindWall']) {
    await sidebar.getByLabel('Add a cabinet').selectOption(type);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Main view' }).getByRole('alert')).toHaveCount(0);
  }
  await expect(sidebar.getByRole('listitem')).toHaveCount(10);

  await page.getByRole('combobox', { name: 'Units' }).selectOption('mm0');
  await expect(label(page, 'width')).toHaveText('≈914 mm'); // 36" = 914.4 mm
  await expect(field(page, 'Width')).toHaveValue('≈914 mm');

  await editor(page).getByRole('button', { name: 'Delete cabinet' }).click();
  await expect(sidebar.getByRole('listitem')).toHaveCount(9);
});
