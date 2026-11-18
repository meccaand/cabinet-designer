import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { referenceRoom } from '../src/core/__tests__/referenceRoom';

const main = (page: Page) => page.getByRole('main', { name: 'Main view' });
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Cabinets' });
const editor = (page: Page) => page.getByRole('region', { name: 'Edit built-in' });
const mediaRun = (page: Page) => editor(page).getByRole('region', { name: 'Run on Media wall' });

/** Import a project through the Projects dialog. */
async function importProject(page: Page, project: object) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^(Sample kitchen|Reference living room)/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Projects' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(dialog).toBeHidden();
}

/** Open the spec's reference room by importing it. */
async function openReferenceRoom(page: Page) {
  await importProject(page, referenceRoom());
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
  // 4 towers and bays × 4 shelves, and the TV niche's bridge shelf.
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(17);
  await setField(mediaRun(page), 'Shelves per bay', '5');
  // The media wall's 2 linked bays gain one each; the bridge stays on the top line.
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(19);

  // Unlink the left bay: it keeps its own count when the run changes.
  await mediaRun(page)
    .getByRole('button', { name: /^Left bay ·/ })
    .click();
  await mediaRun(page).getByLabel("Shelves follow the run's lines (5)").uncheck();
  await setField(mediaRun(page), 'Shelves in this bay', '2');
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(16);
  await setField(mediaRun(page), 'Shelves per bay', '3');
  expect(await qty(page, /^\d+Fixed shelf/)).toBe(8 + 2 + 3 + 1);
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

test('acceptance #4: crown runs across the fireplace and mitres at the corner', async ({
  page,
}) => {
  await openReferenceRoom(page);
  const crown = () =>
    main(page)
      .getByRole('row')
      .filter({ hasText: /^Crown moulding/ });
  await page.getByRole('tab', { name: 'Materials & cost' }).click();
  await expect(crown()).toContainText('1 inside corner, 1 outside corner with return');
  await expect(
    main(page)
      .getByRole('row')
      .filter({ hasText: /^Picture light/ }),
  ).toContainText('4');
  const across = Number((await crown().textContent())!.match(/([\d.]+) ft/)![1]);

  // Stop the crown at the fireplace: there is less of it.
  const fireRun = editor(page).getByRole('region', { name: 'Run on Fireplace wall' });
  await fireRun.getByRole('button', { name: /^Fireplace \+ chimney breast ·/ }).click();
  await fireRun.getByLabel('Crown and frieze').selectOption('stop');
  await page.getByRole('tab', { name: 'Materials & cost' }).click();
  await expect
    .poll(async () => Number((await crown().textContent())!.match(/([\d.]+) ft/)![1]))
    .toBeLessThan(across);
});

/** Every cut list row as part, quantity and size, sorted: what a shop cuts, whichever cabinet
 * each goes to. */
async function cutRows(page: Page): Promise<string[]> {
  await page.getByRole('tab', { name: 'Cut list' }).click();
  const rows = main(page).getByRole('region', { name: 'Cut list' }).getByRole('row');
  await expect(rows.first()).toBeVisible();
  const out: string[] = [];
  for (const row of await rows.all()) {
    const cells = await row.getByRole('cell').allTextContents();
    if (cells.length < 7) continue;
    out.push([cells[1], cells[3], cells[4], cells[5], cells[6]].join(' | '));
  }
  return out.sort();
}

test('acceptance #1: both reference walls from presets, in under 10 actions each', async ({
  page,
}) => {
  // The reference room's two walls, with nothing on them.
  await importProject(page, { ...referenceRoom(), builtIns: [], stylePresets: [] });
  let actions = 0;
  const act = async (f: () => Promise<unknown>) => {
    actions++;
    await f();
  };

  // Fireplace wall: open to the room on the left, from 12"; a narrow one-door right tower and a
  // pilaster on the left only.
  await act(() => sidebar(page).getByRole('button', { name: 'Add a built-in' }).click());
  const fire = editor(page).getByRole('region', { name: 'Run on Fireplace wall' });
  await act(() => fire.getByLabel('Lay out the wall').selectOption('fireplace'));
  await act(() => setField(fire, 'From wall start', '12'));
  await act(() => fire.getByLabel('Left end meets').selectOption('open'));
  await act(() => fire.getByRole('button', { name: /^Right tower ·/ }).click());
  await act(() => setField(fire, 'Opening width', '18'));
  await act(() => fire.getByLabel('Group 1', { exact: true }).selectOption('1'));
  await act(() => fire.getByRole('button', { name: 'Remove Pilaster' }).nth(1).click());
  expect(actions).toBeLessThanOrEqual(10);
  await expect(fire.getByLabel('Group 1 hinged')).toHaveValue('right');

  // Media wall: it meets the fireplace wall round the corner by itself, with a blind base and
  // wrap-around shelves; the spec's room has a dead corner.
  actions = 0;
  await act(() => editor(page).getByLabel('Add a run').selectOption({ label: 'Media wall' }));
  await act(() => mediaRun(page).getByLabel('Lay out the wall').selectOption('media'));
  await act(() => mediaRun(page).getByLabel('Left corner base').selectOption('dead'));
  await act(() => mediaRun(page).getByLabel('Left corner uppers').selectOption('dead'));
  expect(actions).toBeLessThanOrEqual(10);

  await expect(editor(page).getByRole('alert')).toHaveCount(0);
  const built = await cutRows(page);
  expect(built.length).toBeGreaterThan(50);
  await openReferenceRoom(page);
  expect(built).toEqual(await cutRows(page));
});

test('a corner gets a blind base and wrap-around shelves, set from either run', async ({
  page,
}) => {
  await openReferenceRoom(page);
  const fireRun = editor(page).getByRole('region', { name: 'Run on Fireplace wall' });
  await fireRun.getByLabel('Right corner base').selectOption('blind');
  await fireRun.getByLabel('Right corner uppers').selectOption('wrap');
  await expect(editor(page).getByRole('alert')).toHaveCount(0);
  // The media run shows the same corner, and which run's box takes it.
  await expect(mediaRun(page).getByLabel('Left corner base')).toHaveValue('blind');
  await expect(mediaRun(page).getByLabel('Left corner uppers')).toHaveValue('wrap');
  await expect(mediaRun(page).getByLabel('Left corner blind box in')).toHaveValue('theirs');
  // The fireplace run now runs up to the media run's face.
  await expect(fireRun.getByLabel('Run length', { exact: true })).toHaveValue('126"');

  expect(await qty(page, /^\d+Face frame blind stile/)).toBe(1);
  expect(await qty(page, /^\d+Fixed shelf \(run\)/)).toBe(4);
  // Picking the corner shelves in a view opens the bay they start from.
  await page.getByRole('tab', { name: 'Elevation', exact: true }).click();
  await page.locator('#elevation-wall').selectOption({ label: 'Fireplace wall' });
  await main(page)
    .getByRole('button', {
      name: 'Living room built-ins · Corner shelves (Right tower + Left bay) on elevation',
    })
    .click();
  await expect(
    fireRun.getByRole('button', { name: /^Right tower ·/, expanded: true }),
  ).toBeVisible();

  // Back to a dead corner.
  await mediaRun(page).getByLabel('Left corner base').selectOption('dead');
  await expect(fireRun.getByLabel('Run length', { exact: true })).toHaveValue('123"');
  expect(await qty(page, /^\d+Face frame blind stile/)).toBe(0);
});

test('a built-in per wall: the corner asks to join them, and joining fits the corner', async ({
  page,
}) => {
  await importProject(page, { ...referenceRoom(), builtIns: [], stylePresets: [] });
  await sidebar(page).getByRole('button', { name: 'Add a built-in' }).click();
  const fire = editor(page).getByRole('region', { name: 'Run on Fireplace wall' });
  await fire.getByLabel('Lay out the wall').selectOption('fireplace');
  await fire.getByLabel('Right end meets').selectOption('corner');
  // A second built-in, on the media wall.
  await page.getByRole('tab', { name: 'Elevation', exact: true }).click();
  await page.locator('#elevation-wall').selectOption({ label: 'Media wall' });
  await sidebar(page).getByRole('button', { name: 'Add a built-in' }).click();
  await mediaRun(page).getByLabel('Lay out the wall').selectOption('media');
  await mediaRun(page).getByLabel('Left end meets').selectOption('corner');
  await expect(editor(page).getByRole('alert')).toContainText(
    'that run is in “Built-in”. Runs meet round a corner only within one built-in',
  );

  await mediaRun(page).getByRole('button', { name: 'Join “Built-in” into this built-in' }).click();
  await expect(editor(page).getByRole('alert')).toHaveCount(0);
  await expect(sidebar(page).getByRole('button', { name: /^Built-in/ })).toHaveCount(1);
  await expect(sidebar(page).getByRole('button', { name: /Built-in 2 · 2 runs/ })).toBeVisible();
  await expect(mediaRun(page).getByLabel('Left corner base')).toHaveValue('blind');
  // Undo splits them again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebar(page).getByRole('button', { name: /^Built-in/ })).toHaveCount(2);
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
