/**
 * M13 (ADR-042): run trim and corners, on the spec's reference room. The fireplace wall (156")
 * has its run from 12" to 135", open on the left, meeting the media wall's run round the inside
 * corner on the right; the media wall's run starts 21" from that corner.
 */
import { describe, expect, it } from 'vitest';
import { referenceRoom } from '../__tests__/referenceRoom';
import { estimate } from '../costing';
import { buildCutList } from '../cutlist';
import { generateCabinet } from '../generate';
import type { Project, Run } from '../model';
import type { Part } from '../parts';
import { inch } from '../units';
import {
  expandProject,
  mouldingBoxes,
  mouldingLength,
  mouldingTotals,
  type Assembly,
  type MouldingSegment,
} from './index';

const fire = (e: ReturnType<typeof expandProject>) =>
  e.assemblies.find((a) => a.wallId === 'fireplace')!;
const media = (e: ReturnType<typeof expandProject>) =>
  e.assemblies.find((a) => a.wallId === 'media')!;
const named = (a: Assembly, name: string): Part[] => a.model.parts.filter((p) => p.name === name);
const kind = (a: Assembly, k: 'crown' | 'base') => a.mouldings.filter((m) => m.kind === k);

function editRun(p: Project, wallId: string, edit: (r: Run) => void): Project {
  const run = p.builtIns[0]!.runs.find((r) => r.wallId === wallId)!;
  edit(run);
  return p;
}

const te = 18 + inch(1 / 4); // end panel + applied frame

describe('acceptance #4: crown and frieze', () => {
  const e = expandProject(referenceRoom());

  it('builds without problems', () => {
    expect(e.errors.get('builtins')).toEqual([]);
    expect(e.warnings.get('builtins')).toEqual([]);
  });

  it('run continuously across the fireplace', () => {
    const crown = kind(fire(e), 'crown');
    expect(crown).toHaveLength(1);
    const frieze = named(fire(e), 'Frieze');
    expect(frieze).toHaveLength(1);
    // From the open end (outside the left tower's end panel) past the fireplace (run x 42 1/2 …
    // 102 1/2) to the corner.
    const fp = e.obstructions[0]!;
    const runFp = fp.offset - inch(12);
    for (const x0 of [crown[0]!.x0, frieze[0]!.bounds.min.x]) {
      expect(x0).toBeCloseTo(-te, 6);
      expect(x0).toBeLessThan(runFp);
    }
    expect(frieze[0]!.bounds.max.x).toBeGreaterThan(runFp + fp.width);
    expect(crown[0]!.x1).toBeGreaterThan(runFp + fp.width);
  });

  it('meet the media wall at the inside corner: one mitred crown joint, the frieze butted', () => {
    const [fc] = kind(fire(e), 'crown');
    const [mc] = kind(media(e), 'crown');
    // Each crown runs to the other wall's frieze face (12" uppers): a mitre at the corner.
    expect(fc!.x1).toBeCloseTo(inch(156 - 12 - 12), 6);
    expect(fc!.ends.right).toBe('insideCorner');
    expect(mc!.x0).toBeCloseTo(inch(12 - 21), 6);
    expect(mc!.ends.left).toBe('insideCorner');
    // The fireplace wall's frieze runs through to the wall; the media wall's butts into it.
    expect(named(fire(e), 'Frieze')[0]!.bounds.max.x).toBeCloseTo(inch(156 - 12), 6);
    expect(named(media(e), 'Frieze')[0]!.bounds.min.x).toBeCloseTo(inch(12 - 21), 6);
    const totals = mouldingTotals(e.assemblies.flatMap((a) => a.mouldings));
    const crown = totals.find((t) => t.kind === 'crown')!;
    expect(crown.insideMiters).toBe(1);
    expect(crown.outsideMiters).toBe(1); // the open left end, with its return
  });

  it('the frieze fills the gap below the crown and returns at the open end', () => {
    const [front] = named(fire(e), 'Frieze');
    expect(front!.bounds.min.y).toBeCloseTo(inch(108 - 10), 6);
    expect(front!.bounds.max.y).toBeCloseTo(inch(108 - 4.5), 6);
    expect(front!.bounds.max.z).toBeCloseTo(inch(12), 6);
    const [ret] = named(fire(e), 'Frieze return');
    expect(ret!.bounds.min.x).toBeCloseTo(-te, 6);
    expect(ret!.bounds.min.z).toBe(0);
    expect(ret!.bounds.max.z).toBeCloseTo(front!.bounds.min.z, 6);
    expect(named(media(e), 'Frieze return')).toHaveLength(0);
  });

  it('stop either side of an opening set to stop them', () => {
    const p = referenceRoom();
    const run = p.builtIns[0]!.runs[0]!;
    run.modules = run.modules.map((m) => (m.kind === 'obstruction' ? { ...m, crown: 'stop' } : m));
    const f = fire(expandProject(p));
    expect(kind(f, 'crown')).toHaveLength(2);
    expect(named(f, 'Frieze')).toHaveLength(2);
    const [a, b] = kind(f, 'crown');
    expect(a!.ends.right).toBe('square');
    expect(b!.ends.left).toBe('square');
  });
});

