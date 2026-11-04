/** Face frame, doors and drawer fronts. */
import { box, type Axis } from '../geometry';
import type { FrontSummary } from '../parts';
import { quantize, type Mm } from '../units';
import type { CarcassFrame } from './carcass';
import type { BuildContext } from './context';
import type { FaceLayout, LeafCell, Rect } from './face';

/** Face-frame outer stiles and rails, plus the rails/mullions between openings. */
export function buildFaceFrame(ctx: BuildContext, f: CarcassFrame, layout: FaceLayout): void {
  const { stileWidth: sw, railWidth: rw, sideOverhang: oh } = ctx.c.faceFrame;
  const x0 = -oh;
  const x1 = f.W + oh;
  const member = (id: string, name: string, role: 'ffStile' | 'ffRail' | 'ffMullion', r: Rect) =>
    ctx.add({
      id,
      role,
      name,
      materialRole: 'faceFrame',
      bounds: box(r.x0, r.x1, r.y0, r.y1, f.Dbox, f.D),
      lengthAxis: role === 'ffRail' ? 'x' : 'y',
      thicknessAxis: 'z',
    });
  member('ff/stile/L', 'Face frame stile', 'ffStile', { x0, x1: x0 + sw, y0: f.y0, y1: f.y1 });
  member('ff/stile/R', 'Face frame stile', 'ffStile', { x0: x1 - sw, x1, y0: f.y0, y1: f.y1 });
  member('ff/rail/top', 'Face frame top rail', 'ffRail', {
    x0: x0 + sw,
    x1: x1 - sw,
    y0: f.y1 - rw,
    y1: f.y1,
  });
  member('ff/rail/bottom', 'Face frame bottom rail', 'ffRail', {
    x0: x0 + sw,
    x1: x1 - sw,
    y0: f.y0,
    y1: f.y0 + rw,
  });
  for (const m of layout.members) {
    if (m.kind === 'rail') member(`ff/rail/${m.path}`, 'Face frame rail', 'ffRail', m.rect);
    else member(`ff/mullion/${m.path}`, 'Face frame mullion', 'ffMullion', m.rect);
  }
}

export interface FrontsResult {
  fronts: FrontSummary[];
  /** Back face of the frontmost obstruction inside the box: drawers and shelves stop here. */
  zFrontInner: Mm;
}

/** Doors, drawer fronts and false fronts for every leaf of the face layout. */
export function buildFronts(ctx: BuildContext, f: CarcassFrame, layout: FaceLayout): FrontsResult {
  const { fronts: fc, carcass } = ctx.c;
  const frameless = carcass.style === 'frameless';
  const inset = fc.mount === 'inset';
  const pairGap = inset ? 2 * fc.insetGap : fc.revealBetween;
  const summaries: FrontSummary[] = [];
  let zFrontInner = f.Dbox;

  const frontRect = (r: Rect): Rect => {
    // Frameless overlay cells are the fronts; inset fronts sit inside their cell or opening;
    // face-frame overlay fronts cover their opening plus the overlay all round.
    const grow = inset ? -fc.insetGap : frameless ? 0 : fc.faceFrameOverlay;
    return { x0: r.x0 - grow, x1: r.x1 + grow, y0: r.y0 - grow, y1: r.y1 + grow };
  };

  for (const cell of layout.leaves) {
    const { fill } = cell.leaf;
    if (fill === 'open') continue;
    const kind = fill === 'drawer' ? 'drawer' : fill === 'falseFront' ? 'falseFront' : 'door';
    const r = frontRect(cell.rect);
    const rects: [string, Rect][] =
      fill === 'doorPair'
        ? [
            ['L', { ...r, x1: quantize((r.x0 + r.x1 - pairGap) / 2) }],
            ['R', { ...r, x0: quantize((r.x0 + r.x1 + pairGap) / 2) }],
          ]
        : [['', r]];
    for (const [suffix, fr] of rects) {
      const thickness = buildFront(ctx, f, cell, kind, suffix, fr, inset);
      if (inset) zFrontInner = Math.min(zFrontInner, quantize(f.D - thickness));
      summaries.push({ kind, width: quantize(fr.x1 - fr.x0), height: quantize(fr.y1 - fr.y0) });
    }
  }
  return { fronts: summaries, zFrontInner };
}

