/**
 * Style presets in the generator (ADR-039): a preset restyles every cabinet that follows it,
 * shelf nosing on open shelves, and where knobs and pulls go. Expected sizes are worked out here
 * from the formulas in docs/CONSTRUCTION.md, independently of the generator.
 */
import { describe, expect, it } from 'vitest';
import { buildCutList } from '../cutlist';
import {
  createProject,
  createStylePreset,
  type Cabinet,
  type CabinetType,
  type ConstructionOverrides,
  type Project,
} from '../model';
import type { CabinetModel, Part } from '../parts';
import { inch, quantize } from '../units';
import { violations } from './__tests__/invariants';
import { createCabinet, generateCabinet } from './index';

/** A project with the traditional built-in style, plus overrides to the style. */
function styledProject(over: ConstructionOverrides = {}): Project {
  const p = createProject('p', 'Built-in');
  const style = createStylePreset('trad', 'traditionalPainted');
  const merged: ConstructionOverrides = { ...style.construction };
  for (const [k, v] of Object.entries(over)) {
    (merged as Record<string, unknown>)[k] = {
      ...((merged as Record<string, object | undefined>)[k] ?? {}),
      ...v,
    };
  }
  return { ...p, stylePresets: [{ ...style, construction: merged }] };
}

function build(project: Project, cabinet: Cabinet): CabinetModel {
  const r = generateCabinet(cabinet, project);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.model;
}

function styledCabinet(
  project: Project,
  type: CabinetType,
  opts: Partial<Parameters<typeof createCabinet>[2]> = {},
): Cabinet {
  return createCabinet(project, type, { id: 'c', styleId: 'trad', ...opts });
}

const byName = (model: CabinetModel, name: string): Part[] =>
  model.parts.filter((p) => p.name === name);

const T = inch(3 / 4); // poplar: face frame, shaker frames, nosing
const ig = inch(1 / 16); // project default inset gap (the style keeps it)
const ov = inch(1 / 2); // project default face-frame overlay
const rb = inch(1 / 8); // project default gap between overlay doors
const S = inch(2.25); // style: face-frame stiles and rails, shaker stiles and rails

describe('a style preset restyles its cabinets', () => {
  // A 30" two-door base: face frame 2 1/4" stiles and rails, on a 4 1/2" plinth.
  // Opening: 30 − 2 × 2 1/4 = 25 1/2" wide; box 34 1/2 − 4 1/2 = 30" tall, opening 25 1/2".
  const W = inch(30);
  const openW = W - 2 * S;
  const openTop = inch(34.5) - S;
  const openBottom = inch(4.5) + S;

  it('acceptance #5: inset → overlay recalculates the doors and the cut list', () => {
    const inset = styledProject();
    const cab = styledCabinet(inset, 'base', { width: W, layout: 'doors' });
    const overlay: Project = {
      ...inset,
      stylePresets: inset.stylePresets.map((s) => ({
        ...s,
        construction: { ...s.construction, fronts: { ...s.construction.fronts, mount: 'overlay' } },
      })),
    };

    // Inset: the pair fills the opening less the gap all round; 2 × gap between the doors.
    const insetDoorW = (openW - 2 * ig - 2 * ig) / 2;
    const insetDoorH = openTop - openBottom - 2 * ig;
    // Overlay: the pair covers the opening plus the overlay all round; gap between the doors.
    const overlayDoorW = (openW + 2 * ov - rb) / 2;
    const overlayDoorH = openTop - openBottom + 2 * ov;

    for (const [project, w, h] of [
      [inset, insetDoorW, insetDoorH],
      [overlay, overlayDoorW, overlayDoorH],
    ] as const) {
      const model = build(project, cab);
      const doors = model.fronts.filter((f) => f.kind === 'door');
      expect(doors).toHaveLength(2);
      for (const d of doors) {
        expect(d.width).toBeCloseTo(w, 6);
        expect(d.height).toBeCloseTo(h, 6);
      }
      // Shaker: stiles are the door height, rails the width less both stiles.
      for (const s of byName(model, 'Door (L) stile')) expect(s.finished.length).toBeCloseTo(h, 6);
      for (const r of byName(model, 'Door (L) rail'))
        expect(r.finished.length).toBeCloseTo(w - 2 * S, 6);
    }

    // The cut list follows: the door stile and rail rows change size.
    const rows = (project: Project) => {
      const list = buildCutList(
        { ...project, cabinets: [cab] },
        new Map([['c', build(project, cab)]]),
      );
      return list.groups
        .flatMap((g) => g.rows)
        .filter((r) => /^Door (stile|rail)/.test(r.name))
        .map((r) => [r.name, r.length, r.qty]);
    };
    expect(rows(inset)).not.toEqual(rows(overlay));
    expect(rows(inset)).toContainEqual(['Door stile', quantize(insetDoorH), 4]);
    expect(rows(overlay)).toContainEqual(['Door stile', quantize(overlayDoorH), 4]);
  });

  it('applies the whole look: face frame, shaker, plinth with no recess, knobs', () => {
    const project = styledProject();
    const model = build(project, styledCabinet(project, 'base', { width: W, layout: 'doors' }));
    expect(model.parts.some((p) => p.role === 'ffStile')).toBe(true);
    expect(model.parts.some((p) => p.role === 'frontStile')).toBe(true);
    // The plinth's front rail is flush with the face frame (no toe-kick recess), 4 1/2" tall.
    const rails = model.parts.filter((p) => p.role === 'platformRail');
    expect(Math.max(...rails.map((r) => r.bounds.max.y))).toBeCloseTo(inch(4.5), 6);
    expect(Math.max(...rails.map((r) => r.bounds.max.z))).toBeCloseTo(inch(24), 6);
    expect(model.hardware.find((h) => h.kind === 'knob')?.qty).toBe(2);
    expect(model.hardware.some((h) => h.kind === 'pull')).toBe(false);
  });

  it('a cabinet without the style is unchanged by it', () => {
    const project = styledProject();
    const plain = createCabinet(project, 'base', { id: 'c', width: W });
    const bare = createProject('p', 'Built-in');
    expect(build(project, plain)).toEqual(build(bare, plain));
  });
});

