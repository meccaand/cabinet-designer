/**
 * Property-based tests over every cabinet type: random sizes within each type's sensible range,
 * random construction, blind side and blind width. Every one must build and pass the invariants.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProject, type CabinetType, type ConstructionOverrides } from '../model';
import { inch } from '../units';
import { violations } from './__tests__/invariants';
import { createCabinet, generateCabinet, TYPE_TRAITS } from './index';

const project = createProject('p', 'Types');

/** [min, max] inches for W, H, D. */
const RANGES: Record<CabinetType, [[number, number], [number, number], [number, number]]> = {
  base: [
    [15, 48],
    [30, 38],
    [21, 27],
  ],
  drawerBank: [
    [15, 36],
    [30, 38],
    [21, 27],
  ],
  blindBase: [
    [36, 48],
    [30, 38],
    [21, 27],
  ],
  tall: [
    [15, 36],
    [72, 96],
    [12, 27],
  ],
  openShelf: [
    [15, 48],
    [30, 96],
    [10, 24],
  ],
  wall: [
    [12, 42],
    [12, 42],
    [10, 15],
  ],
  blindWall: [
    [24, 42],
    [15, 42],
    [10, 15],
  ],
  // L-shaped: the width range is the run's; the return is drawn from the same range.
  lBase: [
    [30, 48],
    [30, 38],
    [21, 24],
  ],
  lShelf: [
    [24, 42],
    [30, 96],
    [10, 15],
  ],
};

const sixteenths = ([lo, hi]: [number, number]) =>
  fc.integer({ min: lo * 16, max: hi * 16 }).map((n) => inch(n / 16));

const construction: fc.Arbitrary<ConstructionOverrides> = fc.record({
  carcass: fc.record({
    style: fc.constantFrom('frameless', 'faceFrame'),
    joinery: fc.constantFrom('dado', 'rabbet', 'butt', 'pocket'),
    back: fc.constantFrom('inset', 'applied', 'dado'),
    baseTop: fc.constantFrom('stretchers', 'full'),
  }),
  fronts: fc.record({
    mount: fc.constantFrom('overlay', 'inset'),
    style: fc.constantFrom('slab', 'shaker'),
  }),
});

const cabinets = fc
  .constantFrom(...(Object.keys(RANGES) as CabinetType[]))
  .chain((type) => {
    const [w, h, d] = RANGES[type];
    return fc.record({
      type: fc.constant(type),
      width: sixteenths(w),
      height: sixteenths(h),
      depth: sixteenths(d),
      construction,
      side: fc.constantFrom('left' as const, 'right' as const),
      returnWidth: sixteenths(w),
      returnDepth: sixteenths(d),
      toeKick: fc.boolean(),
      blindShare: fc.double({ min: 0.45, max: 0.7, noNaN: true }),
      endPanels: fc.record({ left: fc.boolean(), right: fc.boolean() }),
    });
  })
  .map((r) => {
    const { type, width, height, depth, side, blindShare, endPanels } = r;
    // Frameless L-shaped cabinets take overlay doors only (they have no corner post).
    const lFrameless = TYPE_TRAITS[type].corner && r.construction.carcass?.style === 'frameless';
    const construction = {
      ...r.construction,
      platform: { enabled: r.toeKick },
      ...(lFrameless && { fronts: { ...r.construction.fronts, mount: 'overlay' as const } }),
    };
    const created = createCabinet(project, type, { id: 'c', width, height, depth, construction });
    const cab = {
      ...created,
      endPanels,
      ...(created.corner && {
        corner: { returnWidth: r.returnWidth, returnDepth: r.returnDepth },
      }),
    };
    if (!cab.blind) return cab;
    // Blind width: between ~half and ~70% of the width, at least a stile wider than the side.
    const blindWidth = Math.max(
      inch(4),
      Math.round((width * blindShare) / inch(1 / 16)) * inch(1 / 16),
    );
    return { ...cab, blind: { ...cab.blind, side, blindWidth } };
  });

describe('every cabinet type (property-based)', () => {
  it('builds a physically consistent cabinet', () => {
    fc.assert(
      fc.property(cabinets, (cabinet) => {
        const result = generateCabinet(cabinet, project);
        if (!result.ok) throw new Error(`${cabinet.type}: ${result.errors.join('; ')}`);
        expect(violations(result.model, cabinet, project)).toEqual([]);

        const parts = result.model.parts;
        const traits = TYPE_TRAITS[cabinet.type];
        expect(parts.some((p) => p.role === 'platformRail')).toBe(
          traits.platform && cabinet.construction.platform?.enabled !== false,
        );
        expect(parts.some((p) => p.wing === 'return')).toBe(traits.corner);
        expect(parts.some((p) => p.role === 'hangingRail')).toBe(traits.hangingRail);
        expect(parts.some((p) => p.role === 'filler')).toBe(traits.blind);
        if (!traits.counter) expect(parts.some((p) => p.role === 'top')).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
