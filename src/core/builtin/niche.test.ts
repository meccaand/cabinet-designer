/**
 * M12 (ADR-041): the media niche and its bridge, dividers within a level, and framed
 * (recessed-panel) end panels.
 */
import { describe, expect, it } from 'vitest';
import { referenceRoom } from '../__tests__/referenceRoom';
import { createCabinet, generateCabinet } from '../generate';
import { violations } from '../generate/__tests__/invariants';
import {
  createModule,
  createProject,
  createStylePreset,
  type Cabinet,
  type ConstructionOverrides,
  type OpeningNode,
  type Project,
  type SectionModule,
} from '../model';
import type { CabinetModel, Part } from '../parts';
import { inch } from '../units';
import { expandProject, TV_CLEARANCE } from './index';

function build(project: Project, cabinet: Cabinet): CabinetModel {
  const r = generateCabinet(cabinet, project);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.model;
}
const expanded = (p: Project) => expandProject(p);
const boxOf = (p: Project, id: string) => {
  const e = expanded(p);
  const cab = e.project.cabinets.find((c) => c.id === id)!;
  return { cab, model: build(e.project, cab) };
};
/** Edit the reference room's TV section. */
function withNiche(over: Partial<Extract<SectionModule['upper'], { kind: 'mediaNiche' }>>) {
  const p = referenceRoom();
  const media = p.builtIns[0]!.runs[1]!;
  media.modules = media.modules.map((m) =>
    m.id === 'media-centre' && m.kind === 'section' && m.upper?.kind === 'mediaNiche'
      ? { ...m, upper: { ...m.upper, ...over } }
      : m,
  );
  return p;
}
const shelfTops = (parts: Part[]) =>
  parts
    .filter((x) => x.role === 'shelfFixed')
    .map((x) => x.bounds.max.y)
    .sort((a, b) => b - a);

describe('media niche', () => {
  it("the bridge shelf's top is exactly the flanking bays' top shelf line", () => {
    const p = referenceRoom();
    const niche = boxOf(p, 'builtins/media-centre/upper');
    const bay = boxOf(p, 'builtins/media-left/upper');
    // Same box height and elevation, so local y compares directly.
    expect(niche.cab.placement.elevation).toBe(bay.cab.placement.elevation);
    expect(niche.cab.height).toBe(bay.cab.height);
    expect(shelfTops(niche.model.parts)).toEqual([shelfTops(bay.model.parts)[0]]);
    // The face-frame rail under the bridge is flush with the shelf top.
    const rails = niche.model.parts.filter((x) => x.role === 'ffRail');
    expect(
      rails.some((r) => Math.abs(r.bounds.max.y - shelfTops(bay.model.parts)[0]!) < 1e-6),
    ).toBe(true);
    expect(violations(niche.model, niche.cab, expanded(p).project)).toEqual([]);
  });

  it('can line up with a lower shelf line instead', () => {
    const p = withNiche({ bridgeLine: 2 });
    const niche = boxOf(p, 'builtins/media-centre/upper');
    const bay = boxOf(p, 'builtins/media-left/upper');
    expect(shelfTops(niche.model.parts)).toEqual([shelfTops(bay.model.parts)[1]]);
  });

  it('splits the bridge into cubbies with dividers housed in the bridge shelf and the top', () => {
    for (const cubbies of [1, 2, 3]) {
      const p = withNiche({ cubbies });
      const { cab, model } = boxOf(p, 'builtins/media-centre/upper');
      const dividers = model.parts.filter((x) => x.role === 'divider');
      expect(dividers).toHaveLength(cubbies - 1);
      const shelf = model.parts.find((x) => x.role === 'shelfFixed')!;
      const top = model.parts.find((x) => x.role === 'top')!;
      for (const d of dividers) {
        // Housed 1/4" into the bridge shelf below and the top above (dado joinery).
        expect(d.bounds.min.y).toBeCloseTo(shelf.bounds.max.y - inch(1 / 4), 6);
        expect(d.bounds.max.y).toBeCloseTo(top.bounds.min.y + inch(1 / 4), 6);
        expect(model.joints.filter((j) => j.guest === d.id).map((j) => j.host)).toEqual([
          shelf.id,
          top.id,
        ]);
      }
      // A mullion over each divider.
      expect(model.parts.filter((x) => x.role === 'ffMullion')).toHaveLength(cubbies - 1);
      expect(violations(model, cab, expanded(p).project)).toEqual([]);
    }
  });

  it('reports the opening and warns when the TV will not fit', () => {
    const p = referenceRoom();
    const e = expanded(p);
    const opening = e.niches.get('media-centre')!;
    expect(opening.width).toBe(inch(66));
    expect(e.warnings.get('builtins')).toEqual([]);
    // A TV exactly as big as fits with 1" all round is fine; a hair bigger is not.
    const fits = ((opening.height - 2 * TV_CLEARANCE) * Math.hypot(16, 9)) / 9;
    const fitsW = ((opening.width - 2 * TV_CLEARANCE) * Math.hypot(16, 9)) / 16;
    const limit = Math.min(fits, fitsW);
    expect(expanded(withNiche({ tvSize: limit })).warnings.get('builtins')).toEqual([]);
    const warnings = expanded(withNiche({ tvSize: limit + 1 })).warnings.get('builtins')!;
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/TV section: a .* TV .* needs .* but the niche is 66" ×/);
    expect(expanded(withNiche({ tvSize: null })).warnings.get('builtins')).toEqual([]);
  });

  it('needs the shelf line it lines up with', () => {
    const p = withNiche({ bridgeLine: 5 });
    expect(expanded(p).errors.get('builtins')!.join()).toMatch(/shelf line 5 from the top/);
  });

  it('the TV section template builds', () => {
    const t = createModule('tv', 'tvSection') as SectionModule;
    expect(t.upper).toEqual({ kind: 'mediaNiche', cubbies: 2, bridgeLine: 1, tvSize: inch(65) });
    expect(t.base.groups).toHaveLength(2);
  });
});

