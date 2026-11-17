/**
 * Built-in runs compile to ordinary cabinets (ADR-040). The reference room from the spec
 * (docs/BUILTIN-SPEC.md §5): a 138" media wall of three sections between 3" stiles, and a
 * fireplace wall of two towers, a pilaster and the fireplace.
 */
import { describe, expect, it } from 'vitest';
import { referenceRoom } from '../__tests__/referenceRoom';
import { generateCabinet } from '../generate';
import { layoutIssues, layoutItems } from '../layout';
import { violations } from '../generate/__tests__/invariants';
import {
  createBuiltIn,
  createModule,
  createProject,
  createRun,
  createStylePreset,
  ProjectSchema,
  type BuiltIn,
  type Project,
  type Run,
  type RunModule,
  type SectionModule,
} from '../model';
import type { Part } from '../parts';
import { inch, quantize } from '../units';
import { compileBuiltIn, expandProject, seams } from './index';

const T = 18; // 3/4" ply as measured
const te = 18 + inch(1 / 4); // end panels: door material, plus the style's applied 1/4" frame
const et = inch(3 / 4); // poplar edge strip

function section(id: string, width: number | 'auto', over: Partial<SectionModule> = {}) {
  return { ...(createModule(id, 'section', id) as SectionModule), width, ...over };
}
const stile = (id: string, w = 3): RunModule => ({ kind: 'stile', id, width: inch(w) });

/** A project with a 144" media wall then a 120" fireplace wall, 108" ceilings. */
function room(): Project {
  const p = createProject('p', 'Living room');
  return {
    ...p,
    room: {
      walls: [
        { id: 'media', name: 'Media wall', length: inch(138), height: inch(108), turn: 'right' },
        { id: 'fire', name: 'Fireplace wall', length: inch(150), height: inch(108), turn: 'right' },
      ],
    },
    stylePresets: [createStylePreset('trad', 'traditionalPainted')],
  };
}

function mediaRun(p: Project, over: Partial<Run> = {}): Run {
  return {
    ...createRun('r-media', p.room.walls[0]!),
    modules: [
      stile('s1'),
      section('left', inch(30)),
      stile('s2'),
      section('tv', inch(66), { base: { groups: [{ doors: 2 }, { doors: 2 }], shelves: 1 } }),
      stile('s3'),
      section('right', inch(30)),
      stile('s4'),
    ],
    ...over,
  };
}

function withBuiltIn(p: Project, runs: Run[], over: Partial<BuiltIn> = {}): Project {
  return { ...p, builtIns: [{ ...createBuiltIn('b', 'Built-ins', 'trad'), runs, ...over }] };
}

const cab = (p: Project, id: string) => expandProject(p).project.cabinets.find((c) => c.id === id)!;
const parts = (p: Project, id: string): Part[] => {
  const r = generateCabinet(cab(p, id), expandProject(p).project);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.model.parts;
};

