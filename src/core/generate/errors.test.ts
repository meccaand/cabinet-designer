import { describe, expect, it } from 'vitest';
import { hardwareFor, hingeCount } from '../hardware';
import {
  createProject,
  DEFAULT_CONSTRUCTION,
  type Cabinet,
  type OpeningNode,
  type Project,
} from '../model';
import { inch } from '../units';
import { splitExtents } from './face';
import { createBaseCabinet, createCabinet, generateCabinet } from './index';

const project = createProject('p', 'Errors');
const base = (over: Partial<Cabinet> = {}, p: Project = project): Cabinet => ({
  ...createBaseCabinet(p, { id: 'c', width: inch(30) }),
  ...over,
});
const errorsOf = (cab: Cabinet, p: Project = project) => {
  const r = generateCabinet(cab, p);
  return r.ok ? [] : r.errors;
};
const leaf = (fill: 'door' | 'drawer' | 'open' | 'falseFront' | 'doorPair'): OpeningNode => ({
  kind: 'leaf',
  fill,
});

describe('generateCabinet: rejected inputs', () => {
  it.each([
    ['too narrow', { width: 30 }, 'too narrow'],
    ['too short', { height: inch(5) }, 'too short'],
    ['too shallow for stretchers', { depth: inch(8) }, 'too shallow for two stretchers'],
  ])('%s', (_label, over, message) => {
    expect(errorsOf(base(over)).join()).toContain(message);
  });

  it.each([
    ['dado deeper than the panel', { carcass: { dadoDepth: 20 } }, 'Dado/rabbet depth'],
    ['back rabbet too deep', { carcass: { backRabbetDepth: 18 } }, 'Back rabbet depth'],
    [
      'back groove too deep',
      { carcass: { back: 'dado' as const, backGrooveDepth: 18 } },
      'Back groove depth',
    ],
    [
      'back groove set back too far',
      { carcass: { back: 'dado' as const, backGrooveSetback: inch(23.5) } },
      'setback',
    ],
    ['platform setback too deep', { platform: { setback: inch(23.5) } }, 'Toe-kick setback'],
    ['no slide fits', { drawer: { slideLengths: [inch(30)] } }, 'no slide length fits'],
    ['drawer bottom groove too deep', { drawer: { bottomGrooveDepth: 13 } }, 'bottom groove'],
    [
      'drawer bottom groove too high',
      { drawer: { bottomGrooveHeight: inch(5) } },
      'too short for its bottom groove',
    ],
    ['huge reveals', { fronts: { revealEdge: inch(16) } }, 'No room left'],
    [
      'shelf setback deeper than the cabinet',
      { shelves: { depthSetback: inch(30) } },
      'Adjustable shelf: width works out to',
    ],
  ])('%s', (_label, construction, message) => {
    expect(errorsOf(base({ construction })).join()).toContain(message);
  });

  it('rejects openings that do not add up', () => {
    const face: OpeningNode = {
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(10), node: leaf('drawer') },
        { size: inch(10), node: leaf('drawer') },
      ],
    };
    expect(errorsOf(base({ face })).join()).toContain(`don't add up`);
    const tooBig: OpeningNode = {
      ...face,
      children: [
        { size: inch(40), node: leaf('drawer') },
        { size: 'auto', node: leaf('drawer') },
      ],
    };
    expect(errorsOf(base({ face: tooBig })).join()).toContain('leave no room');
  });

  it('accepts openings that add up exactly with no auto child', () => {
    // Frameless overlay: 30 1/2" box − 1/8" top reveal = 30 3/8" of fronts, one 1/8" gap.
    const face: OpeningNode = {
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(6), node: leaf('drawer') },
        { size: inch(24.25), node: leaf('doorPair') },
      ],
    };
    expect(errorsOf(base({ face }))).toEqual([]);
  });

  it('rejects side-by-side drawers without a divider, and in face frames', () => {
    const face: OpeningNode = {
      kind: 'split',
      dir: 'columns',
      children: [
        { size: 'auto', node: leaf('drawer') },
        { size: 'auto', node: leaf('drawer') },
      ],
    };
    expect(errorsOf(base({ face })).join()).toContain('need a divider');
    expect(errorsOf(base({ face: { ...face, divider: true } }))).toEqual([]);
    const ff = base({ face, construction: { carcass: { style: 'faceFrame' } } });
    expect(errorsOf(ff).join()).toContain(`aren't supported yet`);
  });

  it('rejects dividers below the top level and frameless-inset dividers with no room', () => {
    const nested: OpeningNode = {
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(6), node: leaf('drawer') },
        {
          size: 'auto',
          node: {
            kind: 'split',
            dir: 'columns',
            divider: true,
            children: [
              { size: 'auto', node: leaf('door') },
              { size: 'auto', node: leaf('door') },
            ],
          },
        },
      ],
    };
    expect(errorsOf(base({ face: nested })).join()).toContain('only supported at the top level');
    // A divided row split is a fixed shelf between the rows: allowed at the top level.
    const rowsDivider: OpeningNode = {
      kind: 'split',
      dir: 'rows',
      divider: true,
      children: [
        { size: 'auto', node: leaf('door') },
        { size: 'auto', node: leaf('door') },
      ],
    };
    expect(errorsOf(base({ face: rowsDivider }))).toEqual([]);
    const zeroGap: OpeningNode = {
      kind: 'split',
      dir: 'columns',
      divider: true,
      children: [
        { size: 'auto', node: leaf('door') },
        { size: 'auto', node: leaf('door') },
      ],
    };
    expect(
      errorsOf(base({ face: zeroGap, construction: { fronts: { revealBetween: 0 } } })).join(),
    ).toContain('needs room for the divider');
  });

  it('rejects columns too narrow for their divider', () => {
    const face: OpeningNode = {
      kind: 'split',
      dir: 'columns',
      divider: true,
      children: [
        // A 30 mm column: its centre lies inside the 18 mm side, left of the bay behind it.
        { size: 30, node: { kind: 'leaf', fill: 'open', shelves: { count: 1, adjustable: true } } },
        { size: 'auto', node: leaf('door') },
      ],
    };
    expect(errorsOf(base({ face })).join()).toContain('too narrow for the divider');
    const overlapping = {
      ...face,
      children: [{ size: 10, node: leaf('open') }, face.children[1]!],
    };
    expect(errorsOf(base({ face: overlapping })).join()).toContain('bay with no width');
  });

  it('rejects shelves behind drawers and too many shelves', () => {
    const face: OpeningNode = {
      kind: 'leaf',
      fill: 'drawer',
      shelves: { count: 1, adjustable: true },
    };
    expect(errorsOf(base({ face })).join()).toContain('not behind drawer');
    const crowded: OpeningNode = {
      kind: 'leaf',
      fill: 'door',
      shelves: { count: 20, adjustable: true },
    };
    expect(errorsOf(base({ face: crowded, height: inch(12) })).join()).toContain(
      'too many shelves',
    );
  });

  it('rejects drawers too small for a box', () => {
    const narrow: OpeningNode = { kind: 'leaf', fill: 'drawer' };
    expect(errorsOf(base({ face: narrow, width: inch(2.5) })).join()).toContain(
      'too narrow for a drawer box',
    );
    const short: OpeningNode = {
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(0.75), node: leaf('drawer') },
        { size: 'auto', node: leaf('door') },
      ],
    };
    expect(errorsOf(base({ face: short })).join()).toContain('too short for a drawer box');
  });

  it('reports missing materials instead of crashing', () => {
    const broken = { ...project, materials: { ...project.materials, sheets: [] } };
    expect(errorsOf(base({}, broken), broken).join()).toContain('No sheet or solid stock');
    const noBanding = { ...project, materials: { ...project.materials, banding: [] } };
    expect(errorsOf(base({}, noBanding), noBanding).join()).toContain('No edge banding');
  });

  it('rethrows programming errors', () => {
    const bad = { ...base(), face: { kind: 'mystery' } as unknown as OpeningNode };
    expect(() => generateCabinet(bad, project)).toThrow(TypeError);
  });
});

