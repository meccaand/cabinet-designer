/**
 * M15 (ADR-044): corner treatments on the spec's reference room. The fireplace run (wall 156",
 * from 12", modules to 123") meets the media run (from 21") at the media wall's start.
 */
import { describe, expect, it } from 'vitest';
import { referenceRoom } from '../__tests__/referenceRoom';
import { buildCutList } from '../cutlist';
import { generateCabinet } from '../generate';
import { violations } from '../generate/__tests__/invariants';
import { layoutIssues, layoutItems } from '../layout';
import type { Cabinet, Project, Run, SectionModule } from '../model';
import type { CabinetModel, Part } from '../parts';
import { inch } from '../units';
import { expandProject, setCorner, type CornerSettings } from './index';

function room(corner: Partial<CornerSettings>, edit?: (p: Project) => void): Project {
  const p = referenceRoom();
  edit?.(p);
  setCorner(p, p.builtIns[0]!, 'media', corner);
  return p;
}
const runOn = (p: Project, wallId: string): Run =>
  p.builtIns[0]!.runs.find((r) => r.wallId === wallId)!;
const section = (p: Project, id: string) =>
  p.builtIns[0]!.runs.flatMap((r) => r.modules).find((m) => m.id === id) as SectionModule;
const cabinet = (e: ReturnType<typeof expandProject>, id: string) =>
  e.project.cabinets.find((c) => c.id === `builtins/${id}`);
const assembly = (e: ReturnType<typeof expandProject>, wallId: string) =>
  e.assemblies.find((a) => a.wallId === wallId)!;
const named = (parts: Part[], name: string) => parts.filter((p) => p.name === name);

function build(e: ReturnType<typeof expandProject>, c: Cabinet): CabinetModel {
  const r = generateCabinet(c, e.project);
  if (!r.ok) throw new Error(r.errors.join(' '));
  expect(violations(r.model, c, e.project)).toEqual([]);
  return r.model;
}

function models(e: ReturnType<typeof expandProject>) {
  return new Map(e.project.cabinets.map((c) => [c.id, build(e, c)]));
}

