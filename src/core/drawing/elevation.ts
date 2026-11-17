import { box } from '../geometry';
import type { Cabinet, UnitSettings } from '../model';
import type { CabinetModel, PartRole } from '../parts';
import { formatLength, type Mm } from '../units';
import type { Drawing, Fill, Primitive } from './primitives';

const FILL: Partial<Record<PartRole, Fill>> = {
  platformRail: 'kick',
  platformCrossMember: 'kick',
  ffStile: 'frame',
  ffRail: 'frame',
  ffMullion: 'frame',
  slabFront: 'front',
  blindPanel: 'front',
  frontStile: 'front',
  frontRail: 'front',
  frontPanel: 'panel',
  filler: 'frame',
  endPanel: 'front',
  endPanelFrame: 'front',
  shelfNosing: 'frame',
  countertopEdge: 'frame',
  frieze: 'frame',
};

/** Dimension line spacing outside the cabinet, as a fraction of its larger side. */
const GAP = 0.06;

/**
 * Front elevation: every part seen from the front (painted back to front), overall width and
 * height, and a chain of opening heights on the right. Opening heights are front heights for
 * frameless cabinets and opening heights for face frames: the sizes the face tree is edited in.
 *
 * An L-shaped cabinet is drawn twice, side by side: from the front of its run, and from the
 * front of its return (as seen from the next wall).
 */
export function frontElevation(
  cabinet: Cabinet,
  model: CabinetModel,
  units: UnitSettings,
): Drawing {
  const prims = partRects(model, 0, 0);
  const xs = model.parts.flatMap((p) => [p.bounds.min.x, p.bounds.max.x]);
  const x0 = Math.min(0, ...xs);
  let x1 = Math.max(cabinet.width, ...xs);
  const H = cabinet.height;
  const gap = Math.max(cabinet.width + (cabinet.corner?.returnWidth ?? 0), H) * GAP;
  const label = (v: Mm) => formatLength(v, units);
  const textSize = Math.max(cabinet.width + (cabinet.corner?.returnWidth ?? 0), H) * 0.035;

  // Overall width below, overall height on the left.
  prims.push(...dimension([0, 0], [cabinet.width, 0], [0, -gap], label(cabinet.width)));
  prims.push(...dimension([0, 0], [0, H], [-gap, 0], label(H)));
  let top = H + textSize * 0.5;
  if (cabinet.corner) {
    const turned = returnView(model, cabinet.width);
    const dx = x1 + gap * 2;
    const ends = turned.parts.map((p) => p.bounds.max.x);
    const w = cabinet.corner.returnWidth;
    prims.push(...partRects(turned, dx, 0));
    prims.push(...dimension([dx, 0], [dx + w, 0], [0, -gap], label(w)));
    const caption = (x: Mm, text: string): Primitive => ({
      kind: 'text',
      x,
      y: H + textSize * 0.6,
      text,
      anchor: 'middle',
      rotate: 0,
    });
    prims.push(caption(cabinet.width / 2, 'Run'), caption(dx + w / 2, 'Return'));
    top = H + textSize * 2;
    x1 = dx + Math.max(w, ...ends);
  }

  // Opening heights on the right: the cells along the right-hand edge of the face.
  const right = Math.max(...model.openings.map((o) => o.rect.x1));
  const chain = model.openings
    .filter((o) => Math.abs(o.rect.x1 - right) < 1e-6)
    .sort((a, b) => b.rect.y1 - a.rect.y1);
  for (const o of chain) {
    prims.push(
      ...dimension([x1, o.rect.y0], [x1, o.rect.y1], [gap, 0], label(o.rect.y1 - o.rect.y0)),
    );
  }

  // Labels sit 1.3 × gap out from the object; leave room for the longest one (≈0.6 em per char).
  const labelRoom = (texts: string[]) =>
    Math.max(0, ...texts.map((t) => t.length)) * textSize * 0.6;
  const rightLabels = chain.map((o) => label(o.rect.y1 - o.rect.y0));
  const out = gap * 1.3;
  return {
    primitives: prims,
    textSize,
    bounds: {
      x0: x0 - out - textSize,
      y0: -out - textSize,
      x1: x1 + out + labelRoom(rightLabels) + textSize * 0.5,
      y1: top,
    },
  };
}