describe('shelf nosing', () => {
  it('fronts each open shelf with a 1 1/2" strip, top flush, the ply shelf shorter by its thickness', () => {
    const project = styledProject();
    const cab = styledCabinet(project, 'openShelf');
    const model = build(project, cab);
    const shelves = model.parts.filter((p) => p.role === 'shelfAdjustable');
    const nosings = model.parts.filter((p) => p.role === 'shelfNosing');
    expect(shelves).toHaveLength(4);
    expect(nosings).toHaveLength(4);

    const plain = build(createProject('p', 'x'), {
      ...cab,
      construction: { ...project.stylePresets[0]!.construction, shelves: { nosingHeight: 0 } },
      styleId: undefined,
    } as Cabinet);
    const plainShelf = plain.parts.find((p) => p.role === 'shelfAdjustable')!;

    shelves.forEach((shelf, i) => {
      const n = nosings[i]!;
      expect(n.id).toBe(`${shelf.id}/nosing`);
      expect(n.materialRole).toBe('faceFrame');
      expect(n.bounds.max.y).toBeCloseTo(shelf.bounds.max.y, 6);
      expect(n.bounds.max.y - n.bounds.min.y).toBeCloseTo(inch(1.5), 6);
      expect(n.bounds.max.z - n.bounds.min.z).toBeCloseTo(T, 6);
      // The strip sits where the shelf's front edge was; the shelf gives up its thickness.
      expect(n.bounds.min.z).toBeCloseTo(shelf.bounds.max.z, 6);
      expect(n.bounds.max.z).toBeCloseTo(plainShelf.bounds.max.z, 6);
      expect(n.bounds.min.x).toBeCloseTo(shelf.bounds.min.x, 6);
      expect(n.bounds.max.x).toBeCloseTo(shelf.bounds.max.x, 6);
      // The strip covers the front edge, so the shelf isn't banded there.
      expect(shelf.edges.long1).toBeNull();
      expect(n.finished.length).toBeCloseTo(shelf.finished.length, 6);
    });
    expect(violations(model, cab, project)).toEqual([]);
  });

  it('fixed shelves: the strip runs between the sides, not into the dados', () => {
    const project = styledProject();
    const cab = styledCabinet(project, 'openShelf');
    const fixed: Cabinet = {
      ...cab,
      face: { kind: 'leaf', fill: 'open', shelves: { count: 3, adjustable: false } },
    };
    const model = build(project, fixed);
    const shelf = model.parts.find((p) => p.role === 'shelfFixed')!;
    const nosing = model.parts.find((p) => p.role === 'shelfNosing')!;
    const dado = project.construction.carcass.dadoDepth;
    expect(nosing.bounds.min.x).toBeCloseTo(shelf.bounds.min.x + dado, 6);
    expect(nosing.bounds.max.x).toBeCloseTo(shelf.bounds.max.x - dado, 6);
    expect(violations(model, fixed, project)).toEqual([]);
  });

  it('is not added behind doors', () => {
    const project = styledProject();
    const model = build(project, styledCabinet(project, 'base', { layout: 'doors' }));
    expect(model.parts.some((p) => p.role === 'shelfAdjustable')).toBe(true);
    expect(model.parts.some((p) => p.role === 'shelfNosing')).toBe(false);
  });

  it('must be at least as tall as the shelf, and limits how many shelves fit', () => {
    const low = styledProject({ shelves: { nosingHeight: inch(1 / 2) } });
    const r = generateCabinet(styledCabinet(low, 'openShelf'), low);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/at least as tall/);

    const project = styledProject({ shelves: { nosingHeight: inch(6) } });
    const cab = styledCabinet(project, 'openShelf', { height: inch(30) });
    const crowded: Cabinet = {
      ...cab,
      face: { kind: 'leaf', fill: 'open', shelves: { count: 4, adjustable: true } },
    };
    const r2 = generateCabinet(crowded, project);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors[0]).toMatch(/too many shelves/);
  });

  it('L-shaped shelving warns instead (not made yet)', () => {
    const project = styledProject();
    const model = build(project, styledCabinet(project, 'lShelf'));
    expect(model.parts.some((p) => p.role === 'shelfNosing')).toBe(false);
    expect(model.warnings.join()).toMatch(/nosing/);
  });
});

