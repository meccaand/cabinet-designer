import { describe, expect, it } from 'vitest';
import { inch } from '../units';
import {
  DEFAULT_CONSTRUCTION,
  createProject,
  loadProject,
  resolveConstruction,
  upgradeDocument,
  ProjectSchema,
  OpeningNodeSchema,
  type Cabinet,
  type Project,
} from './index';

function cabinet(overrides: Partial<Cabinet> = {}): Cabinet {
  return {
    id: 'cab-1',
    name: 'Sink base',
    type: 'base',
    width: inch(36),
    height: inch(34.5),
    depth: inch(24),
    placement: { wallId: null, offset: 0, elevation: 0 },
    construction: {},
    face: {
      kind: 'split',
      dir: 'rows',
      children: [
        { size: inch(6), node: { kind: 'leaf', fill: 'falseFront' } },
        {
          size: 'auto',
          node: { kind: 'leaf', fill: 'doorPair', shelves: { count: 0, adjustable: true } },
        },
      ],
    },
    endPanels: { left: false, right: false },
    ...overrides,
  };
}

/** Deep copy without structuredClone: core is typechecked without DOM/Node globals (ADR-001). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function projectWith(mutate: (p: Project) => void): Project {
  const p = clone(createProject('p1', 'Kitchen'));
  mutate(p);
  return p;
}

function issues(p: unknown): string[] {
  const r = ProjectSchema.safeParse(p);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe('createProject', () => {
  it('produces a valid project in both unit systems', () => {
    expect(issues(createProject('p1', 'Kitchen'))).toEqual([]);
    expect(issues(createProject('p2', 'Garage', 'metric'))).toEqual([]);
    expect(createProject('p2', 'Garage', 'metric').units.system).toBe('metric');
  });

  it('round-trips through JSON unchanged', () => {
    const p = projectWith((p) => p.cabinets.push(cabinet()));
    const loaded = loadProject(JSON.parse(JSON.stringify(p)));
    expect(loaded).toEqual({ ok: true, value: p });
  });

  it('uses actual (not nominal) sheet thickness for 3/4" plywood', () => {
    const ply = createProject('p', 'x').materials.sheets.find((s) => s.id === 'ply-18');
    expect(ply?.thickness).toBe(18);
  });
});

describe('ProjectSchema cross-references', () => {
  it('rejects duplicate ids', () => {
    const p = projectWith((p) => {
      p.cabinets.push(cabinet(), cabinet());
      p.room.walls.push(
        { id: 'w', name: 'A', length: 3000, height: 2400, turn: 'left' },
        { id: 'w', name: 'B', length: 3000, height: 2400, turn: 'left' },
      );
      p.materials.solids.push({ ...p.materials.solids[0]!, name: 'copy' });
    });
    expect(issues(p)).toEqual([
      'Duplicate cabinet id "cab-1".',
      'Duplicate wall id "w".',
      'Duplicate material id "poplar-4-4".',
    ]);
  });

  it('rejects material roles pointing at missing or wrong-kind materials', () => {
    const p = projectWith((p) => {
      p.construction.materials.carcass = 'nope';
      p.construction.materials.carcassBanding = 'ply-18'; // a sheet is not banding
      p.construction.materials.door = 'veneer-0.5'; // banding is not door stock
      p.cabinets.push(cabinet({ construction: { materials: { shelf: 'gone' } } }));
    });
    expect(issues(p)).toEqual([
      'Material "nope" for role "carcass" does not exist.',
      'Material "veneer-0.5" for role "door" does not exist.',
      'Material "ply-18" for role "carcassBanding" does not exist.',
      'Material "gone" for role "shelf" does not exist.',
    ]);
  });

  it('rejects placements on missing walls', () => {
    const p = projectWith((p) => {
      p.cabinets.push(cabinet({ placement: { wallId: 'w9', offset: 0, elevation: 0 } }));
      p.fillers.push({
        id: 'f',
        wallId: 'w9',
        offset: 0,
        width: 50,
        height: 700,
        elevation: 0,
        depth: 600,
      });
    });
    expect(issues(p)).toEqual(['Wall "w9" does not exist.', 'Wall "w9" does not exist.']);
  });

  it('accepts placements on existing walls', () => {
    const p = projectWith((p) => {
      p.room.walls.push({ id: 'w1', name: 'North', length: 3000, height: 2400, turn: 'left' });
      p.cabinets.push(cabinet({ placement: { wallId: 'w1', offset: 100, elevation: 0 } }));
      p.fillers.push({
        id: 'f',
        wallId: 'w1',
        offset: 0,
        width: 50,
        height: 700,
        elevation: 0,
        depth: 600,
      });
    });
    expect(issues(p)).toEqual([]);
  });

  it('requires blind settings exactly on blind corner cabinets', () => {
    const blind = { side: 'left' as const, blindWidth: inch(25), pullFillerWidth: inch(3) };
    const ok = projectWith((p) => p.cabinets.push(cabinet({ type: 'blindBase', blind })));
    const missing = projectWith((p) => p.cabinets.push(cabinet({ type: 'blindWall' })));
    const extra = projectWith((p) => p.cabinets.push(cabinet({ type: 'base', blind })));
    expect(issues(ok)).toEqual([]);
    expect(issues(missing)).toEqual([
      'Blind corner cabinets need blind settings; other types must not have them.',
    ]);
    expect(issues(extra)).toHaveLength(1);
  });

  it('rejects non-positive dimensions and a hinge table without a catch-all tier', () => {
    const p = projectWith((p) => {
      p.cabinets.push(cabinet({ width: 0 }));
      p.construction.hardware.hingeTiers = [{ upTo: inch(40), count: 2 }];
    });
    expect(issues(p)).toEqual([
      'The last hinge tier must cover any height.',
      expect.stringContaining('>0'),
    ]);
  });
});

describe('OpeningNodeSchema', () => {
  it('accepts nested splits', () => {
    const node = {
      kind: 'split',
      dir: 'columns',
      divider: true,
      children: [
        {
          size: 'auto',
          node: {
            kind: 'split',
            dir: 'rows',
            children: [
              { size: 150, node: { kind: 'leaf', fill: 'drawer' } },
              { size: 'auto', node: { kind: 'leaf', fill: 'door', hinge: 'left' } },
            ],
          },
        },
        {
          size: 'auto',
          node: { kind: 'leaf', fill: 'open', shelves: { count: 3, adjustable: false } },
        },
      ],
    };
    expect(OpeningNodeSchema.safeParse(node).success).toBe(true);
  });

  it.each([
    [
      'a split with one child',
      {
        kind: 'split',
        dir: 'rows',
        children: [{ size: 'auto', node: { kind: 'leaf', fill: 'door' } }],
      },
    ],
    [
      'a zero size',
      {
        kind: 'split',
        dir: 'rows',
        children: [
          { size: 0, node: { kind: 'leaf', fill: 'door' } },
          { size: 'auto', node: { kind: 'leaf', fill: 'door' } },
        ],
      },
    ],
    ['an unknown fill', { kind: 'leaf', fill: 'window' }],
    [
      'a fractional shelf count',
      { kind: 'leaf', fill: 'open', shelves: { count: 1.5, adjustable: true } },
    ],
  ])('rejects %s', (_label, node) => {
    expect(OpeningNodeSchema.safeParse(node).success).toBe(false);
  });
});

describe('resolveConstruction', () => {
  it('returns the defaults when there are no overrides', () => {
    expect(resolveConstruction(DEFAULT_CONSTRUCTION, {})).toEqual(DEFAULT_CONSTRUCTION);
  });

  it('overrides only the given fields, leaving siblings inherited', () => {
    const r = resolveConstruction(DEFAULT_CONSTRUCTION, {
      carcass: { style: 'faceFrame', joinery: 'pocket' },
      materials: { door: 'ply-12' },
    });
    expect(r.carcass).toEqual({
      ...DEFAULT_CONSTRUCTION.carcass,
      style: 'faceFrame',
      joinery: 'pocket',
    });
    expect(r.materials).toEqual({ ...DEFAULT_CONSTRUCTION.materials, door: 'ply-12' });
    expect(r.fronts).toBe(DEFAULT_CONSTRUCTION.fronts);
  });

  it('ignores explicitly undefined override fields', () => {
    const r = resolveConstruction(DEFAULT_CONSTRUCTION, { carcass: { dadoDepth: undefined } });
    expect(r.carcass.dadoDepth).toBe(DEFAULT_CONSTRUCTION.carcass.dadoDepth);
  });

  it('does not mutate the defaults', () => {
    const before = clone(DEFAULT_CONSTRUCTION);
    resolveConstruction(DEFAULT_CONSTRUCTION, { shelves: { pinsPerShelf: 6 } });
    expect(DEFAULT_CONSTRUCTION).toEqual(before);
  });
});

describe('loadProject / upgradeDocument', () => {
  it.each([
    [null, 'Not a project file.'],
    [[], 'Not a project file.'],
    ['{}', 'Not a project file.'],
    [{}, 'missing schema version'],
    [{ schemaVersion: '1' }, 'missing schema version'],
    [{ schemaVersion: 1.5 }, 'missing schema version'],
    [{ schemaVersion: 0 }, 'missing schema version'],
    [{ schemaVersion: 99 }, 'newer version of the app (format 99)'],
  ])('rejects %j', (raw, message) => {
    const r = loadProject(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it('reports validation errors readably', () => {
    const r = loadProject({ ...createProject('p', 'x'), name: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/);
  });

  it('applies migrations in order and stamps each version', () => {
    const seen: number[] = [];
    const r = upgradeDocument(
      { schemaVersion: 1, a: 1 },
      {
        1: (d) => (seen.push(d['schemaVersion'] as number), { ...d, b: 2 }),
        2: (d) => (seen.push(d['schemaVersion'] as number), { ...d, c: (d['b'] as number) + 1 }),
      },
      3,
    );
    expect(seen).toEqual([1, 2]);
    expect(r).toEqual({ ok: true, value: { schemaVersion: 3, a: 1, b: 2, c: 3 } });
  });

  it('fails clearly when a migration is missing', () => {
    expect(upgradeDocument({ schemaVersion: 1 }, {}, 2)).toEqual({
      ok: false,
      error: 'No upgrade path from format 1.',
    });
  });
});
