/** Where pulls and knobs go on a front (ADR-039). Drawn only; counted in the hardware list. */
import { box } from '../geometry';
import { handlesPerFront } from '../hardware';
import type { FrontSummary } from '../parts';
import { inch, quantize, type Mm } from '../units';
import type { BuildContext } from './context';
import type { Rect } from './face';

/** Doors centred higher than this off the floor are opened from below: handle near the bottom. */
export const HIGH_DOOR = inch(48);
/** How far a handle stands off the front (display only). */
const KNOB_PROJECTION = inch(1);
const PULL_PROJECTION = inch(1.125);
const PULL_BAR = inch(3 / 8);

export interface BuiltFront {
  /** The front's first part: the slab, or the shaker's left stile. */
  partId: string;
  thickness: Mm;
  /** Shaker stile width, or null for a slab. */
  stile: Mm | null;
}

/**
 * Handles for one front, in the current wing's coordinates, on the face at `zFace`.
 *
 * - Doors: one, on the opening (latch) side. Across it: centred on a shaker stile, or
 *   `handleFromEdge` in from a slab's edge. Up and down: `handleFromEnd` below the top, or above
 *   the bottom for a door centred over 48" off the floor (wall cabinets, a tall cabinet's upper
 *   doors).
 * - Drawers: centred, or two at the quarter points when wider than `twoPullsOver`. Pulls on
 *   drawers run across; on doors they run up and down.
 */
export function addHandles(
  ctx: BuildContext,
  summary: FrontSummary,
  front: BuiltFront,
  r: Rect,
  zFace: Mm,
  latch: 'left' | 'right',
): void {
  const hw = ctx.c.hardware;
  const count = handlesPerFront(summary, ctx.c);
  if (count === 0) return;
  const w = r.x1 - r.x0;
  let points: [Mm, Mm][];
  if (summary.kind === 'door') {
    const fromEdge = front.stile !== null ? front.stile / 2 : hw.handleFromEdge;
    const x = latch === 'right' ? r.x1 - fromEdge : r.x0 + fromEdge;
    const centre = ctx.cabinet.placement.elevation + (r.y0 + r.y1) / 2;
    const y = centre > HIGH_DOOR ? r.y0 + hw.handleFromEnd : r.y1 - hw.handleFromEnd;
    points = [[x, y]];
  } else {
    const y = (r.y0 + r.y1) / 2;
    points =
      count === 1
        ? [[(r.x0 + r.x1) / 2, y]]
        : [
            [r.x0 + w / 4, y],
            [r.x1 - w / 4, y],
          ];
  }
  const knob = hw.handle === 'knob';
  const along = summary.kind === 'door' ? 'y' : 'x';
  for (const [x, y] of points) {
    const half = (axis: 'x' | 'y') =>
      knob ? hw.knobDiameter / 2 : axis === along ? hw.pullLength / 2 : PULL_BAR / 2;
    ctx.addHandle({
      frontId: front.partId,
      kind: hw.handle,
      bounds: box(
        quantize(x - half('x')),
        quantize(x + half('x')),
        quantize(y - half('y')),
        quantize(y + half('y')),
        zFace,
        quantize(zFace + (knob ? KNOB_PROJECTION : PULL_PROJECTION)),
      ),
      axis: 'z',
    });
  }
}
