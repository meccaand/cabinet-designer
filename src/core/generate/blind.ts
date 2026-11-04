/**
 * Blind corner cabinets. The blind part of the face is hidden behind the run that meets this
 * cabinet at the corner. Frameless: a blind panel in door material covers it. Face frame: a
 * wide blind-side stile covers it. A pull filler strip stands out from the face at the edge of
 * the doors, so the meeting run's doors and pulls clear this cabinet's.
 */
import { box, type Rect } from '../geometry';
import type { Cabinet } from '../model';
import type { Mm } from '../units';
import { check, type CarcassFrame } from './carcass';
import type { BuildContext } from './context';

export interface BlindPlan {
  side: 'left' | 'right';
  /** x where the blind portion ends and the doors begin (cabinet coordinates). */
  boundary: Mm;
  fillerWidth: Mm;
}

export function blindPlan(cabinet: Cabinet, f: CarcassFrame): BlindPlan | null {
  if (!f.traits.blind || !cabinet.blind) return null;
  const { side, blindWidth, pullFillerWidth } = cabinet.blind;
  check(
    blindWidth > f.t && blindWidth < f.W - f.t,
    'Blind width must leave room for a door opening.',
  );
  return {
    side,
    boundary: side === 'left' ? blindWidth : f.W - blindWidth,
    fillerWidth: pullFillerWidth,
  };
}

/** Frameless blind panel over `rect`, plus the pull filler next to the open zone `zone`. */
export function buildBlindParts(
  ctx: BuildContext,
  f: CarcassFrame,
  plan: BlindPlan,
  panel: Rect | null,
  zone: Rect,
): void {
  const fc = ctx.c.fronts;
  const frameless = ctx.c.carcass.style === 'frameless';
  const inset = fc.mount === 'inset';
  const td = ctx.thickness('door');
  let face = f.D;

  if (panel) {
    check(panel.x1 - panel.x0 > 0, 'Blind width is too small for a blind panel.');
    const z0 = inset ? f.D - td : f.D;
    ctx.add({
      id: 'blindPanel',
      role: 'blindPanel',
      name: 'Blind panel',
      materialRole: 'door',
      bounds: box(panel.x0, panel.x1, panel.y0, panel.y1, z0, z0 + td),
      lengthAxis: 'y',
      thicknessAxis: 'z',
      banding: { role: 'frontBanding', edges: ['long1', 'long2', 'end1', 'end2'] },
    });
    face = Math.max(face, z0 + td);
  }

  if (plan.fillerWidth <= 0) return;
  // Edge of the nearest door: overlay face-frame doors lap onto the stile; inset doors sit in.
  const grow = inset ? -fc.insetGap : frameless ? 0 : fc.faceFrameOverlay;
  const material = frameless ? 'door' : 'faceFrame';
  const tf = ctx.thickness(material);
  const [x0, x1] =
    plan.side === 'left'
      ? [zone.x0 - grow - fc.revealBetween - tf, zone.x0 - grow - fc.revealBetween]
      : [zone.x1 + grow + fc.revealBetween, zone.x1 + grow + fc.revealBetween + tf];
  const [y0, y1] = frameless ? [zone.y0, zone.y1] : [f.y0, f.y1];
  ctx.add({
    id: 'filler',
    role: 'filler',
    name: 'Pull filler',
    materialRole: material,
    bounds: box(x0, x1, y0, y1, face, face + plan.fillerWidth),
    lengthAxis: 'y',
    thicknessAxis: 'x',
    notes: ['Fastened where the corner run meets this cabinet; trim to fit on site.'],
  });
}
