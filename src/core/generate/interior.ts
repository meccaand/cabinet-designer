/** Dividers, drawer boxes (with face-frame slide spacers) and shelves. */
import { box } from '../geometry';
import type { Part } from '../parts';
import { quantize, type Mm } from '../units';
import { check, type CarcassFrame } from './carcass';
import { BuildError, type BuildContext } from './context';
import type { FaceLayout, LeafCell } from './face';

/** A horizontal run of interior between two vertical panels (sides or dividers). */
export interface Bay {
  x0: Mm;
  x1: Mm;
  left: Part;
  right: Part;
}

export function buildDividers(ctx: BuildContext, f: CarcassFrame, layout: FaceLayout): Bay[] {
  const bays: Bay[] = [];
  let x0 = f.t;
  let left = f.sides.left;
  const frameless = ctx.c.carcass.style === 'frameless';
  layout.dividers.forEach((xc, i) => {
    const y0 = f.bottomTop - (f.midJoint ? f.engage : 0);
    const topHoused = f.top !== null && f.midJoint !== null;
    const y1 = f.topUnderside + (topHoused ? f.engage : 0);
    const divider = ctx.add({
      id: `divider/${i}`,
      role: 'divider',
      name: 'Divider',
      materialRole: 'carcass',
      bounds: box(xc - f.t / 2, xc + f.t / 2, y0, y1, f.zBackInner, f.Dbox),
      lengthAxis: 'y',
      thicknessAxis: 'x',
      ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
    });
    if (f.midJoint) ctx.joint(f.bottom, divider, 'dado', 'y', f.engage);
    if (topHoused && f.top) ctx.joint(f.top, divider, 'dado', 'y', f.engage);
    bays.push({ x0, x1: divider.bounds.min.x, left, right: divider });
    x0 = divider.bounds.max.x;
    left = divider;
  });
  bays.push({ x0, x1: f.W - f.t, left, right: f.sides.right });
  for (const b of bays) check(b.x1 - b.x0 > 0, 'Dividers leave a bay with no width.');
  return bays;
}

function bayFor(bays: Bay[], cell: LeafCell): Bay {
  const xc = (cell.rect.x0 + cell.rect.x1) / 2;
  const bay = bays.find((b) => xc >= b.x0 && xc <= b.x1);
  if (!bay) throw new BuildError(`Opening ${cell.path} is too narrow for the divider beside it.`);
  return bay;
}

/** Vertical extent of a cell that lies inside the box (between bottom and top/stretchers). */
function interiorSpan(f: CarcassFrame, cell: LeafCell): { y0: Mm; y1: Mm } {
  return {
    y0: Math.max(cell.rect.y0, f.bottomTop),
    y1: Math.min(cell.rect.y1, f.topUnderside),
  };
}

/**
 * Drawer boxes for side-mount slides: box width = mounting width − 2 × slide clearance,
 * height = opening − deduction (centred), length = the longest standard slide that fits.
 */
export function buildDrawers(
  ctx: BuildContext,
  f: CarcassFrame,
  layout: FaceLayout,
  bays: Bay[],
  zFrontInner: Mm,
): Mm[] {
  const d = ctx.c.drawer;
  const frameless = ctx.c.carcass.style === 'frameless';
  const slides: Mm[] = [];
  const available = zFrontInner - f.zBackInner - d.rearClearance;
  const td = ctx.thickness('drawerBox');
  const tb = ctx.thickness('drawerBottom');

  for (const cell of layout.leaves) {
    if (cell.leaf.fill !== 'drawer') continue;
    const where = `Drawer ${cell.path || ''}`.trim();
    if (cell.columns) {
      check(
        frameless,
        `${where}: side-by-side drawers in face-frame cabinets aren't supported yet.`,
      );
      check(cell.columns.divided, `${where}: side-by-side drawers need a divider between them.`);
    }
    const bay = bayFor(bays, cell);
    // Slides mount on the bay walls; in a face frame they are packed out to the opening edges.
    const mountL = frameless ? bay.x0 : Math.max(bay.x0, cell.rect.x0);
    const mountR = frameless ? bay.x1 : Math.min(bay.x1, cell.rect.x1);
    const span = interiorSpan(f, cell);

    const bx0 = mountL + d.sideClearance;
    const bx1 = mountR - d.sideClearance;
    const by0 = span.y0 + d.heightDeduction / 2;
    const by1 = span.y1 - d.heightDeduction / 2;
    check(bx1 - bx0 > 2 * td, `${where}: opening is too narrow for a drawer box.`);
    check(by1 - by0 > 0, `${where}: opening is too short for a drawer box.`);

    const fitting = d.slideLengths.filter((len) => len <= available + 1e-6);
    check(
      fitting.length > 0,
      `${where}: no slide length fits the ${available.toFixed(0)} mm of depth.`,
    );
    const L = Math.max(...fitting);
    const bz1 = zFrontInner;
    const bz0 = zFrontInner - L;
    slides.push(L);

    const id = `drawer/${cell.path || 'root'}`;
    const side = (sfx: 'L' | 'R', x0: Mm, x1: Mm) =>
      ctx.add({
        id: `${id}/side/${sfx}`,
        role: 'drawerSide',
        name: 'Drawer side',
        materialRole: 'drawerBox',
        bounds: box(x0, x1, by0, by1, bz0, bz1),
        lengthAxis: 'z',
        thicknessAxis: 'x',
      });
    const end = (sfx: 'front' | 'back', z0: Mm, z1: Mm) =>
      ctx.add({
        id: `${id}/${sfx}`,
        role: 'drawerEnd',
        name: sfx === 'front' ? 'Drawer box front' : 'Drawer box back',
        materialRole: 'drawerBox',
        bounds: box(bx0 + td, bx1 - td, by0, by1, z0, z1),
        lengthAxis: 'x',
        thicknessAxis: 'z',
      });
    const sideL = side('L', bx0, bx0 + td);
    const sideR = side('R', bx1 - td, bx1);
    const endF = end('front', bz1 - td, bz1);
    const endB = end('back', bz0, bz0 + td);

    const e = d.bottomGrooveDepth - d.bottomClearance / 2;
    check(e > 0 && e < td, `${where}: bottom groove must be shallower than the box sides.`);
    const yb = by0 + d.bottomGrooveHeight;
    check(yb + tb < by1, `${where}: box is too short for its bottom groove.`);
    const bottom = ctx.add({
      id: `${id}/bottom`,
      role: 'drawerBottom',
      name: 'Drawer bottom',
      materialRole: 'drawerBottom',
      bounds: box(bx0 + td - e, bx1 - td + e, yb, yb + tb, bz0 + td - e, bz1 - td + e),
      lengthAxis: 'x',
      thicknessAxis: 'y',
    });
    ctx.joint(sideL, bottom, 'groove', 'x', e);
    ctx.joint(sideR, bottom, 'groove', 'x', e);
    ctx.joint(endF, bottom, 'groove', 'z', e);
    ctx.joint(endB, bottom, 'groove', 'z', e);

    // Face frame: spacer strips fill the gap between carcass side and opening edge.
    const stockThickness = ctx.thickness('faceFrame');
    const h = Math.min(d.spacerWidth, by1 - by0);
    const ym = (by0 + by1) / 2;
    const spacer = (sfx: 'L' | 'R', x0: Mm, x1: Mm) => {
      const thick = quantize(x1 - x0);
      if (thick <= 0) return;
      ctx.add({
        id: `${id}/spacer/${sfx}`,
        role: 'slideSpacer',
        name: 'Slide spacer',
        materialRole: 'faceFrame',
        bounds: box(x0, x1, ym - h / 2, ym + h / 2, bz0, bz1),
        lengthAxis: 'z',
        thicknessAxis: 'x',
        notes: [
          thick > stockThickness
            ? 'Thicker than the face-frame stock: glue up two layers or add a shim.'
            : 'Plane to the listed thickness.',
        ],
      });
    };
    if (!frameless) {
      spacer('L', bay.x0, mountL);
      spacer('R', mountR, bay.x1);
    }
  }
  return slides;
}