describe('dividers within a level (generator)', () => {
  const project = createProject('p', 'Levels');
  /** A 36" × 30" wall cabinet: a 10" top row split in three, an open space below. */
  const levelled = (construction: ConstructionOverrides): Cabinet => {
    const open: OpeningNode = { kind: 'leaf', fill: 'open' };
    return {
      ...createCabinet(project, 'wall', { id: 'w', width: inch(36), construction }),
      face: {
        kind: 'split',
        dir: 'rows',
        divider: true,
        children: [
          {
            size: inch(10),
            node: {
              kind: 'split',
              dir: 'columns',
              divider: true,
              children: [
                { size: 'auto', node: open },
                {
                  size: 'auto',
                  node: { kind: 'leaf', fill: 'door', shelves: { count: 1, adjustable: true } },
                },
                { size: 'auto', node: open },
              ],
            },
          },
          {
            size: 'auto',
            node: { kind: 'leaf', fill: 'open', shelves: { count: 2, adjustable: true } },
          },
        ],
      },
    };
  };

  it.each(
    (['frameless', 'faceFrame'] as const).flatMap((style) =>
      (['dado', 'rabbet', 'butt', 'pocket'] as const).map((joinery) => ({ style, joinery })),
    ),
  )('$style, $joinery: dividers span only their level and pass the invariants', (o) => {
    const cab = levelled({ carcass: { style: o.style, joinery: o.joinery } });
    const model = build(project, cab);
    const dividers = model.parts.filter((x) => x.role === 'divider');
    expect(dividers).toHaveLength(2);
    const shelf = model.parts.find((x) => x.role === 'shelfFixed')!;
    for (const d of dividers) expect(d.bounds.min.y).toBeGreaterThan(shelf.bounds.min.y);
    // The door's shelf stops at the dividers either side of it.
    const doorShelf = model.parts.find(
      (x) => x.role === 'shelfAdjustable' && x.bounds.min.y > shelf.bounds.max.y,
    )!;
    const [a, b] = dividers.map((d) => d.bounds).sort((p, q) => p.min.x - q.min.x);
    expect(doorShelf.bounds.min.x).toBeGreaterThanOrEqual(a!.max.x);
    expect(doorShelf.bounds.max.x).toBeLessThanOrEqual(b!.min.x);
    expect(violations(model, cab, project)).toEqual([]);
  });

  it('still rejects dividers nested anywhere else', () => {
    const cab = levelled({});
    const bad: Cabinet = {
      ...cab,
      face: { ...(cab.face as Extract<OpeningNode, { kind: 'split' }>), divider: false },
    };
    const r = generateCabinet(bad, project);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/only supported at the top level/);
  });
});

