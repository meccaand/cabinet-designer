/** L-shaped cabinets: every construction combination, and the rules specific to them. */
import { describe, expect, it } from 'vitest';
import { createProject, type Cabinet, type ConstructionOverrides } from '../model';
import { inch } from '../units';
import { violations } from './__tests__/invariants';
import { createCabinet, generateCabinet } from './index';

const project = createProject('p', 'Corner');
const make = (type: 'lBase' | 'lShelf', over: Partial<Cabinet> = {}): Cabinet => ({
  ...createCabinet(project, type, { id: 'c' }),
  ...over,
});
const build = (cab: Cabinet) => {
  const r = generateCabinet(cab, project);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.model;
};
const errorsOf = (cab: Cabinet) => {
  const r = generateCabinet(cab, project);
  return r.ok ? '' : r.errors.join();
};

const combos: ConstructionOverrides[] = [];
for (const style of ['frameless', 'faceFrame'] as const)
  for (const joinery of ['dado', 'rabbet', 'butt', 'pocket'] as const)
    for (const back of ['inset', 'applied', 'dado'] as const)
      for (const baseTop of ['stretchers', 'full'] as const)
        for (const mount of ['overlay', 'inset'] as const)
          for (const front of ['slab', 'shaker'] as const)
            combos.push({
              carcass: { style, joinery, back, baseTop },
              fronts: { mount, style: front },
            });

describe.each(['lBase', 'lShelf'] as const)('%s: every construction', (type) => {
  it.each(combos.map((k) => [JSON.stringify(k), k] as const))('%s', (_label, construction) => {
    for (const ends of [false, true]) {
      const cab = make(type, { construction, endPanels: { left: ends, right: ends } });
      if (construction.carcass?.style === 'frameless' && construction.fronts?.mount === 'inset') {
        expect(errorsOf(cab)).toContain('need a face frame');
        continue;
      }
      const model = build(cab);
      expect(violations(model, cab, project)).toEqual([]);
      // The two wings meet: every L-shaped panel comes as a run piece and a return piece.
      for (const role of ['bottom', 'back', 'shelfFixed'] as const) {
        const pieces = model.parts.filter((p) => p.role === role);
        expect(pieces.filter((p) => p.wing === 'return')).toHaveLength(pieces.length / 2);
      }
    }
  });
});

describe('L-shaped cabinets', () => {
  it('turn the return onto the next wall: it ends at the corner line, its end side at the return width', () => {
    const cab = make('lBase', { corner: { returnWidth: inch(30), returnDepth: inch(21) } });
    const parts = build(cab).parts;
    const side = parts.find((p) => p.id === 'c/return/side/end')!;
    expect(side.bounds.max.z).toBeCloseTo(inch(30), 6);
    expect(side.bounds.min.x).toBeCloseTo(inch(36 - 21), 6);
    expect(side.bounds.max.x).toBeCloseTo(inch(36), 6);
    expect(Math.max(...parts.map((p) => p.bounds.max.x))).toBeCloseTo(inch(36), 6);
  });

  it('end panels close both ends, notched for the toe kick, flush with the doors', () => {
    const parts = build(make('lBase', { endPanels: { left: true, right: true } })).parts;
    const left = parts.find((p) => p.id === 'c/endPanel/L')!;
    const right = parts.find((p) => p.id === 'c/return/endPanel/R')!;
    expect(left.bounds.max.x).toBe(0);
    expect(left.bounds.max.z).toBeCloseTo(inch(24) + 18, 6);
    expect(right.bounds.min.z).toBeCloseTo(inch(36), 6);
    expect(right.bounds.min.x).toBeCloseTo(inch(36 - 24) - 18, 6);
    expect(right.name).toBe('Right end panel (return)');
    for (const p of [left, right])
      expect(p.notch).toEqual({ height: inch(4), depth: inch(3) + 18 });
  });

  it('a bi-fold pair: the cabinet-hinged leaf has no pull; notes say how to hang them', () => {
    const model = build(make('lBase'));
    expect(model.fronts.map((f) => !!f.noPull)).toEqual([true, false]);
    const doors = model.parts.filter((p) => p.role === 'slabFront');
    expect(doors.map((d) => d.notes.at(-1))).toEqual([
      'Bi-fold: hinge this door to the cabinet at its outer end.',
      'Bi-fold: hinge this door to the other one at the corner with 2 bi-fold hinges; its pull goes near the free edge.',
    ]);
    expect(model.openings).toHaveLength(1);
  });

  it('open shelving has no doors or hardware, and fixed shelves in both wings', () => {
    const model = build(make('lShelf'));
    expect(model.fronts).toEqual([]);
    expect(model.hardware).toEqual([]);
    expect(model.parts.filter((p) => p.role === 'shelfFixed')).toHaveLength(8);
    expect(model.parts.some((p) => p.role === 'top')).toBe(true);
  });

  it('without a toe kick, both wings run to the floor', () => {
    const model = build(make('lBase', { construction: { platform: { enabled: false } } }));
    expect(model.parts.some((p) => p.role.startsWith('platform'))).toBe(false);
    for (const s of model.parts.filter((p) => p.role === 'side'))
      expect(s.finished.length).toBeCloseTo(inch(34.5), 6);
  });

  it.each([
    ['a split face', { face: { kind: 'split', dir: 'rows', children: [] } }, 'cannot be split'],
    ['drawers', { face: { kind: 'leaf', fill: 'drawer' } }, 'cannot be split'],
    [
      'adjustable shelves',
      { face: { kind: 'leaf', fill: 'door', shelves: { count: 2, adjustable: true } } },
      'fixed shelves',
    ],
    ['a narrow run', { width: inch(29) }, 'at least 6" more than the return depth'],
    [
      'a narrow return',
      { corner: { returnWidth: inch(29), returnDepth: inch(24) } },
      'return width must be at least 6"',
    ],
    ['no return', { corner: undefined }, 'return width and depth'],
    [
      'face-frame stiles too narrow for the doors',
      {
        construction: { carcass: { style: 'faceFrame' }, faceFrame: { stileWidth: inch(1) } },
      },
      'too narrow for the bi-fold doors',
    ],
  ] as [string, Partial<Cabinet>, string][])('rejects %s', (_label, over, message) => {
    expect(errorsOf(make('lBase', over))).toContain(message);
  });
});
