import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Cabinets' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
  // A new L-shaped room: 120" then 96".
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Sample kitchen/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Projects' })
    .getByRole('button', { name: 'New project', exact: true })
    .click();
  await main(page).getByRole('button', { name: 'L-shaped' }).click();
  await main(page).getByRole('button', { name: 'Create room' }).click();
});

test('an L-shaped base sits in the corner, turns onto the next wall and is cut in two-piece panels', async ({
  page,
}) => {
  await sidebar(page).getByLabel('Add a cabinet').selectOption({ label: 'L-shaped base' });
  const editor = page.getByRole('region', { name: 'Edit cabinet' });
  await expect(editor.getByRole('textbox', { name: 'Return width' })).toHaveValue('36"');
  await expect(editor).toContainText(
    'In the corner at the end of Wall 1; its return runs along Wall 2.',
  );
  await expect(editor.getByLabel('From wall start')).toHaveCount(0);

  // The next cabinet carries on along the return's wall.
  await sidebar(page).getByLabel('Add a cabinet').selectOption({ label: 'Base cabinet' });
  await page.getByRole('tab', { name: 'Plan' }).click();
  const plan = main(page).getByRole('group', { name: /^Plan of/ });
  await expect(plan.getByRole('button', { name: 'L-shaped base 1 on plan' })).toBeVisible();
  await expect(
    plan.getByRole('button', { name: 'L-shaped base 1 (return) on plan' }),
  ).toBeVisible();
  await expect(main(page).getByRole('list', { name: 'Layout problems' })).toBeEmpty();

  await page.getByRole('tab', { name: 'Elevation' }).click();
  await main(page).getByLabel('Wall', { exact: true }).selectOption({ label: 'Wall 2' });
  await expect(
    main(page).getByRole('button', { name: 'L-shaped base 1 (return) on elevation' }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Cut list' }).click();
  const list = main(page).getByRole('region', { name: 'Cut list' });
  await expect(list.getByRole('row').filter({ hasText: 'Bottom (return)' })).toContainText(
    'One of two pieces of the L-shaped bottom',
  );
  await expect(list.getByRole('row').filter({ hasText: 'Door (return)' })).toContainText('Bi-fold');
});

test('L-shaped open shelving has fixed shelves; the face offers bi-fold doors or open', async ({
  page,
}) => {
  await sidebar(page).getByLabel('Add a cabinet').selectOption({ label: 'L-shaped open shelving' });
  const editor = page.getByRole('region', { name: 'Edit cabinet' });
  await editor.getByRole('button', { name: 'Opening 1: Open' }).click();
  const fill = editor.getByRole('group', { name: 'Fill' });
  await expect(fill.getByRole('button')).toHaveText(['Bi-fold doors', 'Open']);
  await expect(editor.getByLabel('Adjustable')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Split into rows' })).toHaveCount(0);
  await editor.getByRole('spinbutton', { name: 'Shelves' }).fill('2');
  await page.getByRole('tab', { name: 'Parts' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Properties' }).getByText(/Fixed shelf/),
  ).not.toHaveCount(0);
});
