import { describe, expect, it } from 'vitest';
import { createCabinet, generateCabinet } from '../generate';
import { createProject, type Project, type Wall } from '../model';
import { wallElevation } from '../drawing';
import type { CabinetModel } from '../parts';
import { inch } from '../units';
import {
  fillerPart,
  footprint,
  gapsBeside,
  layoutIssues,
  layoutItems,
  nextFreeOffset,
  placedOffset,
  placementTransform,
  roomBounds,
  snapOffset,
  wallFrames,
  type LayoutItem,
} from './index';

const wall = (id: string, length: number, turn: Wall['turn'] = 'right'): Wall => ({
  id,
  name: id,
  length: inch(length),
  height: inch(96),
  turn,
});

function project(walls: Wall[]): Project {
  return { ...createProject('p', 'Layout'), room: { walls } };
}

const item = (over: Partial<LayoutItem> & { id: string }): LayoutItem => ({
  kind: 'cabinet',
  name: over.id,
  wallId: 'A',
  offset: 0,
  elevation: 0,
  x0: 0,
  x1: inch(24),
  depth: inch(24.75),
  height: inch(34.5),
  ...over,
});

const L = project([wall('A', 120), wall('B', 96)]);
const U = project([wall('A', 96), wall('B', 120), wall('C', 96)]);

describe('wallFrames', () => {
  it('chains walls with right turns as inside corners', () => {
    const [a, b, c] = wallFrames(U.room);
    expect(a).toMatchObject({
      start: [0, 0],
      dir: [1, 0],
      normal: [0, 1],
      startCorner: null,
      endCorner: 'inside',
    });
    expect(b).toMatchObject({
      start: [inch(96), 0],
      dir: [0, 1],
      normal: [-1, 0],
      startCorner: 'inside',
    });
    expect(c).toMatchObject({
      start: [inch(96), inch(120)],
      dir: [-1, 0],
      normal: [0, -1],
      endCorner: null,
    });
    expect(c!.end).toEqual([0, inch(120)]);
    expect(roomBounds(U.room)).toEqual({ x0: 0, z0: 0, x1: inch(96), z1: inch(120) });
  });

  it('turns the other way at an outside corner', () => {
    const [a, b] = wallFrames(project([wall('A', 60), wall('B', 30, 'left')]).room);
    expect(a!.endCorner).toBe('outside');
    expect(b).toMatchObject({ dir: [0, -1], normal: [1, 0], startCorner: 'outside' });
    expect(roomBounds({ walls: [] })).toEqual({ x0: 0, z0: 0, x1: 0, z1: 0 });
  });
});

describe('placementTransform and footprint', () => {
  const frames = wallFrames(L.room);
  it('places along the wall and turns to face the room', () => {
    expect(placementTransform(frames[0], 100, 0)).toEqual({ position: [100, 0, 0], rotationY: -0 });
    const t = placementTransform(frames[1], 100, inch(54));
    expect(t.position).toEqual([inch(120), inch(54), 100]);
    expect(t.rotationY).toBeCloseTo(-Math.PI / 2, 12);
    expect(placementTransform(undefined, 5, 0).position).toEqual([5, 0, 0]);
  });

  it('turns local extents into plan rectangles on any wall', () => {
    expect(footprint(item({ id: 'a', offset: 100 }), frames)).toEqual({
      x0: 100,
      x1: 100 + inch(24),
      z0: 0,
      z1: inch(24.75),
    });
    const onB = footprint(item({ id: 'b', wallId: 'B', offset: 0, x0: -18 }), frames);
    expect(onB).toEqual({ x0: inch(120) - inch(24.75), x1: inch(120), z0: -18, z1: inch(24) });
  });
});

describe('layoutIssues', () => {
  it('flags runs past a wall end and collisions at the same height only', () => {
    const items = [
      item({ id: 'a', offset: inch(100) }), // 100 + 24 > 120
      item({ id: 'b', offset: inch(90) }), // overlaps a
      item({
        id: 'w',
        offset: inch(90),
        elevation: inch(54),
        height: inch(30),
        depth: inch(12.75),
      }),
      item({ id: 'c', wallId: 'B', offset: 0 }), // in the corner under a
    ];
    expect(layoutIssues(L, items).map((i) => i.message)).toEqual([
      'a runs past the end of A.',
      'a overlaps b.',
      'a overlaps c.',
      'b overlaps c.', // b runs to 114", into c's corner zone (95.25" onward)
    ]);
    expect(layoutIssues(L, [item({ id: 'x', wallId: 'gone' })])).toEqual([]);
  });
});

