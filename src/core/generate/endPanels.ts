/**
 * Finished end panels: applied over an exposed cabinet side, in door material. They run from
 * the floor (or the cabinet bottom, for wall cabinets) to the top, and from the wall to the
 * face of the doors, so they finish flush with the fronts. On floor cabinets the toe kick is
 * notched out of the bottom front corner.
 */
import { box } from '../geometry';
import type { PartRole } from '../parts';
import { quantize } from '../units';
import type { CarcassFrame } from './carcass';
import type { BuildContext } from './context';

const FRONT_ROLES: readonly PartRole[] = ['slabFront', 'frontStile', 'frontRail', 'blindPanel'];

export function buildEndPanels(ctx: BuildContext, f: CarcassFrame): void {
  const { left, right } = ctx.cabinet.endPanels;
  if (!left && !right) return;
  const te = ctx.thickness('door');
  const oh = ctx.c.carcass.style === 'faceFrame' ? ctx.c.faceFrame.sideOverhang : 0;
  const face = Math.max(
    f.D,
    ...ctx.parts.filter((p) => FRONT_ROLES.includes(p.role)).map((p) => p.bounds.max.z),
  );
  if (left) addEndPanel(ctx, f, 'L', -oh - te, face);
  if (right) addEndPanel(ctx, f, 'R', f.W + oh, face);
}

/**
 * One end panel with its outside face at x0 (inside face at x0 + thickness), from the wall to
 * `face`. Toe kick: notched from the floor up to the box, and from the face back to the
 * platform front.
 */
export function addEndPanel(
  ctx: BuildContext,
  f: Pick<CarcassFrame, 'D' | 'H' | 'traits'>,
  side: 'L' | 'R',
  x0: number,
  face: number,
): void {
  const te = ctx.thickness('door');
  const notch = f.traits.platform
    ? { height: ctx.c.platform.height, depth: quantize(face - (f.D - ctx.c.platform.setback)) }
    : undefined;
  ctx.add({
    id: `endPanel/${side}`,
    role: 'endPanel',
    name: side === 'L' ? 'Left end panel' : 'Right end panel',
    materialRole: 'door',
    bounds: box(x0, x0 + te, 0, f.H, 0, face),
    lengthAxis: 'y',
    thicknessAxis: 'x',
    banding: { role: 'frontBanding', edges: ['long1', 'end1'] },
    ...(notch && { notch }),
  });
}
