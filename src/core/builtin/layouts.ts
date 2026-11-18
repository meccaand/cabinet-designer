/**
 * Quick-add for built-ins (ADR-043): whole-wall layouts in the traditional painted style, and the
 * bookkeeping that makes a new run meet its neighbours round a corner without measuring.
 * Callers supply ids (core has no randomness, ADR-001). The helpers that change a run mutate
 * it in place, for use on an immer draft.
 */
import { wallFrames } from '../layout';
import {
  createModule,
  type BuiltIn,
  type Project,
  type Run,
  type RunModule,
  type SectionModule,
} from '../model';
import { inch, quantize, type Mm } from '../units';
import { CORNER_FILLER, cornerAt, cornerGap, endSection, MIN_RUN, NEW_CORNER } from './corners';
/** Bookcase bays aim for about this much per bay, stile included. */
const BAY_PITCH = inch(33);

export type RunLayout = 'media' | 'fireplace' | 'bookcases';

export const RUN_LAYOUTS: { id: RunLayout; name: string }[] = [
  { id: 'media', name: 'Media wall: bay, TV niche, bay' },
  { id: 'fireplace', name: 'Fireplace wall: tower, fireplace, tower' },
  { id: 'bookcases', name: 'Bookcases: open bays over doors' },
];

/**
 * The modules for a whole wall, sized to the run: sections are auto-width, so they share what
 * the fixed modules leave. Sections at an end open to the room get a finished end panel.
 *
 * - **Media:** 3" stiles; two equal bays with picture lights either side of a 66" TV section
 *   (two door pairs, a niche for a 65" TV, a bridge of two cubbies).
 * - **Fireplace:** 2 1/4" stiles; a tower either side of a 60" × 54" fireplace, each with a
 *   picture light, and a 6" pilaster between each tower and the fireplace.
 * - **Bookcases:** 3" stiles; as many equal bays (doors below, shelves above) as fit at about
 *   33" each, with picture lights.
 */
export function layoutModules(layout: RunLayout, run: Run, newId: () => string): RunModule[] {
  const stile = (w: number): RunModule => ({ kind: 'stile', id: newId(), width: inch(w) });
  const bay = (name: string, over: Partial<SectionModule> = {}): SectionModule => ({
    ...(createModule(newId(), 'section', name) as SectionModule),
    pictureLight: true,
    ...over,
  });
  let modules: RunModule[];
  switch (layout) {
    case 'media':
      modules = [
        stile(3),
        bay('Left bay'),
        stile(3),
        createModule(newId(), 'tvSection'),
        stile(3),
        bay('Right bay'),
        stile(3),
      ];
      break;
    case 'fireplace': {
      const pilaster = () => createModule(newId(), 'pilaster');
      modules = [
        stile(2.25),
        bay('Left tower'),
        stile(2.25),
        pilaster(),
        createModule(newId(), 'obstruction', 'Fireplace + chimney breast'),
        pilaster(),
        stile(2.25),
        bay('Right tower'),
        stile(2.25),
      ];
      break;
    }
    case 'bookcases': {
      const n = Math.max(1, Math.round(run.length / BAY_PITCH));
      modules = [stile(3)];
      for (let i = 1; i <= n; i++) modules.push(bay(n === 1 ? 'Bay' : `Bay ${i}`), stile(3));
      break;
    }
  }
  syncEndPanels({ ...run, modules });
  return modules;
}

/** End sections get a finished end panel where the run meets the room, and none elsewhere
 * (an end panel can't go in a corner). Mutates. */
export function syncEndPanels(run: Run, sides: readonly ('left' | 'right')[] = ['left', 'right']) {
  for (const side of sides) {
    const s = endSection(run.modules, side);
    if (s) s.endPanels[side] = run.ends[side] === 'open';
  }
}

/** Sets what a run's end meets, and its end section's end panel with it. Mutates. */
export function setRunEnd(run: Run, side: 'left' | 'right', end: Run['ends']['left']) {
  run.ends[side] = end;
  syncEndPanels(run, [side]);
}

/** Moves a run's start along its wall, keeping its far end where it was (within the wall).
 * Mutates. */
