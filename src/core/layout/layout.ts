/**
 * Room layout: where walls are, where cabinets and fillers sit on them, and the checks and
 * snapping that keep a run tidy.
 *
 * Plan coordinates are (x, z) with y up, matching the 3D scene. Wall 1 starts at the origin and
 * runs along +x. Walking along the walls, cabinets are on the right: their backs are on the
 * wall line and their fronts face along the wall's `normal`.
 */
import { box } from '../geometry';
import { cabinetConstruction, type Cabinet, type Filler, type Project, type Wall } from '../model';

type Room = Project['room'];
import type { CabinetModel, Part } from '../parts';
import { quantize, type Mm } from '../units';

export type Vec2 = [Mm, Mm];

export interface WallFrame {
  wall: Wall;
  index: number;
  start: Vec2;
  end: Vec2;
  dir: Vec2;
  /** Into the room: the direction cabinet fronts face. */
  normal: Vec2;
  /** Whether the corner at each end is inside (cabinets meet) or outside. */
  startCorner: 'inside' | 'outside' | null;
  endCorner: 'inside' | 'outside' | null;
}

const cw = ([x, z]: Vec2): Vec2 => [-z || 0, x];
const ccw = ([x, z]: Vec2): Vec2 => [z, -x || 0];

export function wallFrames(room: Room): WallFrame[] {
  const frames: WallFrame[] = [];
  let start: Vec2 = [0, 0];
  let dir: Vec2 = [1, 0];
  room.walls.forEach((wall, index) => {
    if (index > 0) dir = wall.turn === 'right' ? cw(dir) : ccw(dir);
    const end: Vec2 = [
      quantize(start[0] + dir[0] * wall.length),
      quantize(start[1] + dir[1] * wall.length),
    ];
    const corner = wall.turn === 'right' ? 'inside' : 'outside';
    frames.push({
      wall,
      index,
      start,
      end,
      dir,
      normal: cw(dir),
      startCorner: index > 0 ? corner : null,
      endCorner: null,
    });
    const prev = frames[index - 1];
    if (prev) prev.endCorner = corner;
    start = end;
  });
  return frames;
}

export interface Transform {
  position: [Mm, Mm, Mm];
  /** Radians about +y; maps local +x onto the wall direction. */
  rotationY: number;
}

/** Local (cabinet) coordinates → world. Unplaced items sit along +x from the origin. */
export function placementTransform(
  frame: WallFrame | undefined,
  offset: Mm,
  elevation: Mm,
): Transform {
  const start = frame?.start ?? [0, 0];
  const dir = frame?.dir ?? [1, 0];
  return {
    position: [start[0] + dir[0] * offset, elevation, start[1] + dir[1] * offset],
    rotationY: Math.atan2(-dir[1], dir[0]),
  };
}

/** Something on a wall: a cabinet or a filler, measured in its own local coordinates. */
export interface LayoutItem {
  kind: 'cabinet' | 'filler';
  id: string;
  name: string;
  wallId: string | null;
  offset: Mm;
  elevation: Mm;
  /** Local extents: x from the left edge (end panels make x0 negative), z from the wall. */
  x0: Mm;
  x1: Mm;
  depth: Mm;
  height: Mm;
  /** An L-shaped cabinet: it sits in a corner, so it is not dragged along its wall. */
  inCorner?: true;
  /** An L-shaped cabinet's return, on the wall after the cabinet's own: the same cabinet seen
   * from that wall. */
  isReturn?: true;
  /** Placed by something else (a built-in's run, ADR-040), so not dragged on its own. */
  locked?: true;
}

/** The wall after `frame`, when they meet at an inside corner: where an L-shaped cabinet turns. */
export function returnWall(frame: WallFrame, frames: WallFrame[]): WallFrame | undefined {
  return frame.endCorner === 'inside' ? frames[frame.index + 1] : undefined;
}

/**
 * Where a cabinet's left edge is along its wall. An L-shaped cabinet always sits in the corner
 * at the end of its wall, so its offset follows the wall's length (ADR-037).
 */
export function placedOffset(cabinet: Cabinet, frames: WallFrame[]): Mm {
  const frame = frames.find((f) => f.wall.id === cabinet.placement.wallId);
  if (!cabinet.corner || !frame) return cabinet.placement.offset;
  return quantize(frame.wall.length - cabinet.width);
}

/**
 * Every cabinet (sized from its generated parts when it builds) and filler. An L-shaped
 * cabinet is an item on its own wall (the run) and, at an inside corner, one on the next wall
 * (the return).
 */
