import { describe, expect, it } from 'vitest';
import { inch } from '../units';
import {
  DEFAULT_CONSTRUCTION,
  cabinetConstruction,
  cabinetStyle,
  createProject,
  createStylePreset,
  createBuiltIn,
  createModule,
  createRun,
  type BuiltIn,
  type SectionModule,
  loadProject,
  MIGRATIONS,
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

describe('style presets', () => {
  const style = createStylePreset('s1', 'traditionalPainted');

  it('layer between the project defaults and the cabinet: defaults, style, cabinet', () => {
    const p = projectWith((x) => x.stylePresets.push(style));
    const plain = cabinet();
    const styled = cabinet({ styleId: 's1' });
    const own = cabinet({ styleId: 's1', construction: { fronts: { mount: 'overlay' } } });
    expect(cabinetConstruction(p, plain)).toEqual(p.construction);
    expect(cabinetConstruction(p, styled).fronts.mount).toBe('inset');
    expect(cabinetConstruction(p, styled).carcass.style).toBe('faceFrame');
    expect(cabinetConstruction(p, styled).carcass.joinery).toBe(p.construction.carcass.joinery);
    expect(cabinetConstruction(p, own).fronts.mount).toBe('overlay');
    expect(cabinetConstruction(p, own).fronts.style).toBe('shaker');
    expect(cabinetStyle(p, styled)).toBe(p.stylePresets[0]);
  });

  it('validate: unique ids, existing styles, existing materials', () => {
    expect(issues(projectWith((x) => x.stylePresets.push(style)))).toEqual([]);
    expect(issues(projectWith((x) => x.stylePresets.push(style, { ...style })))).toContain(
      'Duplicate style id "s1".',
    );
    expect(issues(projectWith((x) => x.cabinets.push(cabinet({ styleId: 'nope' }))))).toContain(
      'Style "nope" does not exist.',
    );
    expect(
      issues(
        projectWith((x) =>
          x.stylePresets.push({ ...style, construction: { materials: { door: 'nope' } } }),
        ),
      ),
    ).toContain('Material "nope" for role "door" does not exist.');
    expect(
      issues(
        projectWith((x) =>
          x.stylePresets.push({ ...style, finish: { ...style.finish, color: 'red' } }),
        ),
      ),
    ).not.toEqual([]);
  });

  it('templates: the traditional built-in matches the spec defaults', () => {
    const c = resolveConstruction(DEFAULT_CONSTRUCTION, style.construction);
    expect(c.carcass.style).toBe('faceFrame');
    expect(c.fronts).toMatchObject({ style: 'shaker', mount: 'inset' });
    expect(c.platform).toMatchObject({ enabled: true, height: inch(4.5), setback: 0 });
    expect(c.shelves.nosingHeight).toBe(inch(1.5));
    expect(c.hardware).toMatchObject({
      handle: 'knob',
      knobDiameter: inch(1.125),
      handleFromEnd: inch(2.75),
    });
    expect(style.finish).toMatchObject({ kind: 'paint', color: '#8a9a97', sheen: 'satin' });
    expect(createStylePreset('b', 'blank').construction).toEqual({});
  });
});

describe('built-ins', () => {
  const withBuiltIn = (mutate: (b: BuiltIn) => void) =>
    projectWith((x) => {
      x.stylePresets.push(createStylePreset('s1', 'traditionalPainted'));
      const b = createBuiltIn('b1', 'Built-in', 's1');
      const run = createRun('r1', x.room.walls[0]!);
      run.modules = (
        ['stile', 'section', 'stile', 'tower', 'baseOnly', 'pilaster', 'obstruction'] as const
      ).map((t, i) => createModule(`m${i}`, t));
      b.runs.push(run);
      mutate(b);
      x.builtIns.push(b);
    });

  it('validate with every module template', () => {
    expect(issues(withBuiltIn(() => {}))).toEqual([]);
  });

  it('reject missing styles and walls, and duplicate ids', () => {
    expect(issues(withBuiltIn((b) => void (b.styleId = 'nope')))).toContain(
      'Style "nope" does not exist.',
    );
    expect(issues(withBuiltIn((b) => void (b.runs[0]!.wallId = 'nope')))).toContain(
      'Wall "nope" does not exist.',
    );
    expect(issues(withBuiltIn((b) => void b.runs.push({ ...b.runs[0]!, modules: [] })))).toContain(
      'Duplicate run id "r1".',
    );
    expect(
      issues(withBuiltIn((b) => void b.runs[0]!.modules.push(b.runs[0]!.modules[0]!))),
    ).toContain('Duplicate module id "m0".');
    const twice = withBuiltIn(() => {});
    twice.builtIns.push({ ...twice.builtIns[0]!, runs: [] });
    expect(issues(twice)).toContain('Duplicate built-in id "b1".');
  });

  it('templates: towers have a finished left end; base-only has no upper', () => {
    const tower = createModule('t', 'tower') as SectionModule;
    expect(tower.endPanels).toEqual({ left: true, right: false });
    expect((createModule('b', 'baseOnly') as SectionModule).upper).toBeNull();
    expect(createModule('o', 'obstruction', 'Window')).toMatchObject({ label: 'Window' });
    const run = createRun(
      'r',
      { id: 'w', name: 'W', length: inch(100), height: inch(96), turn: 'right' },
      inch(10),
    );
    expect(run.length).toBe(inch(90));
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

  it('1 → 2: projects saved before toe kicks could be turned off keep theirs', () => {
    const current = createProject('p', 'x');
    const v1 = JSON.parse(JSON.stringify({ ...current, schemaVersion: 1 })) as Project;
    delete (v1.construction.platform as Partial<typeof v1.construction.platform>).enabled;
    expect(loadProject(v1)).toEqual({ ok: true, value: current });
    // Malformed input passes through untouched, for validation to report.
    expect(MIGRATIONS[1]!({ construction: 3 })).toEqual({ construction: 3 });
    expect(MIGRATIONS[1]!({ construction: {} })).toEqual({ construction: {} });
  });

  it('2 → 3: older projects get handle and nosing conventions, no styles, and a knob', () => {
    const current = createProject('p', 'x');
    const v2 = clone(current) as Omit<Partial<Project>, 'schemaVersion'> & {
      schemaVersion: number;
      construction: Project['construction'];
      materials: Project['materials'];
    };
    v2.schemaVersion = 2;
    const hw = v2.construction.hardware as Partial<Project['construction']['hardware']>;
    delete hw.handle;
    delete hw.knobDiameter;
    delete hw.pullLength;
    delete hw.handleFromEnd;
    delete hw.handleFromEdge;
    delete (v2.construction.shelves as Partial<Project['construction']['shelves']>).nosingHeight;
    delete v2.stylePresets;
    v2.materials.hardware = v2.materials.hardware.filter((h) => h.kind !== 'knob');
    expect(loadProject(v2)).toEqual({ ok: true, value: current });

    // A project's own settings win over the migration's values; a knob already there stays.
    const custom = clone(v2);
    custom.construction.hardware.twoPullsOver = inch(30);
    custom.materials.hardware.push({ id: 'k2', name: 'Brass knob', kind: 'knob', unitCost: 9 });
    const r = loadProject(custom);
    expect(r.ok && r.value.construction.hardware.twoPullsOver).toBe(inch(30));
    expect(r.ok && r.value.materials.hardware.filter((h) => h.kind === 'knob')).toHaveLength(1);

    // Malformed input passes through for validation to report.
    expect(MIGRATIONS[2]!({ construction: 3 })).toEqual({ construction: 3, stylePresets: [] });
  });

  it('3 → 4: older projects get an empty list of built-ins', () => {
    const current = createProject('p', 'x');
    const v3 = clone(current) as Omit<Partial<Project>, 'schemaVersion'> & {
      schemaVersion: number;
    };
    v3.schemaVersion = 3;
    delete v3.builtIns;
    expect(loadProject(v3)).toEqual({ ok: true, value: current });
  });

  it('4 → 5: older projects get flat end panels', () => {
    const current = createProject('p', 'x');
    const v4 = clone(current) as Omit<Partial<Project>, 'schemaVersion'> & {
      schemaVersion: number;
    };
    v4.schemaVersion = 4;
    delete (v4.construction as Partial<Project['construction']>).endPanel;
    expect(loadProject(v4)).toEqual({ ok: true, value: current });
    expect(MIGRATIONS[4]!({ construction: 3 })).toEqual({ construction: 3 });
  });

  it('fails clearly when a migration is missing', () => {
    expect(upgradeDocument({ schemaVersion: 1 }, {}, 2)).toEqual({
      ok: false,
      error: 'No upgrade path from format 1.',
    });
  });
});