export function setRunOffset(run: Run, wallLength: Mm, offset: Mm) {
  const end = run.offset + run.length;
  run.offset = offset;
  run.length = quantize(Math.max(MIN_RUN, Math.min(end, wallLength) - offset));
}

/**
 * Fits a new run of `builtIn` to its wall. Where the wall meets a wall with one of the
 * built-in's runs round an inside corner, and that run reaches the corner, the two are set to
 * meet, and the corner gets a blind base and wrap-around shelves (ADR-044) unless it already
 * has a treatment. The owner of a blind base runs up to the other run's face; a run that
 * doesn't stops a 3" filler short (ADR-042). Elsewhere the run fills its wall. Mutates `run`,
 * the runs it meets and the built-in's corners.
 */
export function fitRun(project: Project, builtIn: BuiltIn, run: Run) {
  const frames = wallFrames(project.room);
  const i = frames.findIndex((fr) => fr.wall.id === run.wallId);
  const frame = frames[i];
  if (!frame) return;
  const others = builtIn.runs.filter((r) => r.id !== run.id);
  /** Within this of the corner, a run on the other wall is taken to reach it. */
  const zone = (r: Run) => r.baseDepth + CORNER_FILLER;
  const corner = (wallId: string) => {
    if (!builtIn.corners.some((c) => c.wallId === wallId)) {
      builtIn.corners.push({ wallId, ...NEW_CORNER });
    }
    return cornerAt(builtIn, wallId);
  };

  let start = run.offset;
  let end = Math.min(frame.wall.length, run.offset + run.length);

  const prev = frame.startCorner === 'inside' ? frames[i - 1] : undefined;
  const before = prev
    ? others
        .filter((r) => r.wallId === prev.wall.id)
        .find(
          (r) =>
            r.ends.right === 'corner' || r.offset + r.length > prev.wall.length - zone(run) + 1e-6,
        )
    : undefined;
  if (prev && before) {
    const c = corner(run.wallId);
    run.ends.left = 'corner';
    start = Math.max(start, before.baseDepth + cornerGap(c, 'left'));
    before.length = quantize(
      Math.max(
        MIN_RUN,
        Math.min(
          before.length,
          prev.wall.length - before.offset - run.baseDepth - cornerGap(c, 'right'),
        ),
      ),
    );
    setRunEnd(before, 'right', 'corner');
  }

  const next = frame.endCorner === 'inside' ? frames[i + 1] : undefined;
  const after = next
    ? others
        .filter((r) => r.wallId === next.wall.id)
        .find((r) => r.ends.left === 'corner' || r.offset < zone(run) - 1e-6)
    : undefined;
  if (next && after) {
    const c = corner(next.wall.id);
    run.ends.right = 'corner';
    end = Math.min(end, frame.wall.length - after.baseDepth - cornerGap(c, 'right'));
    const afterEnd = after.offset + after.length;
    after.offset = Math.max(after.offset, run.baseDepth + cornerGap(c, 'left'));
    after.length = quantize(Math.max(MIN_RUN, afterEnd - after.offset));
    setRunEnd(after, 'left', 'corner');
  }

  run.offset = quantize(start);
  run.length = quantize(Math.max(MIN_RUN, end - start));
  syncEndPanels(run);
}

/**
 * Moves every run of `source` (and its corner settings) into `target`, removes `source`, and
 * fits the moved runs, so runs on neighbouring walls meet round the corner (ADR-044). `target`'s
 * style, top line and trim apply to them from now on. Mutates the project.
 */
export function joinBuiltIns(project: Project, target: BuiltIn, source: BuiltIn) {
  if (target === source) return;
  const moved = source.runs;
  target.runs.push(...moved);
  for (const c of source.corners) {
    if (!target.corners.some((t) => t.wallId === c.wallId)) target.corners.push(c);
  }
  project.builtIns.splice(project.builtIns.indexOf(source), 1);
  for (const r of moved) fitRun(project, target, r);
}

/** The hinge side for a single door: towards the nearer end of the run, so the door opens
 * against the wall or corner and leaves the room side clear. */
export function hingeTowardsEnd(x0: Mm, x1: Mm, runEnd: Mm): 'left' | 'right' {
  return (x0 + x1) / 2 < runEnd / 2 ? 'left' : 'right';
}