/**
 * Shelves behind door and open leaves. Leaves sharing a bay and vertical span (e.g. two doors
 * side by side without a divider) share one set of shelves. Returns the adjustable count.
 */
export function buildShelves(
  ctx: BuildContext,
  f: CarcassFrame,
  layout: FaceLayout,
  bays: Bay[],
  zFrontInner: Mm,
): number {
  const s = ctx.c.shelves;
  const ts = ctx.thickness('shelf');
  const groups = new Map<
    string,
    { bay: Bay; y0: Mm; y1: Mm; count: number; adjustable: boolean; path: string }
  >();

  for (const cell of layout.leaves) {
    const shelves = cell.leaf.shelves;
    if (!shelves || shelves.count === 0) continue;
    check(
      cell.leaf.fill !== 'drawer' && cell.leaf.fill !== 'falseFront',
      `Opening ${cell.path}: shelves go behind doors or in open openings, not behind drawer or false fronts.`,
    );
    const bay = bayFor(bays, cell);
    const { y0, y1 } = interiorSpan(f, cell);
    const key = `${bays.indexOf(bay)}:${y0}:${y1}`;
    const prev = groups.get(key);
    if (!prev || shelves.count > prev.count) {
      groups.set(key, {
        bay,
        y0,
        y1,
        count: shelves.count,
        adjustable: shelves.adjustable,
        path: cell.path,
      });
    }
  }

  let adjustable = 0;
  for (const g of groups.values()) {
    const pitch = (g.y1 - g.y0) / (g.count + 1);
    check(pitch > ts, `Opening ${g.path}: too many shelves for the height.`);
    for (let i = 1; i <= g.count; i++) {
      const yc = g.y0 + pitch * i;
      const id = `shelf/${g.path || 'root'}/${i}`;
      if (g.adjustable) {
        adjustable++;
        ctx.add({
          id,
          role: 'shelfAdjustable',
          name: 'Adjustable shelf',
          materialRole: 'shelf',
          bounds: box(
            g.bay.x0 + s.widthClearance / 2,
            g.bay.x1 - s.widthClearance / 2,
            yc - ts / 2,
            yc + ts / 2,
            f.zBackInner,
            zFrontInner - s.depthSetback,
          ),
          lengthAxis: 'x',
          thicknessAxis: 'y',
          banding: { role: 'carcassBanding', edges: ['long1'] },
        });
      } else {
        const e = f.midJoint ? f.engage : 0;
        const shelf = ctx.add({
          id,
          role: 'shelfFixed',
          name: 'Fixed shelf',
          materialRole: 'shelf',
          bounds: box(
            g.bay.x0 - e,
            g.bay.x1 + e,
            yc - ts / 2,
            yc + ts / 2,
            f.zBackInner,
            zFrontInner,
          ),
          lengthAxis: 'x',
          thicknessAxis: 'y',
          banding: { role: 'carcassBanding', edges: ['long1'] },
        });
        if (f.midJoint) {
          ctx.joint(g.bay.left, shelf, 'dado', 'x', e);
          ctx.joint(g.bay.right, shelf, 'dado', 'x', e);
        }
      }
    }
  }
  return adjustable;
}
