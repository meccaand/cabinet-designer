import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Every axe rule violation on the page, as readable lines (WCAG 2.1 AA and best practice). */
async function violations(page: Page, where: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.map(
    (v) =>
      `${where}: ${v.id} (${v.impact}) ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every view and dialog passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Saved');
    const found: string[] = [];
    found.push(...(await violations(page, '3D')));
    for (const tab of ['Plan', 'Elevation', 'Cut list', 'Sheets', 'Materials & cost']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      found.push(...(await violations(page, tab)));
    }
    await page.getByRole('tab', { name: 'Parts' }).click();
    found.push(...(await violations(page, 'Parts')));
    await page
      .getByRole('banner')
      .getByRole('button', { name: /Sample kitchen/ })
      .click();
    found.push(...(await violations(page, 'Projects dialog')));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    found.push(...(await violations(page, 'Shortcuts dialog')));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export ▾' }).click();
    found.push(...(await violations(page, 'Export menu')));
    expect(found).toEqual([]);
  });
}

test('the room layout works from the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.keyboard.press('2'); // plan
  const plan = page.getByRole('group', { name: /^Plan of/ });
  const item = plan.getByRole('button', { name: '18" drawer base on plan' });
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  const fromStart = page.getByLabel('From wall start');
  await expect(fromStart).toHaveValue('54"');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(fromStart).toHaveValue('55"');
  await expect(item).toBeFocused();

  // The cut list scrolls from the keyboard.
  await page.keyboard.press('4');
  await expect(page.getByRole('region', { name: 'Cut list' })).toHaveAttribute('tabindex', '0');
});
