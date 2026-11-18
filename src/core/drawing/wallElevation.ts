import { mouldingBoxes, type Assembly, type Obstruction } from '../builtin';
import { fillerPart, layoutItems, wallFrames, type LayoutItem } from '../layout';
import type { Project } from '../model';
import type { CabinetModel } from '../parts';
import { formatLength, type Mm } from '../units';
import { dimension, partRects, returnView } from './elevation';
import type { Drawing, Primitive } from './primitives';

/**
 * Elevation of one wall as seen from the room: the wall, each cabinet and filler on it, and
 * chained dimensions of item widths and the gaps between them: floor items (starting in the
 * bottom third of the wall) below the floor line, raised items (wall cabinets) above. Where
 * items stand over one another, the lowest is dimensioned.
 * A built-in's run adds a second tier below with each section's clear opening and each
 * pilaster and opening, and its heights (countertop, top line, ceiling) up the right side.
 */
export function wallElevation(
  project: Project,
  wallId: string,
  models: ReadonlyMap<string, CabinetModel | null>,
  /** From expanded built-ins (ADR-040): run parts such as countertops, and obstructions. */
  extras: { assemblies?: readonly Assembly[]; obstructions?: readonly Obstruction[] } = {},
): Drawing {
  const wall = wallFrames(project.room).find((f) => f.wall.id === wallId)?.wall;
  if (!wall) return { primitives: [], textSize: 100, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
  const items = layoutItems(project, models).filter((i) => i.wallId === wallId);
  const label = (v: Mm) => formatLength(v, project.units);
  const textSize = Math.max(wall.length, wall.height) * 0.022;
  const gap = textSize * 2.2;

  const prims: Primitive[] = [
    { kind: 'rect', x: 0, y: 0, w: wall.length, h: wall.height, fill: 'wall' },
  ];
  for (const o of extras.obstructions ?? []) {
    if (o.wallId !== wallId) continue;
    prims.push(
      { kind: 'rect', x: o.offset, y: 0, w: o.width, h: o.height, fill: 'obstruction' },
      {
        kind: 'text',
        x: o.offset + o.width / 2,
        y: o.height / 2,
        text: o.label,
        anchor: 'middle',
        rotate: 0,
        onFill: true,
      },
    );
  }
  for (const item of [...items].sort((a, b) => a.depth - b.depth)) {
    if (item.kind === 'cabinet') {
      const model = models.get(item.id);
      const cabinet = project.cabinets.find((c) => c.id === item.id);
      // An L-shaped cabinet's return is the whole cabinet seen from this wall.
      const shown = model && cabinet && item.isReturn ? returnView(model, cabinet.width) : model;
      if (shown) prims.push(...partRects(shown, item.offset, item.elevation));
    } else {
      const filler = project.fillers.find((f) => f.id === item.id);
      if (filler) {
        const b = fillerPart(filler, project).bounds;
        prims.push({
          kind: 'rect',
          x: item.offset,
          y: item.elevation,
          w: b.max.x - b.min.x,
          h: b.max.y - b.min.y,
          fill: 'frame',
        });
      }
    }
  }

  // Run parts (countertops, frieze, corner fillers) in front of the boxes they sit on, then
  // the mouldings and picture lights on them.
  for (const a of extras.assemblies ?? []) {
    if (a.wallId !== wallId) continue;
    prims.push(...partRects(a.model, a.offset, 0));
    for (const m of a.mouldings) {
      const b = mouldingBoxes(m)[0];
      if (!b) continue;
      prims.push({
        kind: 'rect',
        x: a.offset + b.min.x,
        y: b.min.y,
        w: b.max.x - b.min.x,
        h: b.max.y - b.min.y,
        fill: 'moulding',
      });
    }
    for (const l of a.lights) {
      prims.push({
        kind: 'rect',
        x: a.offset + l.min.x,
        y: l.min.y,
        w: l.max.x - l.min.x,
        h: l.max.y - l.min.y,
        fill: 'hardware',
      });
    }
  }

  const chain = (level: LayoutItem[], y: Mm, dir: 1 | -1) => {
    // Lowest items first; one standing over another (a built-in's upper on its base, or a
    // wrap-around corner wider than the box below it) isn't dimensioned again.
    const kept: (readonly [Mm, Mm])[] = [];
    for (const i of [...level].sort((a, b) => a.elevation - b.elevation || a.offset - b.offset)) {
      const s = [i.offset + i.x0, i.offset + i.x1] as const;
      if (!kept.some(([a, b]) => Math.min(b, s[1]) - Math.max(a, s[0]) > 0.5)) kept.push(s);
    }
    const spans = kept.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const out: Primitive[] = [];
    for (const [a, b] of [...spans, [wall.length, wall.length] as const]) {
      if (a - cursor > 0.5)
        out.push(...dimension([cursor, y], [a, y], [0, dir * gap], label(a - cursor)));
      if (b - a > 0.5) out.push(...dimension([a, y], [b, y], [0, dir * gap], label(b - a)));
      cursor = Math.max(cursor, b);
    }
    return out;
  };
  // Floor items start at or near the floor (fillers sit on the toe kick); raised items are wall
  // cabinets and the like.
  const floorItem = (i: LayoutItem) => i.elevation < wall.height / 3;
  const low = items.filter(floorItem);
  const high = items.filter((i) => !floorItem(i));
  prims.push(...chain(low, 0, -1), ...chain(high, wall.height, 1));
  prims.push(...dimension([0, 0], [0, wall.height], [-gap, 0], label(wall.height)));

  // Built-in runs: openings on a second tier, and the datums.
  const runs = (extras.assemblies ?? []).filter((a) => a.wallId === wallId);
  for (const a of runs) {
    for (const sp of a.guide.spans) {
      const [x0, x1] = [a.offset + sp.x0, a.offset + sp.x1];
      prims.push(...dimension([x0, 0], [x1, 0], [0, -2 * gap], label(sp.x1 - sp.x0)));
    }
  }
  const levels = [
    ...new Set([0, ...runs.flatMap((a) => [a.guide.countertop, a.guide.topLine]), wall.height]),
  ].sort((a, b) => a - b);
  if (runs.length) {
    levels.slice(1).forEach((y, i) => {
      const y0 = levels[i] ?? 0;
      prims.push(...dimension([wall.length, y0], [wall.length, y], [gap, 0], label(y - y0)));
    });
  }

  const out = gap * 1.3 + textSize;
  const below = runs.length ? out + gap : out;
  const right = runs.length ? out + textSize * 3 : textSize;
  return {
    primitives: prims,
    textSize,
    bounds: { x0: -out - textSize, y0: -below, x1: wall.length + right, y1: wall.height + out },
  };
}