describe('blind corner base', () => {
  const p = room({ base: 'blind' });
  const e = expandProject(p);
  const box = cabinet(e, 'right-tower/base')!;

  it('builds without problems, and the owner runs up to the other run', () => {
    expect(e.errors.get('builtins')).toEqual([]);
    expect(e.warnings.get('builtins')).toEqual([]);
    // Fitted: the fireplace run now ends at the media run's face (156 − 12 − 18).
    expect(runOn(p, 'fireplace').length).toBe(inch(126));
  });

  it("carries the owner's end box on into the corner, to the wall", () => {
    expect(box.type).toBe('blindBase');
    // The right tower's box starts at 12 + 99 3/8 and now reaches the wall at 156".
    expect(box.placement.offset + box.width).toBeCloseTo(inch(156), 6);
    // Its blind stile: the 2 1/4" end stile and everything past the run's end (21").
    expect(box.blind).toEqual({ side: 'right', blindWidth: inch(23.25), pullFillerWidth: 0 });
    const model = build(e, box);
    const [stile] = named(model.parts, 'Face frame blind stile');
    expect(stile!.bounds.max.x - stile!.bounds.min.x).toBeCloseTo(inch(23.25), 6);
    // The door is as wide as before.
    expect(model.fronts).toHaveLength(1);
  });

  it("drops the owner's corner filler; the other run keeps its own, as the pull filler", () => {
    expect(named(assembly(e, 'fireplace').model.parts, 'Corner filler')).toEqual([]);
    const [filler] = named(assembly(e, 'media').model.parts, 'Corner filler');
    expect(filler!.bounds.max.x - filler!.bounds.min.x).toBeCloseTo(inch(3), 6);
    // The uppers keep their dead corner.
    expect(named(assembly(e, 'fireplace').model.parts, 'Corner stile')).toHaveLength(1);
  });

  it('clears the boxes on the other wall', () => {
    const items = layoutItems(e.project, models(e));
    expect(layoutIssues(e.project, items)).toEqual([]);
  });

  it('can belong to the later run', () => {
    const later = room({ base: 'blind', owner: 'later' });
    const x = expandProject(later);
    expect(x.errors.get('builtins')).toEqual([]);
    expect(cabinet(x, 'right-tower/base')!.type).toBe('base');
    const left = cabinet(x, 'media-left/base')!;
    expect(left.type).toBe('blindBase');
    expect(left.blind!.side).toBe('left');
    expect(left.placement.offset).toBe(0);
    // The media run now starts at the fireplace run's face.
    expect(runOn(later, 'media').offset).toBe(inch(18));
    expect(named(assembly(x, 'media').model.parts, 'Corner filler')).toEqual([]);
    expect(named(assembly(x, 'fireplace').model.parts, 'Corner filler')).toHaveLength(1);
    expect(layoutIssues(x.project, layoutItems(x.project, models(x)))).toEqual([]);
  });

  it('needs a section at the end that carries on', () => {
    const p = room({ base: 'blind' }, (q) => {
      const run = runOn(q, 'fireplace');
      run.modules = run.modules.slice(0, 5); // ends at the fireplace opening
    });
    expect(expandProject(p).errors.get('builtins')!.join()).toMatch(
      /blind corner base at its right end needs a section/,
    );
  });

  it("can't be blind at both ends of a one-section run", () => {
    const p = referenceRoom();
    p.room.walls.push({
      id: 'w3',
      name: 'Wall 3',
      length: inch(60),
      height: inch(108),
      turn: 'right',
    });
    const b = p.builtIns[0]!;
    const media = runOn(p, 'media');
    media.modules = media.modules.slice(0, 3);
    media.length = inch(120);
    media.ends.right = 'corner';
    b.runs.push({
      ...runOn(p, 'fireplace'),
      id: 'w3-run',
      wallId: 'w3',
      offset: inch(21),
      length: inch(39),
      ends: { left: 'corner', right: 'wall' },
    });
    setCorner(p, b, 'media', { base: 'blind', owner: 'later' });
    setCorner(p, b, 'w3', { base: 'blind' });
    expect(expandProject(p).errors.get('builtins')!.join()).toMatch(/blind corner at both ends/);
  });
});