describe('knobs and pulls', () => {
  const centre = (h: { bounds: Part['bounds'] }) => ({
    x: (h.bounds.min.x + h.bounds.max.x) / 2,
    y: (h.bounds.min.y + h.bounds.max.y) / 2,
  });

  it('a pair: both knobs on the meeting stiles, 2 3/4" down from the top', () => {
    const project = styledProject();
    const W = inch(30);
    const cab = styledCabinet(project, 'base', { width: W, layout: 'doors' });
    const model = build(project, cab);
    expect(model.handles).toHaveLength(2);
    const doorTop = inch(34.5) - S - ig;
    const [l, r] = [...model.handles].sort((a, b) => centre(a).x - centre(b).x);
    // Meeting edges: the middle ± one inset gap; knobs centred on each door's 2 1/4" stile.
    expect(centre(l!).x).toBeCloseTo(W / 2 - ig - S / 2, 6);
    expect(centre(r!).x).toBeCloseTo(W / 2 + ig + S / 2, 6);
    for (const h of [l!, r!]) {
      expect(h.kind).toBe('knob');
      expect(centre(h).y).toBeCloseTo(doorTop - inch(2.75), 6);
      expect(h.bounds.max.x - h.bounds.min.x).toBeCloseTo(inch(1.125), 6);
      // Inset doors: the knob stands on the face of the frame line.
      expect(h.bounds.min.z).toBeCloseTo(cab.depth, 6);
      expect(h.axis).toBe('z');
    }
    // Each knob is on its own door.
    const doorL = model.parts.find((p) => p.id === l!.frontId)!;
    expect(doorL.name).toBe('Door (L) stile');
  });

  it('a single door: on the side away from the hinge', () => {
    const project = styledProject();
    const W = inch(18);
    const cab = styledCabinet(project, 'base', { width: W, layout: 'doors' });
    const left = build(project, cab).handles;
    expect(left).toHaveLength(1);
    expect(centre(left[0]!).x).toBeCloseTo(W - S - ig - S / 2, 6);
    const hingedRight: Cabinet = {
      ...cab,
      face: { kind: 'leaf', fill: 'door', hinge: 'right', shelves: { count: 1, adjustable: true } },
    };
    expect(centre(build(project, hingedRight).handles[0]!).x).toBeCloseTo(S + ig + S / 2, 6);
  });

  it('slab doors: in from the edge by handleFromEdge', () => {
    const project = styledProject({
      fronts: { style: 'slab' },
      hardware: { handleFromEdge: inch(1.5) },
    });
    const W = inch(18);
    const cab = styledCabinet(project, 'base', { width: W, layout: 'doors' });
    expect(centre(build(project, cab).handles[0]!).x).toBeCloseTo(W - S - ig - inch(1.5), 6);
  });

  it('doors hung high: up from the bottom instead', () => {
    const project = styledProject();
    const cab = styledCabinet(project, 'wall');
    const model = build(project, cab);
    const doorBottom = S + ig; // the wall cabinet's box starts at its own y = 0
    for (const h of model.handles) expect(centre(h).y).toBeCloseTo(doorBottom + inch(2.75), 6);
  });

  it('drawers: centred, two at the quarter points when wide; pulls run across', () => {
    const project = styledProject({ hardware: { handle: 'pull' } });
    const narrow = build(project, styledCabinet(project, 'drawerBank', { width: inch(18) }));
    expect(narrow.handles).toHaveLength(3);
    for (const h of narrow.handles) {
      expect(centre(h).x).toBeCloseTo(inch(9), 6);
      expect(h.bounds.max.x - h.bounds.min.x).toBeCloseTo(inch(5), 6);
    }
    const wide = build(project, styledCabinet(project, 'drawerBank', { width: inch(36) }));
    expect(wide.handles).toHaveLength(6);
    const xs = new Set(wide.handles.map((h) => Math.round(centre(h).x)));
    expect(xs.size).toBe(2);
  });

  it('bi-fold L doors: one handle, on the return leaf near its free end', () => {
    const project = styledProject({ fronts: { mount: 'overlay' } });
    const model = build(project, styledCabinet(project, 'lBase'));
    expect(model.handles).toHaveLength(1);
    expect(model.handles[0]).toMatchObject({ wing: 'return', axis: 'x' });
  });

  // Every type, both mounts, both front styles, knob or pull: physically sound, and the
  // handles drawn are exactly the handles bought, each on its own front's face.
  const TYPES: CabinetType[] = [
    'base',
    'drawerBank',
    'blindBase',
    'tall',
    'openShelf',
    'wall',
    'blindWall',
    'lBase',
    'lShelf',
  ];
  const cases = TYPES.flatMap((type) =>
    (['inset', 'overlay'] as const).flatMap((mount) =>
      (['shaker', 'slab'] as const).flatMap((style) =>
        (['knob', 'pull'] as const).map((handle) => ({ type, mount, style, handle })),
      ),
    ),
  );
  it.each(cases)('$type, $mount $style, $handle', ({ type, mount, style, handle }) => {
    const project = styledProject({ fronts: { mount, style }, hardware: { handle } });
    const cab = styledCabinet(project, type);
    const model = build(project, cab);
    expect(violations(model, cab, project)).toEqual([]);
    const bought = model.hardware.find((h) => h.kind === handle)?.qty ?? 0;
    expect(model.handles).toHaveLength(bought);
    expect(model.hardware.some((h) => h.kind === (handle === 'knob' ? 'pull' : 'knob'))).toBe(
      false,
    );
    for (const h of model.handles) {
      const front = model.parts.find((p) => p.id === h.frontId);
      expect(front, h.frontId).toBeDefined();
      // On the front: within its door or drawer front, and standing on its face.
      const door = model.parts.filter((p) => p.id.startsWith(front!.id.replace(/\/stile\/L$/, '')));
      const lo = (a: 'x' | 'y' | 'z') => Math.min(...door.map((p) => p.bounds.min[a]));
      const hi = (a: 'x' | 'y' | 'z') => Math.max(...door.map((p) => p.bounds.max[a]));
      const across: ('x' | 'y' | 'z')[] = h.axis === 'z' ? ['x', 'y'] : ['z', 'y'];
      for (const a of across) {
        const mid = (h.bounds.min[a] + h.bounds.max[a]) / 2;
        expect(mid).toBeGreaterThan(lo(a));
        expect(mid).toBeLessThan(hi(a));
      }
      const out = h.axis;
      const onFace =
        Math.abs(h.bounds.min[out] - hi(out)) < 1e-6 ||
        Math.abs(h.bounds.max[out] - lo(out)) < 1e-6;
      expect(onFace).toBe(true);
    }
  });
});
