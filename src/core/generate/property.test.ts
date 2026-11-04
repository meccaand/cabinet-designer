/**
 * Property-based tests: random base cabinets (sizes, layouts, construction choices, and
 * nudged conventions) must always generate, deterministically, and pass every invariant.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createProject,
  type Cabinet,
  type ConstructionOverrides,
  type OpeningNode,
} from '../model';
import { inch } from '../units';
import { violations } from './__tests__/invariants';
import { generateCabinet } from './index';

const project = createProject('p', 'Property');

const drawer: OpeningNode = { kind: 'leaf', fill: 'drawer' };
const shelves = (count: number, adjustable: boolean) => ({ count, adjustable });

/** Face layouts valid for both styles, plus frameless-only ones (side-by-side drawers). */
function faces(width: number, frameless: boolean): fc.Arbitrary<OpeningNode> {
  const doorFill = width > inch(21) ? 'doorPair' : 'door';
  const doors = (n: number, adjustable: boolean): OpeningNode => ({
    kind: 'leaf',
    fill: doorFill,
    shelves: shelves(n, adjustable),
  });
  const common = [
    fc.tuple(fc.integer({ min: 0, max: 3 }), fc.boolean()).map(([n, adj]) => doors(n, adj)),
    fc.tuple(fc.integer({ min: 0, max: 2 }), fc.boolean()).map(([n, adj]): OpeningNode => ({
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(5), node: drawer },
        { size: 'auto', node: doors(n, adj) },
      ],
    })),
    fc.integer({ min: 2, max: 4 }).map((n): OpeningNode => ({
      kind: 'split',
      dir: 'rows',
      children: Array.from({ length: n }, () => ({ size: 'auto' as const, node: drawer })),
    })),
    fc.integer({ min: 1, max: 3 }).map((n): OpeningNode => ({
      kind: 'split',
      dir: 'columns',
      children: [
        { size: 'auto', node: { kind: 'leaf', fill: 'door', shelves: shelves(n, true) } },
        { size: 'auto', node: { kind: 'leaf', fill: 'door', shelves: shelves(n, true) } },
      ],
    })),
    fc.constant<OpeningNode>({
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(5), node: { kind: 'leaf', fill: 'falseFront' } },
        {
          size: 'auto',
          node: {
            kind: 'split',
            dir: 'columns',
            children: [
              { size: 'auto', node: { kind: 'leaf', fill: 'door', hinge: 'left' } },
              { size: 'auto', node: { kind: 'leaf', fill: 'open', shelves: shelves(2, true) } },
            ],
          },
        },
      ],
    }),
    fc.integer({ min: 1, max: 3 }).map((n): OpeningNode => ({
      kind: 'split',
      dir: 'columns',
      divider: true,
      children: [
        {
          size: 'auto',
          node: { kind: 'leaf', fill: 'door', hinge: 'left', shelves: shelves(n, true) },
        },
        { size: 'auto', node: { kind: 'leaf', fill: 'open', shelves: shelves(n, false) } },
      ],
    })),
  ];
  if (!frameless) return fc.oneof(...common);
  return fc.oneof(
    ...common,
    fc.integer({ min: 0, max: 2 }).map((n): OpeningNode => ({
      kind: 'split',
      dir: 'columns',
      divider: true,
      children: [
        {
          size: 'auto',
          node: {
            kind: 'split',
            dir: 'rows',
            children: [0, 1, 2].map(() => ({ size: 'auto' as const, node: drawer })),
          },
        },
        { size: 'auto', node: { kind: 'leaf', fill: 'door', shelves: shelves(n, n % 2 === 0) } },
      ],
    })),
  );
}

const construction: fc.Arbitrary<ConstructionOverrides> = fc.record({
  carcass: fc.record({
    style: fc.constantFrom('frameless', 'faceFrame'),
    joinery: fc.constantFrom('dado', 'rabbet', 'butt', 'pocket'),
    back: fc.constantFrom('inset', 'applied', 'dado'),
    baseTop: fc.constantFrom('stretchers', 'full'),
    dadoDepth: fc.constantFrom(inch(1 / 8), inch(1 / 4), inch(3 / 8)),
  }),
  fronts: fc.record({
    mount: fc.constantFrom('overlay', 'inset'),
    style: fc.constantFrom('slab', 'shaker'),
    revealBetween: fc.constantFrom(inch(1 / 16), inch(1 / 8), inch(3 / 16)),
  }),
  faceFrame: fc.record({
    stileWidth: fc.constantFrom(inch(1.5), inch(1.75), inch(2)),
    sideOverhang: fc.constantFrom(0, inch(1 / 4)),
  }),
  platform: fc.record({ height: fc.constantFrom(inch(3.5), inch(4), inch(4.5)) }),
  materials: fc.record({ door: fc.constantFrom('ply-18', 'ply-12') }),
});

const cabinets: fc.Arbitrary<Cabinet> = fc
  .record({
    width: fc.integer({ min: 15 * 16, max: 48 * 16 }).map((n) => inch(n / 16)),
    height: fc.integer({ min: 30 * 16, max: 38 * 16 }).map((n) => inch(n / 16)),
    depth: fc.integer({ min: 21 * 16, max: 27 * 16 }).map((n) => inch(n / 16)),
    construction,
  })
  .chain((base) =>
    faces(base.width, base.construction.carcass?.style === 'frameless').map((face): Cabinet => ({
      id: 'c',
      name: 'Random',
      type: 'base',
      placement: { wallId: null, offset: 0, elevation: 0 },
      endPanels: { left: false, right: false },
      face,
      ...base,
    })),
  );

describe('generateCabinet (property-based)', () => {
  it('always builds a physically consistent cabinet', () => {
    fc.assert(
      fc.property(cabinets, (cabinet) => {
        const result = generateCabinet(cabinet, project);
        if (!result.ok) throw new Error(result.errors.join('; '));
        expect(violations(result.model, cabinet, project)).toEqual([]);
      }),
      { numRuns: 400 },
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(cabinets, (cabinet) => {
        expect(generateCabinet(cabinet, project)).toEqual(generateCabinet(cabinet, project));
      }),
      { numRuns: 50 },
    );
  });

  it('scales widths linearly: 1" wider cabinet → panels between the sides 1" longer', () => {
    fc.assert(
      fc.property(cabinets, (cabinet) => {
        const a = generateCabinet(cabinet, project);
        const b = generateCabinet({ ...cabinet, width: cabinet.width + inch(1) }, project);
        if (!a.ok || !b.ok) throw new Error('generation failed');
        const bottom = (m: typeof a.model) => m.parts.find((p) => p.role === 'bottom')!.finished;
        // Length is along the width unless grainless material flips it; ply has grain.
        expect(bottom(b.model).length - bottom(a.model).length).toBeCloseTo(inch(1), 6);
      }),
      { numRuns: 100 },
    );
  });
});
