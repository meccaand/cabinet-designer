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
  // A flush plinth (no setback, front at the face) needs no notch.
  const notchDepth = quantize(face - (f.D - ctx.c.platform.setback));
  const notch =
    f.traits.platform && notchDepth > 0
      ? { height: ctx.c.platform.height, depth: notchDepth }
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
  if (ctx.c.endPanel.style === 'framed') {
    // The frame goes on the face away from the box. (An L-shaped cabinet's return panel is its
    // right end but sits at the low-x end of the return's own coordinates.)
    const outward = x0 < 0 ? 'low' : 'high';
    const xFace = outward === 'low' ? x0 : x0 + te;
    addEndFrame(ctx, side, outward, xFace, f.H, face, notch?.depth ? notch.height : 0);
  }
}

/** Framed end panels add this much to the panel's thickness. */
export function endPanelThickness(ctx: Pick<BuildContext, 'c' | 'thickness'>): number {
  const ep = ctx.c.endPanel;
  return ctx.thickness('door') + (ep.style === 'framed' ? ep.frameThickness : 0);
}

/**
 * A recessed-panel look (ADR-041): thin solid stiles and rails glued over the outside of the
 * end panel, butt-jointed, so the panel between them reads as a recessed field. `xFace` is the
 * panel's outside face; the frame stands proud of it. Above any toe-kick notch.
 */
function addEndFrame(
  ctx: BuildContext,
  side: 'L' | 'R',
  outward: 'low' | 'high',
  xFace: number,
  H: number,
  face: number,
  y0: number,
): void {
  const { frameWidth: fw, frameThickness: ft } = ctx.c.endPanel;
  const [xa, xb] = outward === 'low' ? [xFace - ft, xFace] : [xFace, xFace + ft];
  const min = ctx.c.shaker.minPanel;
  if (face - 2 * fw < min || H - y0 - 2 * fw < min) {
    ctx.warnings.push(
      `${side === 'L' ? 'Left' : 'Right'} end panel: too small for its applied frame, so it is left flat.`,
    );
    return;
  }
  const strip = (sub: string, name: string, b: [number, number, number, number], rail: boolean) =>
    ctx.add({
      id: `endPanel/${side}/frame/${sub}`,
      role: 'endPanelFrame',
      name,
      materialRole: 'faceFrame',
      bounds: box(xa, xb, b[0], b[1], b[2], b[3]),
      lengthAxis: rail ? 'z' : 'y',
      thicknessAxis: 'x',
      notes: ['Plane or resaw to the listed thickness; glue and pin over the end panel.'],
    });
  strip('stile/back', 'End frame stile', [y0, H, 0, fw], false);
  strip('stile/front', 'End frame stile', [y0, H, face - fw, face], false);
  strip('rail/top', 'End frame rail', [H - fw, H, fw, face - fw], true);
  strip('rail/bottom', 'End frame rail', [y0, y0 + fw, fw, face - fw], true);
}