describe('snapping, free space and gaps', () => {
  const tol = inch(2);

  it('snaps to wall ends and neighbours within tolerance, else keeps the proposal', () => {
    const others = [item({ id: 'n', offset: inch(30) })];
    const me = item({ id: 'me' });
    const snap = (x: number) => snapOffset(me, 'A', inch(x), L, [...others, me], tol) / 25.4;
    expect(snap(1)).toBeCloseTo(0, 9); // wall start
    expect(snap(5.5)).toBeCloseTo(6, 9); // left of the neighbour (30 − 24)
    expect(snap(55)).toBeCloseTo(54, 9); // right of the neighbour
    expect(snap(95)).toBeCloseTo(96, 9); // wall end (120 − 24)
    expect(snap(70)).toBeCloseTo(70, 9); // nothing near
    expect(snapOffset(me, 'missing', 123, L, [me], tol)).toBe(123);
  });

  it('keeps clear of the run on the adjoining wall at an inside corner', () => {
    const corner = item({ id: 'a', offset: inch(96) }); // reaches the A/B corner
    const me = item({ id: 'me', wallId: 'B' });
    const items = [corner, me];
    expect(snapOffset(me, 'B', inch(23), L, items, tol)).toBeCloseTo(inch(24.75), 6);
    expect(nextFreeOffset(me, 'B', L, items)).toBeCloseTo(inch(24.75), 6);
    // A wall cabinet up high isn't blocked by a base cabinet in the corner.
    const high = item({ id: 'hi', wallId: 'B', elevation: inch(54), height: inch(30) });
    expect(nextFreeOffset(high, 'B', L, [corner, high])).toBe(0);
    // And the base run on A must stop short of a cabinet already at the start of B.
    const onA = item({ id: 'x' });
    expect(snapOffset(onA, 'A', inch(70), L, [me, onA], tol)).toBeCloseTo(
      inch(120 - 24.75 - 24),
      6,
    );
  });

  it('accounts for end panels (negative x0) when placing and snapping', () => {
    const panelled = item({ id: 'p', x0: -18 });
    expect(nextFreeOffset(panelled, 'A', L, [panelled])).toBe(18);
    expect(snapOffset(panelled, 'A', 10, L, [panelled], tol)).toBe(18);
    expect(nextFreeOffset(panelled, 'missing', L, [panelled])).toBe(0);
  });

  it('measures gaps to neighbours and wall ends', () => {
    const items = [item({ id: 'a', offset: inch(10) }), item({ id: 'b', offset: inch(36) })];
    expect(gapsBeside(items[0]!, L, items)).toEqual({ left: inch(10), right: inch(2) });
    expect(gapsBeside(items[1]!, L, items)).toEqual({ left: inch(2), right: inch(120 - 60) });
    expect(gapsBeside(item({ id: 'z', wallId: null }), L, items)).toBeNull();
  });
});