describe('a run of sections compiles to base and upper boxes', () => {
  const p = room();
  const project = withBuiltIn(p, [mediaRun(p)]);
  const expanded = expandProject(project);
  const c = (id: string) => cab(project, id);

  it('is still a valid project, with the compiled boxes added', () => {
    expect(ProjectSchema.safeParse(expanded.project).success).toBe(true);
    expect(expanded.project.cabinets.map((x) => x.id)).toEqual([
      'b/left/base',
      'b/left/upper',
      'b/tv/base',
      'b/tv/upper',
      'b/right/base',
      'b/right/upper',
    ]);
    expect(expanded.sources.get('b/tv/upper')).toEqual({
      builtInId: 'b',
      runId: 'r-media',
      moduleId: 'tv',
      level: 'upper',
    });
    expect(expanded.errors.get('b')).toEqual([]);
  });

  it('splits stiles between boxes and gives an end box the whole end stile', () => {
    // Left: 3 (all of s1) + 30 + 1 1/2 (half of s2). TV: 1 1/2 + 66 + 1 1/2. Right: mirrored.
    expect(c('b/left/base')).toMatchObject({
      width: inch(34.5),
      stiles: { left: inch(3), right: inch(1.5) },
      placement: { offset: 0 },
    });
    expect(c('b/tv/base')).toMatchObject({
      width: inch(69),
      stiles: { left: inch(1.5), right: inch(1.5) },
      placement: { offset: inch(34.5) },
    });
    expect(c('b/right/base')).toMatchObject({
      width: inch(34.5),
      stiles: { left: inch(1.5), right: inch(3) },
      placement: { offset: inch(103.5) },
    });
    // The face-frame stiles generated are those widths, and the openings are the sections'.
    const stiles = parts(project, 'b/left/base').filter((x) => x.role === 'ffStile');
    expect(stiles.map((s) => s.finished.width).sort()).toEqual([inch(1.5), inch(3)].sort());
    expect(expanded.modules.get('left')).toEqual({ x0: inch(3), x1: inch(33), width: inch(30) });
  });

  it('datums: base under the countertop, upper on it up to the top line, set back', () => {
    // Base box: 32" countertop less the 3/4" ply top. Upper: 32" to 108 − 10 = 98".
    expect(c('b/left/base')).toMatchObject({ height: inch(32) - T, depth: inch(18) });
    expect(c('b/left/upper')).toMatchObject({
      type: 'wall',
      height: inch(66),
      depth: inch(12),
      placement: { elevation: inch(32), offset: 0 },
    });
  });

  it('upper stiles line up with the base stiles below them', () => {
    for (const id of ['left', 'tv', 'right']) {
      const xs = (lvl: string) =>
        parts(project, `b/${id}/${lvl}`)
          .filter((x) => x.role === 'ffStile')
          .map((x) => [x.bounds.min.x, x.bounds.max.x]);
      expect(xs('upper')).toEqual(xs('base'));
    }
  });

  it('door groups: a pair per group, a mullion between groups', () => {
    const tv = parts(project, 'b/tv/base');
    expect(tv.filter((x) => x.role === 'ffMullion')).toHaveLength(1);
    expect(tv.filter((x) => x.name === 'Door (L) stile')).toHaveLength(4); // 2 per door, 2 doors
    const mullion = tv.find((x) => x.role === 'ffMullion')!;
    expect(mullion.finished.width).toBeCloseTo(inch(2.5), 6);
  });

  it('every compiled box builds and passes the physical invariants', () => {
    for (const cabinet of expanded.project.cabinets) {
      const r = generateCabinet(cabinet, expanded.project);
      if (!r.ok) throw new Error(`${cabinet.id}: ${r.errors.join('; ')}`);
      expect(violations(r.model, cabinet, expanded.project), cabinet.id).toEqual([]);
    }
  });

  it("'auto' sections share the run's length equally (symmetry)", () => {
    const run = mediaRun(p);
    run.modules = run.modules.map((m) =>
      m.kind === 'section' && m.id !== 'tv' ? { ...m, width: 'auto' } : m,
    );
    const auto = withBuiltIn(p, [{ ...run, length: inch(138) }]);
    expect(cab(auto, 'b/left/base').width).toBe(inch(34.5));
    expect(cab(auto, 'b/right/base').width).toBe(inch(34.5));
    const longer = withBuiltIn(p, [{ ...run, length: inch(144) }]);
    expect(cab(longer, 'b/left/base').width).toBe(inch(37.5));
    expect(cab(longer, 'b/right/base').width).toBe(inch(37.5));
  });
});

describe('acceptance criteria', () => {
  const p = room();

  it('#2: the countertop height moves every base top, upper bottom and the countertop', () => {
    for (const h of [inch(30), inch(32), inch(36)]) {
      const project = withBuiltIn(p, [mediaRun(p, { countertopHeight: h })]);
      const e = expandProject(project);
      for (const id of ['left', 'tv', 'right']) {
        const base = parts(project, `b/${id}/base`);
        expect(Math.max(...base.map((x) => x.bounds.max.y))).toBeCloseTo(h - T, 6);
        expect(cab(project, `b/${id}/upper`).placement.elevation).toBe(h);
      }
      const top = e.assemblies[0]!.model.parts;
      expect(Math.max(...top.map((x) => x.bounds.max.y))).toBeCloseTo(h, 6);
      expect(
        Math.min(...top.filter((x) => x.role === 'countertop').map((x) => x.bounds.min.y)),
      ).toBeCloseTo(h - T, 6);
    }
  });

  it("#3: the run's shelf count re-spaces every linked bay; an unlinked bay keeps its own", () => {
    const shelfYs = (project: Project, id: string) =>
      parts(project, `b/${id}/upper`)
        .filter((x) => x.role === 'shelfFixed')
        .map((x) => quantize(x.bounds.min.y))
        .sort((a, b) => a - b);
    for (const n of [3, 4, 5]) {
      const run = mediaRun(p, { shelves: n });
      run.modules = run.modules.map((m) =>
        m.id === 'tv' && m.kind === 'section'
          ? { ...m, upper: { kind: 'openBay', shelves: 2 } }
          : m,
      );
      const project = withBuiltIn(p, [run]);
      expect(shelfYs(project, 'left')).toHaveLength(n);
      // Linked bays share their shelf lines exactly.
      expect(shelfYs(project, 'right')).toEqual(shelfYs(project, 'left'));
      expect(shelfYs(project, 'tv')).toHaveLength(2);
      // Fixed, nosed shelves.
      const nosings = parts(project, 'b/left/upper').filter((x) => x.role === 'shelfNosing');
      expect(nosings).toHaveLength(n);
    }
  });
});

