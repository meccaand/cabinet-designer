/**
 * Golden outputs for the spec's reference room (docs/BUILTIN-SPEC.md §5), committed under
 * docs/golden/ for a woodworker to review. Any change to what the room cuts or buys shows up
 * as a diff to those files; after checking it, accept it with `npx vitest run -u`.
 */
import { describe, expect, it } from 'vitest';
import { expandProject, mouldingTotals } from '../builtin';
import { estimate } from '../costing';
import { buildCutList } from '../cutlist';
import { generateCabinet } from '../generate';
import { guillotineNester, nestCutList } from '../nesting';
import { cutListCsv, shoppingListCsv } from '../report';
import { referenceRoom } from './referenceRoom';

function outputs() {
  const e = expandProject(referenceRoom());
  const models = new Map(
    e.project.cabinets.map((c) => {
      const r = generateCabinet(c, e.project);
      return [c.id, r.ok ? r.model : null] as const;
    }),
  );
  const cutList = buildCutList(
    e.project,
    models,
    e.assemblies.map((a) => ({ id: a.id, name: a.name, parts: a.model.parts })),
  );
  const nests = nestCutList(e.project, cutList, guillotineNester);
  const est = estimate(e.project, cutList, nests, models, {
    hardware: e.assemblies.flatMap((a) => a.model.hardware),
    mouldings: mouldingTotals(e.assemblies.flatMap((a) => a.mouldings)),
  });
  return { e, models, cutList, est };
}

describe('the reference room (golden)', () => {
  it('builds without errors', () => {
    const { e, models } = outputs();
    expect([...e.errors.values()].flat()).toEqual([]);
    expect([...models.values()].every((m) => m !== null)).toBe(true);
  });

  it('cut list', async () => {
    const { e, cutList } = outputs();
    await expect(cutListCsv(e.project, cutList)).toMatchFileSnapshot(
      '../../../docs/golden/reference-room-cut-list.csv',
    );
  });

  it('shopping list', async () => {
    const { e, est } = outputs();
    await expect(shoppingListCsv(e.project, est)).toMatchFileSnapshot(
      '../../../docs/golden/reference-room-shopping-list.csv',
    );
  });
});
