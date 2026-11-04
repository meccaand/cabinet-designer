/**
 * Golden reference cabinets. Expected cut sizes were calculated by hand, separately from this
 * code, and are listed for review in docs/CONSTRUCTION.md "Golden cabinets". If a convention
 * changes on purpose, update both places.
 */
import { describe, expect, it } from 'vitest';
import { createProject, type Cabinet, type ConstructionOverrides } from '../model';
import type { Part, PartRole } from '../parts';
import { inch } from '../units';
import { violations } from './__tests__/invariants';
import { createBaseCabinet, createCabinet, generateCabinet } from './index';

type Row = [
  select: (p: Part) => boolean,
  qty: number,
  length: number,
  width: number,
  thickness: number,
];

const role = (r: PartRole) => (p: Part) => p.role === r;
const named = (n: string) => (p: Part) => p.name === n;
const id = (re: RegExp) => (p: Part) => re.test(p.id);

function check(cabinet: Cabinet, rows: Row[], hardware: [string, number, number?][]) {
  const project = createProject('p', 'Golden');
  const result = generateCabinet(cabinet, project);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const { parts } = result.model;

  expect(violations(result.model, cabinet, project)).toEqual([]);
  const claimed = new Set<string>();
  for (const [select, qty, length, width, thickness] of rows) {
    const matches = parts.filter(select);
    expect(matches.map((m) => m.id)).toHaveLength(qty);
    for (const m of matches) {
      claimed.add(m.id);
      expect(m.cut.length).toBeCloseTo(length, 3);
      expect(m.cut.width).toBeCloseTo(width, 3);
      expect(m.cut.thickness).toBeCloseTo(thickness, 3);
    }
  }
  // Every generated part is accounted for by the hand-calculated list.
  expect(parts.filter((p) => !claimed.has(p.id)).map((p) => p.id)).toEqual([]);
  expect(result.model.hardware.map((h) => [h.kind, h.qty, h.length])).toEqual(
    hardware.map(([k, q, l]) => [k, q, l === undefined ? undefined : inch(l)]),
  );
}

function cabinet(
  width: number,
  layout: 'drawerOverDoors' | 'drawers',
  construction: ConstructionOverrides,
) {
  return createBaseCabinet(createProject('p', 'Golden'), {
    id: 'c',
    width: inch(width),
    layout,
    construction,
  });
}