describe('the inside corner', () => {
  const e = expandProject(referenceRoom());

  it('closes each run to the other with a 3" corner filler and a 9" corner stile', () => {
    // Fireplace run ends at 123" (run coordinates); the media wall's boxes are 18" deep and
    // its uppers 12": fillers to 156 − 12 − 18 = 126" and 156 − 12 − 12 = 132".
    const [fb] = named(fire(e), 'Corner filler');
    const [fu] = named(fire(e), 'Corner stile');
    expect([fb!.bounds.min.x, fb!.bounds.max.x]).toEqual([inch(123), inch(126)]);
    expect([fu!.bounds.min.x, fu!.bounds.max.x]).toEqual([inch(123), inch(132)]);
    expect(fu!.bounds.min.y).toBe(inch(32));
    expect(fu!.bounds.max.y).toBe(inch(98));
    // Media run starts 21" out: fillers back to 18" and 12" from the corner.
    const [mb] = named(media(e), 'Corner filler');
    const [mu] = named(media(e), 'Corner stile');
    expect([mb!.bounds.min.x, mb!.bounds.max.x]).toEqual([inch(-3), 0]);
    expect([mu!.bounds.min.x, mu!.bounds.max.x]).toEqual([inch(-9), 0]);
    expect(fb!.bounds.max.z).toBe(inch(18));
    expect(fu!.bounds.max.z).toBe(inch(12));
  });

  it("butts the countertops: the fireplace wall's runs through, the media wall's meets its edge", () => {
    const fireTops = fire(e).model.parts.filter((p) => p.role === 'countertop');
    expect(Math.max(...fireTops.map((p) => p.bounds.max.x))).toBeCloseTo(inch(156 - 12), 6);
    const mediaTops = media(e).model.parts.filter((p) => p.role === 'countertop');
    // The fireplace wall's countertop face: 18" + 3/4" overhang from its wall.
    expect(Math.min(...mediaTops.map((p) => p.bounds.min.x))).toBeCloseTo(inch(18.75 - 21), 6);
  });

  it('base moulding mitres round the corner on the fillers', () => {
    const fb = kind(fire(e), 'base');
    const mb = kind(media(e), 'base');
    expect(fb.at(-1)!.x1).toBeCloseTo(inch(126), 6);
    expect(fb.at(-1)!.ends.right).toBe('insideCorner');
    expect(mb[0]!.x0).toBeCloseTo(inch(-3), 6);
    expect(mb[0]!.ends.left).toBe('insideCorner');
  });

  it('is reported when the runs collide, or when there is no run to meet', () => {
    const tight = editRun(referenceRoom(), 'media', (r) => void (r.offset = inch(12)));
    expect(expandProject(tight).errors.get('builtins')!.join()).toMatch(
      /runs into the boxes on the other wall/,
    );
    const lonely = editRun(referenceRoom(), 'media', (r) => void (r.ends.left = 'wall'));
    expect(expandProject(lonely).errors.get('builtins')!.join()).toMatch(
      /no run on Media wall has its left end set to meet it/,
    );
    const noCorner = editRun(referenceRoom(), 'fireplace', (r) => void (r.ends.left = 'corner'));
    expect(expandProject(noCorner).errors.get('builtins')!.join()).toMatch(
      /doesn't start at an inside corner/,
    );
  });

  it('warns when a corner filler is too narrow for doors to clear', () => {
    const p = editRun(referenceRoom(), 'media', (r) => void (r.offset = inch(19)));
    expect(expandProject(p).warnings.get('builtins')!.join()).toMatch(/doors on the two walls/);
  });

  it('every box still builds soundly', () => {
    for (const c of e.project.cabinets) expect(generateCabinet(c, e.project).ok, c.id).toBe(true);
  });
});

describe('base moulding', () => {
  const e = expandProject(referenceRoom());

  it('runs along the base boxes and stops at the pilaster and the fireplace', () => {
    const fb = kind(fire(e), 'base');
    expect(fb).toHaveLength(2);
    // Left tower: from its end panel (returned to the wall) to the pilaster.
    expect(fb[0]!.ends).toEqual({ left: 'outsideCorner', right: 'square' });
    expect(fb[0]!.x0).toBeCloseTo(-te, 6);
    expect(fb[0]!.x1).toBeCloseTo(inch(34.5), 6);
    expect(fb[0]!.y1).toBe(inch(4.5));
    expect(fb[0]!.z).toBe(inch(18));
    expect(fb[1]!.ends.left).toBe('square');
  });
});