export function layoutItems(
  project: Project,
  models: ReadonlyMap<string, CabinetModel | null>,
): LayoutItem[] {
  const frames = wallFrames(project.room);
  const cabinets = project.cabinets.flatMap((c): LayoutItem[] => {
    const all = models.get(c.id)?.parts ?? [];
    const parts = all.filter((p) => p.wing !== 'return');
    const xs = parts.flatMap((p) => [p.bounds.min.x, p.bounds.max.x]);
    const item: LayoutItem = {
      kind: 'cabinet',
      id: c.id,
      name: c.name,
      wallId: c.placement.wallId,
      offset: placedOffset(c, frames),
      elevation: c.placement.elevation,
      x0: Math.min(0, ...xs),
      x1: Math.max(c.width, ...xs),
      depth: Math.max(c.depth, ...parts.map((p) => p.bounds.max.z)),
      height: c.height,
      ...(c.corner && { inCorner: true as const }),
    };
    const frame = frames.find((f) => f.wall.id === c.placement.wallId);
    const next = frame && returnWall(frame, frames);
    if (!c.corner || !next) return [item];
    // Seen from the next wall: along it is the cabinet's z, out from it is width − x.
    const turned = all.filter((p) => p.wing === 'return');
    return [
      item,
      {
        ...item,
        wallId: next.wall.id,
        offset: 0,
        x0: 0,
        x1: Math.max(c.corner.returnWidth, ...turned.map((p) => p.bounds.max.z)),
        depth: Math.max(c.corner.returnDepth, ...turned.map((p) => c.width - p.bounds.min.x)),
        isReturn: true,
      },
    ];
  });
  const fillers = project.fillers.map((f): LayoutItem => ({
    kind: 'filler',
    id: f.id,
    name: 'Filler',
    wallId: f.wallId,
    offset: f.offset,
    elevation: f.elevation,
    x0: 0,
    x1: f.width,
    depth: f.depth,
    height: f.height,
  }));
  return [...cabinets, ...fillers];
}

