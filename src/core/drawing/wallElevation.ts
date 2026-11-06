import { fillerPart, layoutItems, wallFrames, type LayoutItem } from '../layout';
import type { Project } from '../model';
import type { CabinetModel } from '../parts';
import { formatLength, type Mm } from '../units';
import { dimension, partRects, returnView } from './elevation';
import type { Drawing, Primitive } from './primitives';

/**
 * Elevation of one wall as seen from the room: the wall, each cabinet and filler on it, and
 * chained dimensions of item widths and the gaps between them: floor items (starting in the
 * bottom third of the wall) below the floor line, raised items (wall cabinets) above.
 */
export function wallElevation(
  project: Project,
  wallId: string,
  models: ReadonlyMap<string, CabinetModel | null>,
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

  const chain = (level: LayoutItem[], y: Mm, dir: 1 | -1) => {
    const spans = level
      .map((i) => [i.offset + i.x0, i.offset + i.x1] as const)
      .sort((a, b) => a[0] - b[0]);
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

  const out = gap * 1.3 + textSize;
  return {
    primitives: prims,
    textSize,
    bounds: { x0: -out - textSize, y0: -out, x1: wall.length + textSize, y1: wall.height + out },
  };
}