describe('wrap-around shelves', () => {
  const p = room({ upper: 'wrap' });
  const e = expandProject(p);
  const L = e.project.cabinets.find((c) => c.type === 'lShelf')!;

  it('make the two corner bays one L of open shelves on the countertop', () => {
    expect(e.errors.get('builtins')).toEqual([]);
    expect(e.warnings.get('builtins')).toEqual([]);
    expect(cabinet(e, 'right-tower/upper')).toBeUndefined();
    expect(cabinet(e, 'media-left/upper')).toBeUndefined();
    expect(L.name).toBe('Living room built-ins · Corner shelves (Right tower + Left bay)');
    expect(L.placement).toEqual({
      wallId: 'fireplace',
      offset: cabinet(e, 'right-tower/base')!.placement.offset,
      elevation: inch(32),
    });
    expect(L.width + L.placement.offset).toBeCloseTo(inch(156), 6);
    expect(L.height).toBeCloseTo(inch(108 - 10 - 32), 6);
    expect(L.depth).toBe(inch(12));
    // The return: from the fireplace wall to the far side of the left bay's box.
    const leftBase = cabinet(e, 'media-left/base')!;
    expect(L.corner!.returnWidth).toBeCloseTo(leftBase.placement.offset + leftBase.width, 6);
    expect(L.corner!.returnDepth).toBe(inch(12));
    // Each wing keeps its bay's outer stile: all of the right tower's (beside the fireplace),
    // half of the one the left bay shares with the TV section.
    expect(L.stiles).toEqual({ left: inch(2.25), right: inch(1.5) });
    expect(e.sources.get(L.id)).toMatchObject({ moduleId: 'right-tower', level: 'upper' });
  });

  it('have no corner stiles over a dead corner', () => {
    expect(named(assembly(e, 'fireplace').model.parts, 'Corner stile')).toEqual([]);
    expect(named(assembly(e, 'media').model.parts, 'Corner stile')).toEqual([]);
    // The base is still a dead corner.
    expect(named(assembly(e, 'fireplace').model.parts, 'Corner filler')).toHaveLength(1);
  });

  it("line up with the run's other bays, nosing and all", () => {
    const tops = (m: CabinetModel, wing: 'run' | 'return') =>
      m.parts
        .filter((x) => x.role === 'shelfFixed' && (x.wing === 'return') === (wing === 'return'))
        .map((x) => x.bounds.max.y)
        .sort((a, b) => a - b);
    const lm = build(e, L);
    const tower = build(e, cabinet(e, 'left-tower/upper')!);
    const bay = build(e, cabinet(e, 'media-right/upper')!);
    expect(tops(lm, 'run')).toHaveLength(4);
    tops(lm, 'run').forEach((y, i) => expect(y).toBeCloseTo(tops(tower, 'run')[i]!, 6));
    tops(lm, 'return').forEach((y, i) => expect(y).toBeCloseTo(tops(bay, 'run')[i]!, 6));
    expect(lm.parts.filter((x) => x.role === 'shelfNosing')).toHaveLength(8);
    expect(lm.warnings).toEqual([]);
  });

  it('keep the picture lights, centred over the opening that now runs to the corner', () => {
    const lights = assembly(e, 'fireplace').lights;
    expect(lights).toHaveLength(2);
    const box = cabinet(e, 'right-tower/base')!;
    const x0 = box.placement.offset - inch(12) + inch(2.25);
    const x1 = inch(156 - 12 - 12 - 2.25); // to the corner stile (the style's 2 1/4") where the uppers meet
    const light = lights[1]!;
    expect((light.min.x + light.max.x) / 2).toBeCloseTo((x0 + x1) / 2, 0);
  });

  it('build, lay out and cut', () => {
    expect(layoutIssues(e.project, layoutItems(e.project, models(e)))).toEqual([]);
    const cut = buildCutList(e.project, models(e));
    expect(cut.parts.filter((x) => x.part.cabinetId === L.id).length).toBeGreaterThan(20);
  });

  it('with a blind base too', () => {
    const both = expandProject(room({ base: 'blind', upper: 'wrap' }));
    expect(both.errors.get('builtins')).toEqual([]);
    expect(layoutIssues(both.project, layoutItems(both.project, models(both)))).toEqual([]);
  });

  it('need open bays at both ends, at one height, with as many shelves', () => {
    const tv = room({ upper: 'wrap' }, (q) => {
      const m = runOn(q, 'media').modules;
      [m[1], m[3]] = [m[3]!, m[1]!]; // the TV section into the corner
    });
    expect(expandProject(tv).errors.get('builtins')!.join()).toMatch(
      /Media wall: wrap-around shelves need an open bay at its left end/,
    );
    const shelves = room({ upper: 'wrap' }, (q) => {
      section(q, 'media-left').upper = { kind: 'openBay', shelves: 3 };
    });
    expect(expandProject(shelves).errors.get('builtins')!.join()).toMatch(
      /Fireplace wall: wrap-around shelves need the same number of shelves .*has 4.*has 3/,
    );
    const counter = room(
      { upper: 'wrap' },
      (q) => void (runOn(q, 'media').countertopHeight = inch(36)),
    );
    expect(expandProject(counter).errors.get('builtins')!.join()).toMatch(
      /same countertop height and top line/,
    );
  });

  it('wait until both runs have modules', () => {
    const empty = room({ upper: 'wrap' }, (q) => void (runOn(q, 'media').modules = []));
    const x = expandProject(empty);
    expect(x.errors.get('builtins')).toEqual([]);
    expect(cabinet(x, 'right-tower/upper')).toBeDefined();
    expect(named(assembly(x, 'fireplace').model.parts, 'Corner stile')).toHaveLength(1);
  });
});
