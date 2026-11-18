import { describe, expect, it } from 'vitest';
import { referenceRoom } from '../__tests__/referenceRoom';
import { createBuiltIn, createRun, type Project, type Run, type SectionModule } from '../model';
import { inch } from '../units';
import {
  compileBuiltIn,
  CORNER_FILLER,
  fitRun,
  hingeTowardsEnd,
  layoutModules,
  setRunEnd,
  setRunOffset,
  syncEndPanels,
} from './index';

function ids() {
  let n = 0;
  return () => `m${++n}`;
}

/** The reference room's two walls with an empty built-in. */
function room(): Project {
  const p = referenceRoom();
  p.builtIns = [createBuiltIn('b', 'Built-in', 'traditional')];
  return p;
}
const wall = (p: Project, id: string) => p.room.walls.find((w) => w.id === id)!;
const sections = (run: Run) => run.modules.filter((m): m is SectionModule => m.kind === 'section');

describe('wall layouts', () => {
  it('media: equal lit bays either side of a TV section, on 3" stiles', () => {
    const p = room();
    const run = createRun('r', wall(p, 'media'));
    run.modules = layoutModules('media', run, ids());
    expect(run.modules.map((m) => m.kind)).toEqual([
      'stile',
      'section',
      'stile',
      'section',
      'stile',
      'section',
      'stile',
    ]);
    expect(new Set(run.modules.map((m) => m.id)).size).toBe(7);
    const [left, tv, right] = sections(run);
    expect(left).toMatchObject({ name: 'Left bay', width: 'auto', pictureLight: true });
    expect(right).toMatchObject({ name: 'Right bay', width: 'auto', pictureLight: true });
    expect(tv?.upper).toMatchObject({ kind: 'mediaNiche', cubbies: 2 });
    expect(run.modules[0]).toMatchObject({ kind: 'stile', width: inch(3) });
    p.builtIns[0]!.runs = [run];
    expect(compileBuiltIn(p, p.builtIns[0]!).errors).toEqual([]);
  });

  it('fireplace: towers either side of pilasters and the fireplace; open ends get end panels', () => {
    const p = room();
    const run = createRun('r', wall(p, 'fireplace'));
    run.ends.left = 'open';
    run.modules = layoutModules('fireplace', run, ids());
    expect(run.modules.map((m) => m.kind)).toEqual([
      'stile',
      'section',
      'stile',
      'pilaster',
      'obstruction',
      'pilaster',
      'stile',
      'section',
      'stile',
    ]);
    const [left, right] = sections(run);
    expect(left!.endPanels).toEqual({ left: true, right: false });
    expect(right!.endPanels).toEqual({ left: false, right: false });
    expect(run.modules[4]).toMatchObject({ label: 'Fireplace + chimney breast' });
    p.builtIns[0]!.runs = [run];
    expect(compileBuiltIn(p, p.builtIns[0]!).errors).toEqual([]);
  });

  it('bookcases: as many ~33" bays as fit', () => {
    const run = createRun('r', {
      id: 'w',
      name: 'W',
      length: inch(132),
      height: 2400,
      turn: 'right',
    });
    run.modules = layoutModules('bookcases', run, ids());
    expect(sections(run).map((s) => s.name)).toEqual(['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4']);
    run.length = inch(20);
    expect(sections({ ...run, modules: layoutModules('bookcases', run, ids()) })).toMatchObject([
      { name: 'Bay' },
    ]);
  });
});