describe('layoutItems and fillerPart', () => {
  it('sizes cabinets from their generated parts, including end panels and door faces', () => {
    const p = createProject('p', 'Items');
    const cab = {
      ...createCabinet(p, 'base', { id: 'c' }),
      endPanels: { left: true, right: false },
    };
    const r = generateCabinet(cab, p);
    if (!r.ok) throw new Error(r.errors.join());
    p.cabinets = [cab, createCabinet(p, 'wall', { id: 'broken', width: 1 })];
    p.fillers = [
      {
        id: 'f',
        wallId: 'wall-1',
        offset: 0,
        width: inch(3),
        height: inch(30.5),
        elevation: inch(4),
        depth: inch(24) + 18,
      },
    ];
    const items = layoutItems(
      p,
      new Map<string, CabinetModel | null>([
        ['c', r.model],
        ['broken', null],
      ]),
    );
    expect(items[0]).toMatchObject({ x0: -18, x1: inch(24), depth: inch(24) + 18 });
    expect(items[1]).toMatchObject({ x0: 0, x1: 1, depth: inch(12) });
    expect(items[2]).toMatchObject({ kind: 'filler', x1: inch(3), depth: inch(24) + 18 });
  });

  it('cuts a filler from door material (frameless) or face-frame stock', () => {
    const p = createProject('p', 'Filler');
    const f = {
      id: 'f',
      wallId: 'wall-1',
      offset: 0,
      width: inch(3),
      height: inch(30.5),
      elevation: 0,
      depth: 600,
    };
    const part = fillerPart(f, p);
    expect(part).toMatchObject({
      materialId: 'ply-18',
      role: 'filler',
      cut: { length: inch(30.5), width: inch(3), thickness: 18 },
    });
    expect(part.bounds.max.z).toBe(600);
    const ff = {
      ...p,
      construction: {
        ...p.construction,
        carcass: { ...p.construction.carcass, style: 'faceFrame' as const },
      },
    };
    expect(fillerPart(f, ff)).toMatchObject({
      materialId: 'poplar-4-4',
      grain: true,
      cut: { thickness: inch(0.75) },
    });
  });
});

describe('L-shaped cabinets in a room', () => {
  const room = project([wall('A', 120), wall('B', 96)]);
  const corner = {
    ...createCabinet(room, 'lBase', { id: 'L' }),
    placement: { wallId: 'A', offset: 5, elevation: 0 },
  };
  const next = {
    ...createCabinet(room, 'base', { id: 'n' }),
    placement: { wallId: 'B', offset: 0, elevation: 0 },
  };
  const p: Project = { ...room, cabinets: [corner, next] };
  const models = new Map<string, CabinetModel | null>(
    p.cabinets.map((c) => {
      const r = generateCabinet(c, p);
      return [c.id, r.ok ? r.model : null];
    }),
  );

  it('sit in the corner at the end of their wall, whatever the stored offset', () => {
    const frames = wallFrames(p.room);
    expect(placedOffset(corner, frames)).toBeCloseTo(inch(120 - 36), 6);
    expect(placedOffset(next, frames)).toBe(0);
  });

  it('are an item on their wall and a return on the next, which neighbours keep clear of', () => {
    const items = layoutItems(p, models).filter((i) => i.id === 'L');
    expect(items).toMatchObject([{ wallId: 'A' }, { wallId: 'B', offset: 0, isReturn: true }]);
    const [run, ret] = items;
    expect(run!.isReturn).toBeUndefined();
    expect(run!.x1 - run!.x0).toBeCloseTo(inch(36), 6);
    expect(run!.depth).toBeCloseTo(inch(24) + 18, 6); // the run's doors, not the return
    expect(ret!.x1).toBeCloseTo(inch(36), 6);
    expect(ret!.depth).toBeCloseTo(inch(24) + 18, 6);
    const all = layoutItems(p, models);
    const n = all.find((i) => i.id === 'n')!;
    expect(nextFreeOffset(n, 'B', p, all)).toBeCloseTo(inch(36), 6);
    // The base on wall B overlaps the return; the L's own run and return don't count.
    expect(layoutIssues(p, all).map((i) => i.message)).toEqual([
      'L-shaped base overlaps Base cabinet.',
    ]);
  });

  it('need an inside corner at the end of their wall', () => {
    const straight = { ...p, room: { walls: [wall('A', 120)] }, cabinets: [corner] };
    const items = layoutItems(straight, models);
    expect(items).toHaveLength(1);
    expect(layoutIssues(straight, items).map((i) => i.message)).toEqual([
      'L-shaped base needs an inside corner at the end of A.',
    ]);
  });

  it('show their return on the next wall elevation', () => {
    const b = wallElevation(p, 'B', models);
    const rects = b.primitives.filter((x) => x.kind === 'rect');
    // The wall, the return seen from wall B, and the base cabinet.
    expect(rects.length).toBeGreaterThan(models.get('L')!.parts.length);
  });
});