describe('countertop', () => {
  const p = room();

  it('runs the whole run in as few sheet-length pieces as fit, seams over box joints', () => {
    const e = expandProject(withBuiltIn(p, [mediaRun(p)]));
    const tops = e.assemblies[0]!.model.parts.filter((x) => x.role === 'countertop');
    // 138" with box joints at 34 1/2" and 103 1/2": nothing between 42" and 96", so 3 pieces.
    expect(tops.map((x) => [x.bounds.min.x, x.bounds.max.x])).toEqual([
      [0, inch(34.5)],
      [inch(34.5), inch(103.5)],
      [inch(103.5), inch(138)],
    ]);
    for (const top of tops) {
      expect(top.bounds.min.z).toBe(0);
      expect(top.bounds.max.z).toBeCloseTo(inch(18) + inch(0.75) - et, 6);
      expect(top.finished.thickness).toBe(T);
    }
    const edges = e.assemblies[0]!.model.parts.filter((x) => x.name === 'Countertop edge');
    expect(edges).toHaveLength(3);
    for (const edge of edges) {
      expect(edge.bounds.max.z).toBeCloseTo(inch(18.75), 6);
      expect(edge.bounds.max.y - edge.bounds.min.y).toBeCloseTo(inch(1), 6);
      expect(edge.materialRole).toBe('faceFrame');
    }
    expect(e.assemblies[0]).toMatchObject({ wallId: 'media', offset: 0 });
  });

  it('seams: greedy farthest joint, fewest pieces; an unsplittable span is an error', () => {
    expect(seams(0, 100, [20, 50, 80], 96)).toEqual([80]);
    expect(seams(0, 200, [50, 90, 100, 150], 96)).toEqual([90, 150]);
    expect(seams(0, 96, [], 96)).toEqual([]);
    expect(() => seams(0, 120, [10, 110], 96)).toThrow(/longer than a sheet/);
  });

  it('stops at a pilaster or obstruction; overhangs and returns at an open end', () => {
    // Fireplace wall: tower | pilaster | fireplace | tower, open on the left.
    const run: Run = {
      ...createRun('r-fire', p.room.walls[1]!),
      offset: inch(2),
      ends: { left: 'open', right: 'wall' },
      modules: [
        stile('a', 2.25),
        { ...(createModule('t1', 'tower', 'Left tower') as SectionModule), width: inch(30) },
        stile('b', 2.25),
        createModule('pil', 'pilaster'),
        createModule('fp', 'obstruction'),
        stile('c', 2.25),
        { ...(createModule('t2', 'section', 'Right tower') as SectionModule), width: inch(18) },
        stile('d', 2.25),
      ],
    };
    const project = withBuiltIn(p, [run]);
    const e = expandProject(project);
    expect(e.errors.get('b')).toEqual([]);
    const top = e.assemblies[0]!.model.parts;
    const pieces = top.filter((x) => x.role === 'countertop');
    expect(pieces).toHaveLength(2);
    // Left tower: box 0 … 34 1/2"; end panel 3/4" ply beyond; 3/4" overhang; a 3/4" end strip.
    const endStrip = top.find((x) => x.name === 'Countertop end')!;
    expect(endStrip.bounds.min.x).toBeCloseTo(-te - inch(0.75), 6);
    expect(endStrip.bounds.max.x).toBeCloseTo(-te - inch(0.75) + et, 6);
    expect(pieces[0]!.bounds.min.x).toBeCloseTo(-te - inch(0.75) + et, 6);
    expect(pieces[0]!.bounds.max.x).toBeCloseTo(inch(34.5), 6);
    // Right of the fireplace: flush with the boxes at both ends (wall on the right).
    const pil = e.project.fillers.find((f) => f.id === 'b/pil')!;
    expect(pil).toMatchObject({
      wallId: 'fire',
      offset: inch(2 + 34.5),
      width: inch(6),
      height: inch(98),
      elevation: 0,
      depth: inch(12),
    });
    expect(e.obstructions).toEqual([
      expect.objectContaining({ label: 'Fireplace', offset: inch(2 + 34.5 + 6), width: inch(60) }),
    ]);
    const right = cab(project, 'b/t2/base');
    expect(right.placement.offset).toBe(inch(2 + 34.5 + 6 + 60));
    expect(pieces[1]!.bounds.min.x).toBeCloseTo(right.placement.offset - inch(2), 6);
    expect(pieces[1]!.bounds.max.x).toBeCloseTo(right.placement.offset - inch(2) + right.width, 6);
    // The left tower has its finished end panel on both boxes.
    expect(parts(project, 'b/t1/base').some((x) => x.role === 'endPanel')).toBe(true);
    expect(parts(project, 'b/t1/upper').some((x) => x.role === 'endPanel')).toBe(true);
  });
});