describe('run ends and offset', () => {
  it("an end open to the room gives the end section a finished end; a wall or corner doesn't", () => {
    const run = createRun('r', wall(room(), 'media'));
    run.modules = layoutModules('media', run, ids());
    setRunEnd(run, 'right', 'open');
    expect(sections(run).at(-1)!.endPanels.right).toBe(true);
    setRunEnd(run, 'right', 'corner');
    expect(run.ends.right).toBe('corner');
    expect(sections(run).at(-1)!.endPanels.right).toBe(false);
  });

  it('an end that is not a section (an opening) is left alone', () => {
    const run = createRun('r', wall(room(), 'media'));
    run.modules = [
      { kind: 'obstruction', id: 'o', label: 'Window', width: 1000, height: 1000, crown: 'stop' },
    ];
    run.ends.left = 'open';
    expect(() => syncEndPanels(run)).not.toThrow();
    run.modules = [];
    expect(() => syncEndPanels(run)).not.toThrow();
  });

  it("moving the start keeps the run's far end, within the wall", () => {
    const run = createRun('r', wall(room(), 'fireplace'));
    setRunOffset(run, inch(156), inch(12));
    expect(run).toMatchObject({ offset: inch(12), length: inch(144) });
    run.length = inch(200); // past the wall
    setRunOffset(run, inch(156), inch(20));
    expect(run.length).toBe(inch(136));
    setRunOffset(run, inch(156), inch(150));
    expect(run.length).toBe(inch(12));
  });

  it('single doors hinge towards the nearer end', () => {
    expect(hingeTowardsEnd(0, 500, 3000)).toBe('left');
    expect(hingeTowardsEnd(2500, 3000, 3000)).toBe('right');
  });
});

describe('fitting a run round a corner', () => {
  it('meets the run on the wall before, leaving a 3" filler each side', () => {
    const p = room();
    const b = p.builtIns[0]!;
    const fire = createRun('f', wall(p, 'fireplace'), inch(12));
    b.runs.push(fire);
    fitRun(p, b, fire);
    expect(fire).toMatchObject({ offset: inch(12), length: inch(144) });
    const media = createRun('m', wall(p, 'media'));
    media.modules = layoutModules('media', media, ids());
    b.runs.push(media);
    fitRun(p, b, media);
    expect(CORNER_FILLER).toBe(inch(3));
    expect(media).toMatchObject({ offset: inch(21), length: inch(138) });
    expect(media.ends).toEqual({ left: 'corner', right: 'wall' });
    expect(fire).toMatchObject({ length: inch(123) });
    expect(fire.ends.right).toBe('corner');
  });

  it('meets the run on the wall after, when that one was added first', () => {
    const p = room();
    const b = p.builtIns[0]!;
    const media = createRun('m', wall(p, 'media'));
    b.runs.push(media);
    const fire = createRun('f', wall(p, 'fireplace'), inch(12));
    fire.ends.left = 'open';
    fire.modules = layoutModules('fireplace', fire, ids());
    b.runs.push(fire);
    fitRun(p, b, fire);
    expect(fire).toMatchObject({ offset: inch(12), length: inch(123) });
    expect(fire.ends).toEqual({ left: 'open', right: 'corner' });
    expect(media).toMatchObject({ offset: inch(21), length: inch(138) });
    expect(media.ends.left).toBe('corner');
    expect(compileBuiltIn(p, b).errors).toEqual([]);
  });

  it("doesn't meet a run that stops short of the corner, or round an outside corner", () => {
    const p = room();
    const b = p.builtIns[0]!;
    const fire = createRun('f', wall(p, 'fireplace'));
    fire.length = inch(60);
    b.runs.push(fire);
    const media = createRun('m', wall(p, 'media'));
    b.runs.push(media);
    fitRun(p, b, media);
    expect(media).toMatchObject({ offset: 0, ends: { left: 'wall', right: 'wall' } });

    fire.length = inch(156);
    wall(p, 'media').turn = 'left';
    fitRun(p, b, media);
    expect(media.ends.left).toBe('wall');
  });

  it('a run on a missing wall is left as it is', () => {
    const p = room();
    const run = { ...createRun('x', wall(p, 'media')), wallId: 'gone' };
    fitRun(p, p.builtIns[0]!, run);
    expect(run.offset).toBe(0);
  });
});
