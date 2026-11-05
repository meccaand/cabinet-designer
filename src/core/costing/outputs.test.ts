/**
 * Project outputs end to end in core: cut list → nesting → estimate, on the sample kitchen
 * (checked by hand) and on a larger kitchen (benchmark: speed and sheet yield).
 */
import { describe, expect, it } from 'vitest';
import { buildCutList, cutName } from '../cutlist';
import { modelsOf, sample } from '../__tests__/sampleKitchen';
import { createBaseCabinet, createCabinet } from '../generate';
import { createProject } from '../model';
import { nestCutList } from '../nesting';
import { inch } from '../units';
import { BANDING_ALLOWANCE, estimate } from './index';

describe('buildCutList', () => {
  it('merges identical parts across cabinets and lists where they go', () => {
    const p = createProject('p', 'Twins');
    p.cabinets = [
      createBaseCabinet(p, { id: 'a', name: 'Base A', width: inch(30) }),
      createBaseCabinet(p, { id: 'b', name: 'Base B', width: inch(30) }),
      { ...createCabinet(p, 'wall', { id: 'broken', name: 'Broken' }), width: 10 },
    ];
    p.fillers = [
      {
        id: 'f',
        wallId: 'wall-1',
        offset: 0,
        width: inch(3),
        height: inch(30.5),
        elevation: inch(4),
        depth: 600,
      },
    ];
    const list = buildCutList(p, modelsOf(p));
    const ply = list.groups.find((g) => g.materialId === 'ply-18')!;
    // Left and right sides of both cabinets: one row of four.
    const sides = ply.rows.find((r) => r.name === 'Side')!;
    expect(sides).toMatchObject({ qty: 4, cabinets: ['Base A', 'Base B'] });
    expect(ply.rows.find((r) => r.name === 'Door')).toMatchObject({ qty: 4 });
    expect(ply.rows.find((r) => r.name === 'Filler')).toMatchObject({
      qty: 1,
      cabinets: ['Filler (Wall 1)'],
    });
    expect(list.groups.flatMap((g) => g.rows).some((r) => r.cabinets.includes('Broken'))).toBe(
      false,
    );

    // Rows are numbered 1..n across groups, longest first within a group.
    const numbers = list.groups.flatMap((g) => g.rows.map((r) => r.number));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    for (const g of list.groups) {
      const lengths = g.rows.map((r) => r.length);
      expect(lengths).toEqual([...lengths].sort((x, y) => y - x));
    }
    // Every part appears once, pointing at its row.
    const total = [...modelsOf(p).values()].reduce((n, m) => n + (m?.parts.length ?? 0), 0) + 1;
    expect(list.parts).toHaveLength(total);
    expect(list.groups.flatMap((g) => g.rows).reduce((n, r) => n + r.qty, 0)).toBe(total);
  });

  it('merges mirror-image part names', () => {
    expect(
      [
        'Left side',
        'Right end panel',
        'Door (L)',
        'Door (R) stile',
        'Drawer front',
        'Face frame stile',
      ].map(cutName),
    ).toEqual(['Side', 'End panel', 'Door', 'Door stile', 'Drawer front', 'Face frame stile']);
  });

  it('groups by material in library order: sheets then solid stock', () => {
    const p = sample();
    expect(buildCutList(p, modelsOf(p)).groups.map((g) => [g.materialId, g.kind])).toEqual([
      ['ply-18', 'sheet'],
      ['ply-12', 'sheet'],
      ['ply-5', 'sheet'],
      ['poplar-4-4', 'solid'],
    ]);
  });
});

describe('estimate (sample kitchen, checked by hand)', () => {
  const p = sample();
  const models = modelsOf(p);
  const list = buildCutList(p, models);
  const nests = nestCutList(p, list);
  const e = estimate(p, list, nests, models);

  it('totals hardware across cabinets', () => {
    // Hinges 4+4+0+4; slides 1+1+3 (all 22"); pulls 4+3+3+2; pins 4+4+0+8.
    expect(e.hardware.map((h) => [h.kind, h.qty, h.cost])).toEqual([
      ['hinge', 12, 48],
      ['slide', 5, 60],
      ['pull', 12, 60],
      ['shelfPin', 16, 1.6],
    ]);
  });

  it('prices face-frame and door-frame poplar in board feet from rough thickness, plus waste', () => {
    // Shaker base: FF stiles 2 × 30½ × 1½, rails 3 × 21 × 1½, door stiles 4 × 22 × 2¼,
    // door rails 4 × 6 7/16 × 2¼, slide spacers 2 × 22 × 2; all at 4/4 = 1" rough.
    const cubic = 2 * 30.5 * 1.5 + 3 * 21 * 1.5 + 4 * 22 * 2.25 + 4 * 6.4375 * 2.25 + 2 * 22 * 2;
    const bf = (cubic / 144) * 1.2;
    expect(e.solids).toHaveLength(1);
    expect(e.solids[0]!.boardFeet).toBeCloseTo(bf, 9);
    expect(e.solids[0]!.cost).toBeCloseTo(bf * 5, 9);
  });

  it('measures banding per edge with a 1" allowance and counts sheets per material', () => {
    const veneer = e.banding.find((b) => b.bandingId === 'veneer-0.5')!;
    const expected = list.parts.reduce((sum, { part }) => {
      const e = part.edges;
      const n = (id: string | null, len: number) =>
        id === 'veneer-0.5' ? len + BANDING_ALLOWANCE : 0;
      return (
        sum +
        n(e.long1, part.finished.length) +
        n(e.long2, part.finished.length) +
        n(e.end1, part.finished.width) +
        n(e.end2, part.finished.width)
      );
    }, 0);
    expect(veneer.length).toBeCloseTo(expected, 6);
    expect(e.sheets.map((s) => s.materialId)).toEqual(['ply-18', 'ply-12', 'ply-5']);
    for (const s of e.sheets) {
      expect(s.count).toBeGreaterThan(0);
      expect(s.yield).toBeGreaterThan(0);
      expect(s.yield).toBeLessThanOrEqual(1);
    }
    const sum = [...e.sheets, ...e.solids, ...e.banding, ...e.hardware].reduce(
      (t, x) => t + x.cost,
      0,
    );
    expect(e.total).toBeCloseTo(sum, 9);
  });

  it('places every sheet part', () => {
    expect(nests.every((n) => n.result.unplaced.length === 0)).toBe(true);
    const placed = nests.reduce(
      (n, x) => n + x.result.sheets.reduce((m, s) => m + s.placements.length, 0),
      0,
    );
    const sheetParts = list.parts.filter(({ part }) =>
      p.materials.sheets.some((s) => s.id === part.materialId),
    );
    expect(placed).toBe(sheetParts.length);
  });
});