/** Plan footprint of an item as an axis-aligned rectangle (walls meet at 90°). */
export function footprint(
  item: LayoutItem,
  frames: WallFrame[],
): { x0: Mm; z0: Mm; x1: Mm; z1: Mm } {
  const f = frames.find((w) => w.wall.id === item.wallId);
  const start = f?.start ?? [0, 0];
  const dir = f?.dir ?? [1, 0];
  const n = f?.normal ?? [0, 1];
  const corners: Vec2[] = (
    [
      [item.x0, 0],
      [item.x1, 0],
      [item.x0, item.depth],
      [item.x1, item.depth],
    ] as const
  ).map(([x, z]) => {
    const along = item.offset + x;
    return [start[0] + dir[0] * along + n[0] * z, start[1] + dir[1] * along + n[1] * z];
  });
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

const EPS = 0.01;
const verticalOverlap = (a: LayoutItem, b: LayoutItem) =>
  Math.min(a.elevation + a.height, b.elevation + b.height) - Math.max(a.elevation, b.elevation) >
  EPS;

export interface LayoutIssue {
  ids: string[];
  message: string;
}

/** Items that run past a wall end, and items that collide (in plan, at overlapping heights). */
export function layoutIssues(project: Project, items: LayoutItem[]): LayoutIssue[] {
  const frames = wallFrames(project.room);
  const issues: LayoutIssue[] = [];
  for (const c of project.cabinets) {
    const f = frames.find((w) => w.wall.id === c.placement.wallId);
    if (c.corner && f && !returnWall(f, frames)) {
      issues.push({
        ids: [c.id],
        message: `${c.name} needs an inside corner at the end of ${f.wall.name}.`,
      });
    }
  }
  for (const it of items) {
    const f = frames.find((w) => w.wall.id === it.wallId);
    if (!f) continue;
    if (it.offset + it.x0 < -EPS || it.offset + it.x1 > f.wall.length + EPS) {
      issues.push({ ids: [it.id], message: `${it.name} runs past the end of ${f.wall.name}.` });
    }
  }
  // An L-shaped cabinet's run and return can both hit the same neighbour: report it once.
  const reported = new Set<string>();
  for (const [i, a] of items.entries()) {
    for (const b of items.slice(i + 1)) {
      // An L-shaped cabinet's run and return share the corner.
      if (a.id === b.id || !verticalOverlap(a, b)) continue;
      const fa = footprint(a, frames);
      const fb = footprint(b, frames);
      const w = Math.min(fa.x1, fb.x1) - Math.max(fa.x0, fb.x0);
      const d = Math.min(fa.z1, fb.z1) - Math.max(fa.z0, fb.z0);
      const pair = [a.id, b.id].sort().join('|');
      if (w > EPS && d > EPS && !reported.has(pair)) {
        reported.add(pair);
        issues.push({ ids: [a.id, b.id], message: `${a.name} overlaps ${b.name}.` });
      }
    }
  }
  return issues;
}

/**
 * Space taken at each end of a wall by the run on the adjoining wall: at an inside corner,
 * items on the other wall that reach into this wall's corner zone occupy their depth.
 */
function cornerClearance(
  item: LayoutItem,
  frame: WallFrame,
  frames: WallFrame[],
  items: LayoutItem[],
) {
  const clear = (other: WallFrame | undefined, atEnd: boolean) => {
    if (!other) return 0;
    const reach = item.depth;
    return Math.max(
      0,
      ...items
        .filter((o) => o.id !== item.id && o.wallId === other.wall.id && verticalOverlap(o, item))
        .filter((o) =>
          atEnd ? o.offset + o.x0 < reach : o.offset + o.x1 > other.wall.length - reach,
        )
        .map((o) => o.depth),
    );
  };
  const prev = frame.startCorner === 'inside' ? frames[frame.index - 1] : undefined;
  const next = frame.endCorner === 'inside' ? frames[frame.index + 1] : undefined;
  return { start: clear(prev, false), end: clear(next, true) };
}

/** Where the item's left edge may go: wall ends (after corner runs) and its neighbours. */
function edges(item: LayoutItem, wallId: string, project: Project, items: LayoutItem[]): Mm[] {
  const frames = wallFrames(project.room);
  const frame = frames.find((w) => w.wall.id === wallId);
  if (!frame) return [];
  const width = item.x1 - item.x0;
  const { start, end } = cornerClearance(item, frame, frames, items);
  const out = [start, frame.wall.length - end - width];
  for (const o of items) {
    if (o.id === item.id || o.wallId !== wallId || !verticalOverlap(o, item)) continue;
    out.push(o.offset + o.x1, o.offset + o.x0 - width);
  }
  return out;
}

/**
 * Snap a proposed offset (of the item's left edge, end panels included) to the nearest wall end
 * or neighbour within `tolerance`. Returns the offset to store.
 */
export function snapOffset(
  item: LayoutItem,
  wallId: string,
  proposed: Mm,
  project: Project,
  items: LayoutItem[],
  tolerance: Mm,
): Mm {
  const left = proposed + item.x0;
  let best = left;
  let bestDist = tolerance;
  for (const e of edges(item, wallId, project, items)) {
    const d = Math.abs(e - left);
    if (d <= bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return quantize(best - item.x0);
}

/** First offset after everything at the item's height on a wall (after any corner run). */
export function nextFreeOffset(
  item: LayoutItem,
  wallId: string,
  project: Project,
  items: LayoutItem[],
): Mm {
  const frames = wallFrames(project.room);
  const frame = frames.find((w) => w.wall.id === wallId);
  if (!frame) return 0;
  const { start } = cornerClearance(item, frame, frames, items);
  const ends = items
    .filter((o) => o.id !== item.id && o.wallId === wallId && verticalOverlap(o, item))
    .map((o) => o.offset + o.x1);
  return quantize(Math.max(start, ...ends) - item.x0);
}

/** Empty space beside an item on its wall, to its nearest neighbour or the wall end. */
export function gapsBeside(
  item: LayoutItem,
  project: Project,
  items: LayoutItem[],
): { left: Mm; right: Mm } | null {
  const frames = wallFrames(project.room);
  const frame = frames.find((w) => w.wall.id === item.wallId);
  if (!frame) return null;
  const { start, end } = cornerClearance(item, frame, frames, items);
  const others = items.filter(
    (o) => o.id !== item.id && o.wallId === item.wallId && verticalOverlap(o, item),
  );
  const l = item.offset + item.x0;
  const r = item.offset + item.x1;
  const leftEdge = Math.max(
    start,
    ...others.map((o) => o.offset + o.x1).filter((x) => x <= l + EPS),
  );
  const rightEdge = Math.min(
    frame.wall.length - end,
    ...others.map((o) => o.offset + o.x0).filter((x) => x >= r - EPS),
  );
  return { left: quantize(Math.max(0, l - leftEdge)), right: quantize(Math.max(0, rightEdge - r)) };
}

/**
 * The single part a filler is cut as: door material (frameless) or face-frame stock, with its
 * front face at the filler's depth.
 */
export function fillerPart(filler: Filler, project: Project): Part {
  const c = cabinetConstruction(project, { styleId: filler.styleId, construction: {} });
  const role = c.carcass.style === 'frameless' ? 'door' : 'faceFrame';
  const id = c.materials[role];
  const m = [...project.materials.sheets, ...project.materials.solids].find((x) => x.id === id);
  const t = m?.thickness ?? 18;
  const grain = m ? !('grain' in m) || m.grain : true;
  const size = { length: filler.height, width: filler.width, thickness: t };
  return {
    id: `${filler.id}/filler`,
    cabinetId: filler.id,
    role: 'filler',
    name: filler.name ?? 'Filler',
    materialRole: role,
    materialId: id,
    bounds: box(0, filler.width, 0, filler.height, filler.depth - t, filler.depth),
    lengthAxis: 'y',
    thicknessAxis: 'z',
    finished: size,
    cut: size,
    grain,
    edges: { long1: null, long2: null, end1: null, end2: null },
    notes: filler.name === undefined ? ['Scribe to fit on site.'] : [],
  };
}

/** Plan bounds of the room's walls. */
export function roomBounds(room: Room): { x0: Mm; z0: Mm; x1: Mm; z1: Mm } {
  const pts = wallFrames(room).flatMap((f) => [f.start, f.end]);
  if (pts.length === 0) return { x0: 0, z0: 0, x1: 0, z1: 0 };
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    z0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    z1: Math.max(...pts.map((p) => p[1])),
  };
}