describe('golden reference cabinets', () => {
  it('G1: frameless 30", dado, inset back, stretchers, slab overlay', () => {
    check(
      cabinet(30, 'drawerOverDoors', {}),
      [
        [role('side'), 2, 774.7, 609.6, 18],
        [role('bottom'), 1, 738.7, 604.4, 18],
        [role('stretcher'), 2, 738.7, 101.6, 18],
        [role('back'), 1, 774.7, 745.05, 5.2],
        [role('platformRail'), 2, 762, 101.6, 18],
        [role('platformCrossMember'), 3, 497.4, 101.6, 18],
        [named('Drawer front'), 1, 758.825, 152.4, 18],
        [id(/front\/1\/[LR]$/), 2, 615.95, 377.825, 18],
        [role('drawerSide'), 2, 558.8, 112.175, 12],
        [role('drawerEnd'), 2, 676.6, 112.175, 12],
        [role('drawerBottom'), 1, 687.7125, 545.9125, 5.2],
        [role('shelfAdjustable'), 1, 724.4125, 598.05, 18],
      ],
      [
        ['hinge', 4],
        ['slide', 1, 22],
        ['pull', 4],
        ['shelfPin', 4],
      ],
    );
  });

  it('G2: face frame 24", pocket screws, applied back, full top, shaker overlay', () => {
    check(
      cabinet(24, 'drawerOverDoors', {
        carcass: { style: 'faceFrame', joinery: 'pocket', back: 'applied', baseTop: 'full' },
        fronts: { style: 'shaker' },
      }),
      [
        [role('side'), 2, 774.7, 585.35, 18],
        [role('bottom'), 1, 573.6, 585.35, 18],
        [role('top'), 1, 573.6, 585.35, 18],
        [role('back'), 1, 774.7, 609.6, 5.2],
        [role('platformRail'), 2, 609.6, 101.6, 18],
        [role('platformCrossMember'), 2, 497.4, 101.6, 18],
        [role('ffStile'), 2, 774.7, 38.1, 19.05],
        [role('ffRail'), 3, 533.4, 38.1, 19.05],
        [role('slabFront'), 1, 558.8, 152.4, 18],
        [role('frontStile'), 4, 558.8, 57.15, 19.05],
        [role('frontRail'), 4, 163.5125, 57.15, 19.05],
        [role('frontPanel'), 2, 455.6125, 174.625, 5.2],
        [role('drawerSide'), 2, 558.8, 101.6, 12],
        [role('drawerEnd'), 2, 484, 101.6, 12],
        [role('drawerBottom'), 1, 495.1125, 545.9125, 5.2],
        [role('slideSpacer'), 2, 558.8, 50.8, 20.1],
        [role('shelfAdjustable'), 1, 572.0125, 579, 18],
      ],
      [
        ['hinge', 4],
        ['slide', 1, 22],
        ['pull', 3],
        ['shelfPin', 4],
      ],
    );
  });

  it('G3: frameless 18" three-drawer base, butt joints, grooved back', () => {
    const top = id(/drawer\/0\//);
    const mid = id(/drawer\/1\//);
    const low = id(/drawer\/2\//);
    const and = (a: (p: Part) => boolean, b: (p: Part) => boolean) => (p: Part) => a(p) && b(p);
    check(
      cabinet(18, 'drawers', { carcass: { joinery: 'butt', back: 'dado' } }),
      [
        [role('side'), 2, 774.7, 609.6, 18],
        [role('bottom'), 1, 421.2, 609.6, 18],
        [role('stretcher'), 2, 421.2, 101.6, 18],
        [role('back'), 1, 766.225, 440.25, 5.2],
        [role('platformRail'), 2, 457.2, 101.6, 18],
        [role('platformCrossMember'), 2, 497.4, 101.6, 18],
        [id(/front\/0$/), 1, 454.025, 152.4, 18],
        [id(/front\/[12]$/), 2, 454.025, 306.3875, 18],
        [and(role('drawerSide'), top), 2, 558.8, 112.175, 12],
        [and(role('drawerSide'), mid), 2, 558.8, 280.9875, 12],
        [and(role('drawerSide'), low), 2, 558.8, 262.9875, 12],
        [and(role('drawerEnd'), top), 2, 371.8, 112.175, 12],
        [and(role('drawerEnd'), mid), 2, 371.8, 280.9875, 12],
        [and(role('drawerEnd'), low), 2, 371.8, 262.9875, 12],
        [role('drawerBottom'), 3, 382.9125, 545.9125, 5.2],
      ],
      [
        ['slide', 3, 22],
        ['pull', 3],
      ],
    );
  });

  it('G4: frameless wall cabinet with hanging rail', () => {
    check(
      createCabinet(createProject('p', 'Golden'), 'wall', { id: 'c' }),
      [
        [role('side'), 2, 762, 304.8, 18],
        [role('bottom'), 1, 738.7, 299.6, 18],
        [role('top'), 1, 738.7, 299.6, 18],
        [role('back'), 1, 762, 745.05, 5.2],
        [role('hangingRail'), 1, 726, 76.2, 18],
        [role('slabFront'), 2, 758.825, 377.825, 18],
        [role('shelfAdjustable'), 2, 724.4125, 275.25, 18],
      ],
      [
        ['hinge', 4],
        ['pull', 2],
        ['shelfPin', 8],
      ],
    );
  });

  it('G5: frameless tall cabinet with a fixed shelf at the door split', () => {
    check(
      createCabinet(createProject('p', 'Golden'), 'tall', { id: 'c' }),
      [
        [role('side'), 2, 2032, 609.6, 18],
        [role('bottom'), 1, 586.3, 604.4, 18],
        [role('top'), 1, 586.3, 604.4, 18],
        [role('back'), 1, 2032, 592.65, 5.2],
        [role('platformRail'), 2, 609.6, 101.6, 18],
        [role('platformCrossMember'), 2, 497.4, 101.6, 18],
        [role('slabFront'), 4, 1013.61875, 301.625, 18],
        [role('shelfFixed'), 1, 586.3, 604.4, 18],
        [role('shelfAdjustable'), 5, 572.0125, 598.05, 18],
      ],
      [
        ['hinge', 8],
        ['pull', 4],
        ['shelfPin', 20],
      ],
    );
  });

  it('G6: frameless blind corner base, blind end left', () => {
    check(
      createCabinet(createProject('p', 'Golden'), 'blindBase', { id: 'c' }),
      [
        [role('side'), 2, 774.7, 609.6, 18],
        [role('bottom'), 1, 1043.5, 604.4, 18],
        [role('stretcher'), 2, 1043.5, 101.6, 18],
        [role('back'), 1, 774.7, 1049.85, 5.2],
        [role('platformRail'), 2, 1066.8, 101.6, 18],
        [role('platformCrossMember'), 3, 497.4, 101.6, 18],
        [role('blindPanel'), 1, 771.525, 631.825, 18],
        [id(/front\/0$/), 1, 428.625, 152.4, 18],
        [id(/front\/1$/), 1, 615.95, 428.625, 18],
        [role('filler'), 1, 771.525, 76.2, 18],
        [role('shelfAdjustable'), 1, 1029.2125, 598.05, 18],
      ],
      [
        ['hinge', 2],
        ['pull', 1],
        ['shelfPin', 4],
      ],
    );
  });
});