describe('picture lights', () => {
  const e = expandProject(referenceRoom());

  it('centre on the frieze over each section that asks for one, and are bought', () => {
    const lights = e.assemblies.flatMap((a) => a.lights);
    expect(lights).toHaveLength(4);
    const tower = e.project.cabinets.find((c) => c.id === 'builtins/left-tower/upper')!;
    const [l] = fire(e).lights;
    expect((l!.min.x + l!.max.x) / 2).toBeCloseTo(
      tower.placement.offset - inch(12) + tower.width / 2,
      6,
    );
    expect(l!.max.x - l!.min.x).toBeCloseTo(inch(16), 6);
    expect((l!.min.y + l!.max.y) / 2).toBeCloseTo(inch(98 + 5.5 / 2), 6);
    expect(fire(e).model.hardware).toEqual([
      { kind: 'pictureLight', itemId: 'picture-light', name: 'Picture light', qty: 2 },
    ]);
  });
});

describe('trim settings', () => {
  it('no crown, no base moulding, no frieze when their heights are 0', () => {
    const p = referenceRoom();
    p.builtIns[0]!.trim = { ...p.builtIns[0]!.trim, crownHeight: 0, baseMouldingHeight: 0 };
    p.builtIns[0]!.topGap = 0;
    const e = expandProject(p);
    expect(e.assemblies.flatMap((a) => a.mouldings)).toEqual([]);
    expect(e.assemblies.flatMap((a) => named(a, 'Frieze'))).toEqual([]);
    // Lights then go on the face frame's top rail.
    expect(fire(e).lights[0]!.max.y).toBeLessThan(inch(108));
  });

  it('a crown taller than the space above the uppers is an error', () => {
    const p = referenceRoom();
    p.builtIns[0]!.trim.crownHeight = inch(12);
    expect(expandProject(p).errors.get('builtins')!.join()).toMatch(/taller than the space/);
  });
});

describe('moulding lengths and totals', () => {
  const seg = (ends: MouldingSegment['ends']): MouldingSegment => ({
    kind: 'crown',
    x0: 0,
    x1: 1000,
    z: 300,
    y0: 0,
    y1: 100,
    projection: 75,
    ends,
  });

  it('measure to the long points, with outside returns back to the wall', () => {
    expect(mouldingLength(seg({ left: 'square', right: 'square' }))).toBe(1000);
    expect(mouldingLength(seg({ left: 'insideCorner', right: 'square' }))).toBe(1075);
    expect(mouldingLength(seg({ left: 'outsideCorner', right: 'square' }))).toBe(1000 + 150 + 300);
  });

  it('count each inside corner once, though both runs end there', () => {
    const t = mouldingTotals([
      seg({ left: 'outsideCorner', right: 'insideCorner' }),
      seg({ left: 'insideCorner', right: 'square' }),
    ]);
    expect(t).toEqual([
      { kind: 'crown', length: 1450 + 75 + 1075, insideMiters: 1, outsideMiters: 1 },
    ]);
  });

  it('draw a return box at an outside corner', () => {
    const boxes = mouldingBoxes(seg({ left: 'outsideCorner', right: 'square' }));
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.min.x).toBe(-75);
    expect(boxes[1]).toMatchObject({ min: { x: -75, z: 0 }, max: { x: 0, z: 300 } });
  });
});

describe('the estimate', () => {
  it('buys mouldings by length with waste, and the picture lights', () => {
    const p = referenceRoom();
    const e = expandProject(p);
    const models = new Map(
      e.project.cabinets.map((c) => {
        const r = generateCabinet(c, e.project);
        return [c.id, r.ok ? r.model : null] as const;
      }),
    );
    const cutList = buildCutList(
      e.project,
      models,
      e.assemblies.map((a) => ({ id: a.id, name: a.name, parts: a.model.parts })),
    );
    expect(cutList.groups.flatMap((g) => g.rows).some((r) => r.name === 'Frieze')).toBe(true);
    const totals = mouldingTotals(e.assemblies.flatMap((a) => a.mouldings));
    const est = estimate(e.project, cutList, [], models, {
      hardware: e.assemblies.flatMap((a) => a.model.hardware),
      mouldings: totals,
    });
    const crown = est.mouldings.find((m) => m.kind === 'crownMoulding')!;
    const crownTotal = totals.find((t) => t.kind === 'crown')!;
    expect(crown.length).toBeCloseTo(crownTotal.length * 1.2, 6);
    expect(crown.cost).toBeCloseTo((crown.length / 1000) * 11.5, 6);
    expect(crown).toMatchObject({ insideMiters: 1, outsideMiters: 1, name: 'Crown moulding' });
    expect(est.hardware.find((h) => h.kind === 'pictureLight')).toMatchObject({
      qty: 4,
      cost: 180,
    });
    expect(est.total).toBeCloseTo(
      [...est.sheets, ...est.solids, ...est.banding, ...est.hardware, ...est.mouldings].reduce(
        (s, x) => s + x.cost,
        0,
      ),
      6,
    );
  });
});
