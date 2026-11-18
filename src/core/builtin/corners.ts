/**
 * Corner treatments between two runs of a built-in (ADR-044). A corner is keyed by the later
 * wall (the corner is at its start); with no entry it is the dead corner of ADR-042.
 *
 * - **Base, blind:** the owning run's end box carries on into the corner, to the wall, behind
 *   the other run. Its face is a wide blind stile out to the other run's face; the other run
 *   keeps its corner filler, which is the blind corner's pull filler.
 * - **Upper, wrap:** the two end bays become one L of open shelves through the corner (an
 *   L-shaped open shelving cabinet, ADR-037), owned by the earlier wall's run.
 */
import { wallFrames } from '../layout';
import type { BuiltIn, Project, Run, RunCorner, RunModule, SectionModule } from '../model';
import { inch, quantize } from '../units';

/** Dead-corner filler a fitted run leaves at an inside corner (ADR-042 asks for at least 2"). */
export const CORNER_FILLER = inch(3);
/** Shortest run the fitting will leave. */
export const MIN_RUN = inch(12);

export type CornerSettings = Omit<RunCorner, 'wallId'>;

/** A corner nothing has been chosen for (projects before ADR-044, the spec's reference room). */
export const DEAD_CORNER: CornerSettings = { base: 'dead', upper: 'dead', owner: 'earlier' };
/** What a corner made by fitting a new run gets. */
export const NEW_CORNER: CornerSettings = { base: 'blind', upper: 'wrap', owner: 'earlier' };

/** The corner at the start of `wallId`. */
export function cornerAt(builtIn: BuiltIn, wallId: string): CornerSettings {
  return builtIn.corners.find((c) => c.wallId === wallId) ?? DEAD_CORNER;
}

/** Whether the run whose `side` end is at the corner owns its blind base box. The earlier
 * wall's run meets the corner with its right end. */
export function ownsBlindBase(corner: CornerSettings, side: 'left' | 'right'): boolean {
  return corner.base === 'blind' && (corner.owner === 'earlier') === (side === 'right');
}

/** How far a run's `side` end stops short of the other run's face: none for the owner of a
 * blind base, a filler otherwise. */
export function cornerGap(corner: CornerSettings, side: 'left' | 'right') {
  return ownsBlindBase(corner, side) ? 0 : CORNER_FILLER;
}

/** The section at a run's end, if nothing but stiles lies between it and the end. */
export function endSection(
  modules: readonly RunModule[],
  side: 'left' | 'right',
): SectionModule | undefined {
  const ordered = side === 'left' ? modules : [...modules].reverse();
  const first = ordered.find((m) => m.kind !== 'stile');
  return first?.kind === 'section' ? first : undefined;
}

/** The two runs that meet at the corner at the start of `wallId`, if both are set to meet. */
export function cornerRuns(
  project: Project,
  builtIn: BuiltIn,
  wallId: string,
): { earlier: Run; later: Run } | null {
  const frames = wallFrames(project.room);
  const i = frames.findIndex((f) => f.wall.id === wallId);
  const prev = frames[i - 1];
  if (!prev || frames[i]?.startCorner !== 'inside') return null;
  const earlier = builtIn.runs.find((r) => r.wallId === prev.wall.id && r.ends.right === 'corner');
  const later = builtIn.runs.find((r) => r.wallId === wallId && r.ends.left === 'corner');
  return earlier && later ? { earlier, later } : null;
}

/**
 * Sets how the corner at the start of `wallId` is built. When the base treatment or its owner
 * changes, the two runs are refitted: the owner of a blind base runs up to the other run's
 * face, and a run that doesn't own one stops a filler short. Mutates.
 */
export function setCorner(
  project: Project,
  builtIn: BuiltIn,
  wallId: string,
  patch: Partial<CornerSettings>,
) {
  const before = cornerAt(builtIn, wallId);
  const next = { ...before, ...patch };
  const i = builtIn.corners.findIndex((c) => c.wallId === wallId);
  if (i >= 0) builtIn.corners[i] = { wallId, ...next };
  else builtIn.corners.push({ wallId, ...next });
  const same = (side: 'left' | 'right') =>
    ownsBlindBase(before, side) === ownsBlindBase(next, side);
  if (same('left') && same('right')) return;
  const runs = cornerRuns(project, builtIn, wallId);
  const wall = project.room.walls.find((w) => w.id === runs?.earlier.wallId);
  if (!runs || !wall) return;
  const { earlier, later } = runs;
  earlier.length = quantize(
    Math.max(MIN_RUN, wall.length - earlier.offset - later.baseDepth - cornerGap(next, 'right')),
  );
  const end = later.offset + later.length;
  later.offset = quantize(earlier.baseDepth + cornerGap(next, 'left'));
  later.length = quantize(Math.max(MIN_RUN, end - later.offset));
}