describe('framed end panels', () => {
  const project = (over: ConstructionOverrides = {}) => {
    const p = createProject('p', 'Ends');
    const style = createStylePreset('trad', 'traditionalPainted');
    return { ...p, stylePresets: [{ ...style, construction: { ...style.construction, ...over } }] };
  };
  const ended = (p: Project, type: Parameters<typeof createCabinet>[1], construction = {}) => ({
    ...createCabinet(p, type, { id: 'c', styleId: 'trad', construction }),
    endPanels: { left: true, right: true },
  });

  it('applies a 1/4" frame of stiles and rails over the outside of each end panel', () => {
    const p = project();
    const cab = ended(p, 'base');
    const model = build(p, cab);
    const frame = model.parts.filter((x) => x.role === 'endPanelFrame');
    expect(frame).toHaveLength(8);
    const panelL = model.parts.find((x) => x.id === 'c/endPanel/L')!;
    const left = frame.filter((x) => x.id.startsWith('c/endPanel/L/'));
    for (const s of left) {
      expect(s.bounds.max.x).toBeCloseTo(panelL.bounds.min.x, 6);
      expect(s.finished.thickness).toBeCloseTo(inch(1 / 4), 6);
      expect(s.materialRole).toBe('faceFrame');
    }
    // Stiles: floor to top (no toe-kick notch on a flush plinth); rails between them.
    const stiles = left.filter((x) => x.name === 'End frame stile');
    for (const s of stiles) {
      expect(s.bounds.min.y).toBeCloseTo(0, 6);
      expect(s.bounds.max.y).toBeCloseTo(cab.height, 6);
      expect(s.finished.width).toBeCloseTo(inch(2.25), 6);
    }
    const rails = left.filter((x) => x.name === 'End frame rail');
    for (const r of rails)
      expect(r.finished.length).toBeCloseTo(panelL.bounds.max.z - 2 * inch(2.25), 6);
    expect(violations(model, cab, p)).toEqual([]);
  });

  it('starts above a toe-kick notch', () => {
    const p = project({ platform: { enabled: true, setback: inch(3), height: inch(4) } });
    const model = build(p, ended(p, 'base'));
    const frame = model.parts.filter((x) => x.role === 'endPanelFrame');
    expect(Math.min(...frame.map((x) => x.bounds.min.y))).toBeCloseTo(inch(4), 6);
  });

  it('is left flat, with a warning, on a panel too small for it', () => {
    const p = project({ endPanel: { style: 'framed', frameWidth: inch(8) } });
    const cab = { ...ended(p, 'wall'), depth: inch(12), height: inch(12) };
    const model = build(p, cab);
    expect(model.parts.some((x) => x.role === 'endPanelFrame')).toBe(false);
    expect(model.warnings.join()).toMatch(/too small for its applied frame/);
  });

  it('every cabinet type with framed ends passes the invariants', () => {
    const p = project();
    for (const type of [
      'base',
      'tall',
      'wall',
      'openShelf',
      'lBase',
      'lShelf',
      'blindBase',
    ] as const) {
      const cab = ended(p, type);
      const model = build(p, cab);
      expect(
        model.parts.some((x) => x.role === 'endPanelFrame'),
        type,
      ).toBe(true);
      expect(violations(model, cab, p), type).toEqual([]);
    }
  });

  it("follow a built-in's step-back: the tower's base and upper each get their own", () => {
    const p = referenceRoom();
    for (const id of ['builtins/left-tower/base', 'builtins/left-tower/upper']) {
      const { cab, model } = boxOf(p, id);
      const frame = model.parts.filter((x) => x.role === 'endPanelFrame');
      expect(frame).toHaveLength(4);
      expect(Math.max(...frame.map((x) => x.bounds.max.z))).toBeCloseTo(cab.depth, 6);
    }
  });
});