describe('nesting benchmark: a 14-cabinet kitchen', () => {
  it('nests quickly with sensible yield', () => {
    const p = createProject('k', 'Kitchen');
    const types = [
      'base',
      'base',
      'drawerBank',
      'base',
      'blindBase',
      'base',
      'drawerBank',
      'tall',
      'wall',
      'wall',
      'wall',
      'blindWall',
      'wall',
      'openShelf',
    ] as const;
    p.cabinets = types.map((t, i) => createCabinet(p, t, { id: `c${i}` }));
    const models = modelsOf(p);
    expect([...models.values()].every(Boolean)).toBe(true);
    const list = buildCutList(p, models);

    const start = Date.now();
    const nests = nestCutList(p, list);
    const ms = Date.now() - start;

    const sheets = (id: string) => nests.find((n) => n.materialId === id)!.result;
    const area = list.parts
      .filter(({ part }) => part.materialId === 'ply-18')
      .reduce((s, { part }) => s + part.cut.length * part.cut.width, 0);
    const lowerBound = Math.ceil(area / (inch(96) * inch(48)));
    // Within 15% of the area bound for 3/4" (13 sheets is the floor); regression guards on the
    // sheet counts measured when the nester was written (the 1/4" backs match a hand layout).
    expect(sheets('ply-18').sheets.length).toBeLessThanOrEqual(Math.ceil(lowerBound * 1.15));
    expect(sheets('ply-18').sheets.length).toBeLessThanOrEqual(14);
    expect(sheets('ply-12').sheets.length).toBeLessThanOrEqual(2);
    expect(sheets('ply-5').sheets.length).toBeLessThanOrEqual(5);
    expect(ms).toBeLessThan(500);
  });
});

describe('estimate edge cases', () => {
  it('prices missing library items at zero and skips unused materials', () => {
    const p = createProject('e', 'Edge');
    p.cabinets = [createCabinet(p, 'openShelf', { id: 'o' })];
    p.materials = { ...p.materials, hardware: [] };
    p.fillers = [
      { id: 'f', wallId: 'gone', offset: 0, width: 50, height: 500, elevation: 0, depth: 300 },
    ];
    const models = modelsOf(p);
    const list = buildCutList(p, models);
    expect(list.groups[0]!.rows.find((r) => r.name === 'Filler')!.cabinets).toEqual(['Filler']);
    const e = estimate(p, list, nestCutList(p, list), models);
    expect(e.solids).toEqual([]); // frameless open shelving uses no solid stock
    expect(e.banding.map((b) => b.bandingId)).toEqual(['veneer-0.5']);
    expect(e.hardware).toEqual([
      { kind: 'shelfPin', itemId: null, name: 'Shelf pin', qty: 16, unitCost: 0, cost: 0 },
    ]);
  });

  it('counts no sheets for a material with nothing on it', () => {
    const p = createProject('e', 'Empty');
    const e = estimate(p, buildCutList(p, new Map()), [], new Map());
    expect(e).toEqual({ sheets: [], solids: [], banding: [], hardware: [], total: 0 });
    const ghost = {
      materialId: 'gone',
      materialName: 'Gone',
      result: { sheet: { length: 1, width: 1 }, sheets: [], unplaced: [] },
    };
    expect(estimate(p, buildCutList(p, new Map()), [ghost], new Map()).sheets).toEqual([
      { materialId: 'gone', name: 'Gone', count: 0, yield: 0, cost: 0 },
    ]);
  });

  it('lists slides by length, shortest first, and skips cabinets that fail to build', () => {
    const p = createProject('e', 'Slides');
    p.cabinets = [
      createCabinet(p, 'drawerBank', { id: 'deep' }),
      createCabinet(p, 'drawerBank', { id: 'shallow', depth: inch(18) }),
      { ...createCabinet(p, 'base', { id: 'broken' }), width: 10 },
    ];
    const models = modelsOf(p);
    const e = estimate(p, buildCutList(p, models), [], models);
    expect(
      e.hardware.filter((h) => h.kind === 'slide').map((h) => [h.length! / 25.4, h.qty]),
    ).toEqual([
      [16, 3],
      [22, 3],
    ]);
  });
});