describe('end panels', () => {
  it('runs from the floor to the top and from the wall to the door faces, notched for the toe kick', () => {
    const r = generateCabinet(base({ endPanels: { left: true, right: false } }), project);
    if (!r.ok) throw new Error(r.errors.join());
    const panels = r.model.parts.filter((p) => p.role === 'endPanel');
    expect(panels.map((p) => p.id)).toEqual(['c/endPanel/L']);
    const p = panels[0]!;
    expect(p.finished.length).toBeCloseTo(inch(34.5), 6);
    expect(p.finished.width).toBeCloseTo(inch(24) + 18, 6); // flush with 18 mm overlay doors
    expect(p.finished.thickness).toBe(18);
    expect(p.bounds.max.x).toBe(0);
    // 4" high; from the door face (24" + 18 mm) back to the platform front (24" − 3").
    expect(p.notch).toEqual({ height: inch(4), depth: inch(3) + 18 });
    expect(r.model.warnings).toEqual([]);
  });

  it('has no notch on wall cabinets and clears a face-frame overhang', () => {
    const wall = createCabinet(project, 'wall', {
      id: 'w',
      construction: { carcass: { style: 'faceFrame' }, faceFrame: { sideOverhang: inch(0.25) } },
    });
    const r = generateCabinet({ ...wall, endPanels: { left: false, right: true } }, project);
    if (!r.ok) throw new Error(r.errors.join());
    const p = r.model.parts.find((x) => x.role === 'endPanel')!;
    expect(p.notch).toBeUndefined();
    expect(p.bounds.min.x).toBeCloseTo(inch(30.25), 6);
    expect(p.finished.length).toBeCloseTo(inch(30), 6);
  });
});