/**
 * An L-shaped cabinet as seen from the wall its return stands on: along that wall is the
 * cabinet's z (from the corner), and out from it is the run's width − x.
 */
export function returnView(model: CabinetModel, width: Mm): CabinetModel {
  return {
    ...model,
    parts: model.parts.map((p) => {
      const b = p.bounds;
      return {
        ...p,
        bounds: box(b.min.z, b.max.z, b.min.y, b.max.y, width - b.max.x, width - b.min.x),
      };
    }),
    handles: model.handles.map((h) => {
      const b = h.bounds;
      return {
        ...h,
        bounds: box(b.min.z, b.max.z, b.min.y, b.max.y, width - b.max.x, width - b.min.x),
        // Handles project along z, or x on the return: the quarter turn swaps the two.
        axis: h.axis === 'x' ? ('z' as const) : ('x' as const),
      };
    }),
  };
}

/**
 * Every part seen from the front, painted back to front, then the knobs and pulls facing this
 * way, shifted by (dx, dy).
 */
export function partRects(model: CabinetModel, dx: Mm, dy: Mm): Primitive[] {
  const parts = [...model.parts]
    .sort((a, b) => a.bounds.max.z - b.bounds.max.z)
    .map((p): Primitive => ({
      kind: 'rect',
      x: p.bounds.min.x + dx,
      y: p.bounds.min.y + dy,
      w: p.bounds.max.x - p.bounds.min.x,
      h: p.bounds.max.y - p.bounds.min.y,
      fill: FILL[p.role] ?? 'carcass',
    }));
  const handles = model.handles
    .filter((h) => h.axis === 'z')
    .map((h): Primitive => {
      const b = h.bounds;
      return h.kind === 'knob'
        ? {
            kind: 'circle',
            x: (b.min.x + b.max.x) / 2 + dx,
            y: (b.min.y + b.max.y) / 2 + dy,
            r: (b.max.x - b.min.x) / 2,
            fill: 'hardware',
          }
        : {
            kind: 'rect',
            x: b.min.x + dx,
            y: b.min.y + dy,
            w: b.max.x - b.min.x,
            h: b.max.y - b.min.y,
            fill: 'hardware',
          };
    });
  return [...parts, ...handles];
}

/**
 * A dimension from `a` to `b`, drawn offset by `off`: extension lines from the object, the
 * dimension line with end ticks, and the label centred alongside.
 */
export function dimension(a: [Mm, Mm], b: [Mm, Mm], off: [Mm, Mm], text: string): Primitive[] {
  const [ox, oy] = off;
  const len = Math.hypot(ox, oy);
  const [ux, uy] = [ox / len, oy / len];
  const a2: [Mm, Mm] = [a[0] + ox, a[1] + oy];
  const b2: [Mm, Mm] = [b[0] + ox, b[1] + oy];
  const tick = len * 0.25;
  const vertical = Math.abs(a[0] - b[0]) < 1e-9;
  const mid: [Mm, Mm] = [
    (a2[0] + b2[0]) / 2 + ux * tick * 1.2,
    (a2[1] + b2[1]) / 2 + uy * tick * 1.2,
  ];
  return [
    {
      kind: 'line',
      x1: a[0] + ux * tick * 0.3,
      y1: a[1] + uy * tick * 0.3,
      x2: a2[0] + ux * tick,
      y2: a2[1] + uy * tick,
      style: 'extension',
    },
    {
      kind: 'line',
      x1: b[0] + ux * tick * 0.3,
      y1: b[1] + uy * tick * 0.3,
      x2: b2[0] + ux * tick,
      y2: b2[1] + uy * tick,
      style: 'extension',
    },
    { kind: 'line', x1: a2[0], y1: a2[1], x2: b2[0], y2: b2[1], style: 'dimension' },
    {
      kind: 'text',
      x: mid[0],
      y: mid[1],
      text,
      anchor: vertical ? (ux > 0 ? 'start' : 'middle') : 'middle',
      rotate: vertical && ux < 0 ? 90 : 0,
    },
  ];
}
