import { expect, test, type Page } from '@playwright/test';

const toolbar = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'View' }).getByRole('button', { name, exact: true });
const label = (page: Page, d: 'width' | 'height' | 'depth') =>
  page.locator(`[data-dimension=${d}]`);
/** A point on the cabinet. Measures the 3D view region: a fresh canvas briefly reports its
 * default 300 × 150 size before layout. */
const canvasCentre = async (page: Page) => {
  const box = (await page.getByRole('main', { name: 'Main view' }).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

test('shows the first sample cabinet with overall dimensions', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Frameless 30" base/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(label(page, 'width')).toHaveText('30"');
  await expect(label(page, 'height')).toHaveText('34 1/2"');
  await expect(label(page, 'depth')).toHaveText('24"');
  await expect(label(page, 'width')).toBeVisible();
});

test('click selects the cabinet, a second click picks the part under the cursor', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Parts' }).click();
  const { x, y } = await canvasCentre(page);
  const cabinet = page.getByRole('region', { name: 'Selected cabinet' });
  // The 3D view loads lazily and software WebGL can be slow to draw its first frames, so retry
  // until a click lands. Never click again once selected: that would drill into a part.
  await expect(async () => {
    if (await cabinet.isVisible()) return;
    await page.mouse.click(x, y);
    await expect(cabinet).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(cabinet.getByRole('heading', { level: 3 })).toHaveText('Frameless 30" base');
  await expect(cabinet).toContainText('4 × Concealed hinge');

  await page.mouse.click(x, y);
  const part = page.getByRole('region', { name: 'Selected part' });
  await expect(part.getByRole('heading')).toHaveText(/Door \((L|R)\)/);
  await expect(part.getByTestId('cut-size')).toHaveText('24 1/4" × 14 7/8" × ≈11/16"');

  // Clicking empty space clears the selection.
  const view = (await page.getByRole('main', { name: 'Main view' }).boundingBox())!;
  await page.mouse.click(view.x + 20, view.y + view.height - 20);
  await expect(page.getByText('Click the cabinet to select it')).toBeVisible();
});

test('parts can be picked from the list and hidden by group', async ({ page }) => {
  await page.getByRole('tab', { name: 'Parts' }).click();
  const parts = page.getByRole('region', { name: 'Parts' });
  await parts.getByRole('button', { name: /^Bottom/ }).click();
  await expect(
    page.getByRole('region', { name: 'Selected part' }).getByTestId('cut-size'),
  ).toHaveText('≈29 1/16" × ≈23 13/16" × ≈11/16"');

  const fronts = parts.getByRole('checkbox', { name: 'Doors & fronts' });
  await fronts.uncheck();
  await expect(parts.getByRole('checkbox', { name: 'Show Door (L)' })).toBeDisabled();
  await parts.getByRole('checkbox', { name: 'Show Left side' }).uncheck();
  await parts.getByRole('button', { name: 'Show all' }).click();
  await expect(fronts).toBeChecked();
  await expect(parts.getByRole('checkbox', { name: 'Show Left side' })).toBeChecked();
});

test('display toggles and standard views', async ({ page }) => {
  for (const name of ['Exploded', 'X-ray']) {
    await toolbar(page, name).click();
    await expect(toolbar(page, name)).toHaveAttribute('aria-pressed', 'true');
  }
  // Overall dimensions describe the assembled cabinet, so they hide while exploded.
  await expect(label(page, 'width')).toHaveCount(0);
  await toolbar(page, 'Exploded').click();
  await expect(label(page, 'width')).toBeVisible();

  await toolbar(page, 'Front').click();
  await expect(toolbar(page, 'Front')).toHaveAttribute('aria-pressed', 'true');
  // Seen from the front, depth runs straight at the camera: no label.
  await expect(label(page, 'depth')).toBeHidden();
  await expect(label(page, 'width')).toBeVisible();

  await toolbar(page, 'Dimensions').click();
  await expect(label(page, 'height')).toHaveCount(0);
});

test('switching cabinets shows the other cabinet', async ({ page }) => {
  await page.getByRole('button', { name: /Face-frame 24" shaker base/ }).click();
  await expect(label(page, 'width')).toHaveText('24"');
  await page.getByRole('tab', { name: 'Parts' }).click();
  await expect(page.getByRole('region', { name: 'Parts' })).toContainText('Face frame stile');
  await expect(page.getByRole('region', { name: 'Parts' })).toContainText('Slide spacer');
});