const FRONT_NAMES = { door: 'Door', drawer: 'Drawer front', falseFront: 'False front' } as const;

/** One front: slab, or a 5-piece shaker (butt-jointed frame, panel in a groove). Returns thickness. */
function buildFront(
  ctx: BuildContext,
  f: CarcassFrame,
  cell: LeafCell,
  kind: FrontSummary['kind'],
  suffix: string,
  r: Rect,
  inset: boolean,
): Mm {
  const sh = ctx.c.shaker;
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const id = `front/${cell.path || 'root'}${suffix ? `/${suffix}` : ''}`;
  const name = FRONT_NAMES[kind] + (suffix ? ` (${suffix})` : '');
  // Doors: vertical grain. Drawer and false fronts: grain runs across.
  const grainAxis: Axis = kind === 'door' ? 'y' : 'x';
  const panelTooSmall = w - 2 * sh.stileWidth < sh.minPanel || h - 2 * sh.railWidth < sh.minPanel;
  const shaker = ctx.c.fronts.style === 'shaker' && !panelTooSmall;

  const thickness = ctx.thickness(shaker ? 'frontFrame' : 'door');
  const z0 = inset ? f.D - thickness : f.D;
  const z1 = z0 + thickness;

  if (!shaker) {
    ctx.add({
      id,
      role: 'slabFront',
      name,
      materialRole: 'door',
      bounds: box(r.x0, r.x1, r.y0, r.y1, z0, z1),
      lengthAxis: grainAxis,
      thicknessAxis: 'z',
      banding: { role: 'frontBanding', edges: ['long1', 'long2', 'end1', 'end2'] },
      ...(ctx.c.fronts.style === 'shaker' && {
        notes: ['Made slab: a shaker panel would be smaller than the minimum panel size.'],
      }),
    });
    return thickness;
  }

  const { stileWidth: ssw, railWidth: srw } = sh;
  const engage = sh.grooveDepth - sh.panelClearance / 2;
  const frame = (sub: string, role: 'frontStile' | 'frontRail', nm: string, b: Rect) =>
    ctx.add({
      id: `${id}/${sub}`,
      role,
      name: `${name} ${nm}`,
      materialRole: 'frontFrame',
      bounds: box(b.x0, b.x1, b.y0, b.y1, z0, z1),
      lengthAxis: role === 'frontStile' ? 'y' : 'x',
      thicknessAxis: 'z',
    });
  const stileL = frame('stile/L', 'frontStile', 'stile', { ...r, x1: r.x0 + ssw });
  const stileR = frame('stile/R', 'frontStile', 'stile', { ...r, x0: r.x1 - ssw });
  const railT = frame('rail/top', 'frontRail', 'rail', {
    x0: r.x0 + ssw,
    x1: r.x1 - ssw,
    y0: r.y1 - srw,
    y1: r.y1,
  });
  const railB = frame('rail/bottom', 'frontRail', 'rail', {
    x0: r.x0 + ssw,
    x1: r.x1 - ssw,
    y0: r.y0,
    y1: r.y0 + srw,
  });

  const pt = ctx.thickness('frontPanel');
  const zc = (z0 + z1) / 2;
  const panel = ctx.add({
    id: `${id}/panel`,
    role: 'frontPanel',
    name: `${name} panel`,
    materialRole: 'frontPanel',
    bounds: box(
      r.x0 + ssw - engage,
      r.x1 - ssw + engage,
      r.y0 + srw - engage,
      r.y1 - srw + engage,
      zc - pt / 2,
      zc + pt / 2,
    ),
    lengthAxis: grainAxis,
    thicknessAxis: 'z',
  });
  ctx.joint(stileL, panel, 'groove', 'x', engage);
  ctx.joint(stileR, panel, 'groove', 'x', engage);
  ctx.joint(railT, panel, 'groove', 'y', engage);
  ctx.joint(railB, panel, 'groove', 'y', engage);
  return thickness;
}