describe('banding', () => {
  it('subtracts banding thickness from cut sizes when the banding says so', () => {
    const p = createProject('p', 'pvc');
    p.construction = {
      ...p.construction,
      materials: { ...p.construction.materials, frontBanding: 'pvc-2' },
    };
    const r = generateCabinet(base({}, p), p);
    if (!r.ok) throw new Error(r.errors.join());
    const door = r.model.parts.find((x) => x.id === 'c/front/1/L')!;
    expect(door.finished.length - door.cut.length).toBeCloseTo(4, 9); // 2 mm each end
    expect(door.finished.width - door.cut.width).toBeCloseTo(4, 9);
    expect(door.edges).toEqual({ long1: 'pvc-2', long2: 'pvc-2', end1: 'pvc-2', end2: 'pvc-2' });
    const side = r.model.parts.find((x) => x.id === 'c/side/L')!;
    expect(side.cut).toEqual(side.finished); // veneer tape is not subtracted
  });

  it('bands only exposed frameless edges; face-frame carcass edges are hidden', () => {
    const r = generateCabinet(base({ construction: { carcass: { style: 'faceFrame' } } }), project);
    if (!r.ok) throw new Error(r.errors.join());
    const side = r.model.parts.find((x) => x.role === 'side')!;
    expect(Object.values(side.edges).every((e) => e === null)).toBe(true);
  });
});

describe('grainless material', () => {
  it('uses the longer side as length when the material has no grain', () => {
    const p = createProject('p', 'mdf');
    p.materials.sheets.push({
      id: 'mdf',
      name: 'MDF',
      thickness: 18,
      length: inch(97),
      width: inch(49),
      grain: false,
      costPerSheet: 50,
    });
    p.construction = { ...p.construction, materials: { ...p.construction.materials, door: 'mdf' } };
    const r = generateCabinet(base({}, p), p);
    if (!r.ok) throw new Error(r.errors.join());
    const df = r.model.parts.find((x) => x.id === 'c/front/0')!;
    expect(df.grain).toBe(false);
    expect(df.finished.length).toBeGreaterThan(df.finished.width);
    const door = r.model.parts.find((x) => x.id === 'c/front/1/L')!;
    expect(door.lengthAxis).toBe('y'); // 24 1/4" tall × 14 7/8" wide
  });
});

describe('shaker fronts', () => {
  it('makes fronts slab when the panel would be too small, with a note', () => {
    const r = generateCabinet(base({ construction: { fronts: { style: 'shaker' } } }), project);
    if (!r.ok) throw new Error(r.errors.join());
    const df = r.model.parts.find((x) => x.id === 'c/front/0')!;
    expect(df.role).toBe('slabFront');
    expect(df.notes[0]).toContain('Made slab');
    expect(r.model.parts.some((x) => x.id === 'c/front/1/L/panel')).toBe(true);
  });
});