describe('problems are reported, not thrown', () => {
  const p = room();
  const errors = (project: Project) => compileBuiltIn(project, project.builtIns[0]!).errors;

  it.each<[string, (run: Run) => Run, RegExp]>([
    [
      'a stile with no section beside it',
      (r) => ({ ...r, modules: [stile('x')] }),
      /stile needs a section/,
    ],
    [
      'an end panel where two sections meet',
      (r) => ({
        ...r,
        modules: r.modules.map((m) =>
          m.id === 'left' && m.kind === 'section'
            ? { ...m, endPanels: { left: false, right: true } }
            : m,
        ),
      }),
      /end panel on its right side/,
    ],
    [
      'auto sections squeezed below 6"',
      (r) => ({
        ...r,
        length: inch(100),
        modules: r.modules.map((m) =>
          m.id === 'left' ? { ...m, width: 'auto' } : m,
        ) as RunModule[],
      }),
      /auto-width section/,
    ],
    [
      'a countertop overhang thinner than its edge strip',
      (r) => ({ ...r, countertopOverhang: inch(1 / 2) }),
      /overhang/,
    ],
    [
      'a countertop edge thinner than the top',
      (r) => ({ ...r, countertopEdge: inch(1 / 2) }),
      /at least as tall/,
    ],
  ])('%s', (_, change, message) => {
    const project = withBuiltIn(p, [change(mediaRun(p))]);
    expect(errors(project).join('\n')).toMatch(message);
  });

  it('a top line at or below the countertop', () => {
    const project = withBuiltIn(p, [mediaRun(p)], { topGap: inch(80) });
    expect(errors(project).join()).toMatch(/no height/);
  });

  it('a frameless style', () => {
    const project = withBuiltIn({ ...p, stylePresets: [] }, [mediaRun(p)], { styleId: null });
    expect(errors(project).join()).toMatch(/face-frame/);
  });

  it('one bad run does not stop the others', () => {
    const bad = { ...mediaRun(p), id: 'bad', modules: [stile('x')] };
    const project = withBuiltIn(p, [bad, mediaRun(p)]);
    const e = expandProject(project);
    expect(e.errors.get('b')).toHaveLength(1);
    expect(e.project.cabinets).toHaveLength(6);
  });
});

describe('expandProject', () => {
  it('returns the project itself when there are no built-ins', () => {
    const p = room();
    expect(expandProject(p).project).toBe(p);
  });
});

describe('the reference room', () => {
  it('validates, compiles without problems, builds every box soundly and lays out cleanly', () => {
    const p = referenceRoom();
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    const e = expandProject(p);
    expect(e.errors.get('builtins')).toEqual([]);
    const models = new Map(
      e.project.cabinets.map((c) => {
        const r = generateCabinet(c, e.project);
        if (!r.ok) throw new Error(`${c.id}: ${r.errors.join('; ')}`);
        expect(violations(r.model, c, e.project), c.id).toEqual([]);
        return [c.id, r.model] as const;
      }),
    );
    expect(e.project.cabinets).toHaveLength(10);
    // Nothing overlaps or runs past a wall, the corner included.
    expect(layoutIssues(e.project, layoutItems(e.project, models))).toEqual([]);
    // The media wall's side bays are mirrored about the TV section.
    expect(cab(p, 'builtins/media-left/base').width).toBe(
      cab(p, 'builtins/media-right/base').width,
    );
    // One countertop per run; two pieces of it on the fireplace wall, either side of the fire.
    expect(
      e.assemblies.map((a) => a.model.parts.filter((x) => x.role === 'countertop').length),
    ).toEqual([2, 3]);
  });
});