describe('platform', () => {
  it.each([
    [12, 2],
    [24, 2],
    [inch(24) + 18 + 1, 3], // just over one 24" span between member centres
    [48, 3],
    [60, 4],
  ])('a %s"-wide cabinet gets %i cross members', (w, count) => {
    const width = w > 100 ? w : inch(w);
    const r = generateCabinet(base({ width, face: leaf('door') }), project);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.model.parts.filter((x) => x.role === 'platformCrossMember')).toHaveLength(count);
  });
});

describe('splitExtents', () => {
  const sizes = (...s: ('auto' | number)[]) => s.map((size) => ({ size }));
  const extents = (r: { extent: number }[]) => r.map((x) => x.extent);
  it('shares the remainder equally between auto children', () => {
    expect(extents(splitExtents(100, sizes('auto', 20, 'auto'), 5, 0, 'height'))).toEqual([
      35, 20, 35,
    ]);
  });
  it('adds padding to each child', () => {
    expect(extents(splitExtents(100, sizes(20, 'auto'), 0, 2, 'width'))).toEqual([22, 78]);
  });
});

describe('hardware', () => {
  it.each([
    [inch(20), 2],
    [inch(40), 2],
    [inch(40) + 1, 3],
    [inch(60), 3],
    [inch(80), 4],
    [inch(90), 5],
  ])('a %f mm door gets %i hinges', (h, n) => {
    expect(hingeCount(h, DEFAULT_CONSTRUCTION)).toBe(n);
  });

  it('counts pulls, slides by length and shelf pins; falls back to generic names', () => {
    const lines = hardwareFor(
      {
        fronts: [
          { kind: 'door', width: 300, height: 700 },
          { kind: 'drawer', width: inch(30), height: 150 },
          { kind: 'drawer', width: inch(20), height: 150 },
          { kind: 'falseFront', width: inch(30), height: 150 },
        ],
        slides: [inch(22), inch(18), inch(22)],
        adjustableShelves: 2,
      },
      DEFAULT_CONSTRUCTION,
      [],
    );
    expect(lines).toEqual([
      { kind: 'hinge', itemId: null, name: 'Hinge', qty: 2 },
      { kind: 'slide', itemId: null, name: 'Drawer slide (pair)', qty: 1, length: inch(18) },
      { kind: 'slide', itemId: null, name: 'Drawer slide (pair)', qty: 2, length: inch(22) },
      { kind: 'pull', itemId: null, name: 'Pull', qty: 4 },
      { kind: 'shelfPin', itemId: null, name: 'Shelf pin', qty: 8 },
    ]);
  });

  it('refuses hinge tiers without a catch-all (unvalidated data)', () => {
    const c = {
      ...DEFAULT_CONSTRUCTION,
      hardware: { ...DEFAULT_CONSTRUCTION.hardware, hingeTiers: [{ upTo: 100, count: 2 }] },
    };
    expect(() => hingeCount(200, c)).toThrow('covers any height');
  });

  it('lists nothing for an open cabinet', () => {
    expect(
      hardwareFor({ fronts: [], slides: [], adjustableShelves: 0 }, DEFAULT_CONSTRUCTION, []),
    ).toEqual([]);
  });
});

describe('createBaseCabinet', () => {
  it('uses a single door up to 21" and a pair above', () => {
    const narrow = createBaseCabinet(project, { id: 'a', width: inch(21), layout: 'doors' });
    const wide = createBaseCabinet(project, { id: 'b', width: inch(22), layout: 'doors' });
    expect(narrow.face).toMatchObject({ fill: 'door' });
    expect(wide.face).toMatchObject({ fill: 'doorPair' });
  });

  it('sizes the top drawer as a 6" front in both styles', () => {
    const ff = createBaseCabinet(project, {
      id: 'a',
      width: inch(24),
      construction: { carcass: { style: 'faceFrame' } },
    });
    expect(ff.face).toMatchObject({ children: [{ size: inch(5) }, { size: 'auto' }] });
    const fl = createBaseCabinet(project, { id: 'b', width: inch(24), name: 'Sink' });
    expect(fl.face).toMatchObject({ children: [{ size: inch(6) }, { size: 'auto' }] });
    expect(fl.name).toBe('Sink');
  });
});
