import { describe, expect, it } from 'vitest';
import { createBaseCabinet, generateCabinet } from '../../core/generate';
import { createProject } from '../../core/model';
import type { CabinetModel, PartRole } from '../../core/parts';
import { inch } from '../../core/units';
import {
  explodeOffset,
  fitCamera,
  overallDimensions,
  PART_GROUPS,
  partColor,
  partRoughness,
  partGroup,
  roomIsoDirection,
  unionBounds,
  visibleParts,
} from './scene';

const project = createProject('p', 'Scene');
function model(construction = {}): CabinetModel {
  const r = generateCabinet(
    createBaseCabinet(project, { id: 'c', width: inch(30), construction }),
    project,
  );
  if (!r.ok) throw new Error(r.errors.join());
  return r.model;
}
const frameless = model();
const faceFrame = model({ carcass: { style: 'faceFrame' }, fronts: { style: 'shaker' } });
const allParts = [...frameless.parts, ...faceFrame.parts];
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

describe('part groups and colours', () => {
  it('puts every generated part in a listed group with a colour', () => {
    const ids = PART_GROUPS.map((g) => g.id);
    for (const p of allParts) {
      expect(ids).toContain(partGroup(p.role));
      expect(partColor(p)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('paints every part in a painted or stained style; drawer boxes stay wood', () => {
    const finish = {
      kind: 'paint',
      color: '#8A9A97',
      sheen: 'satin',
      hardwareColor: '#9c7a3c',
    } as const;
    for (const p of allParts) {
      const group = partGroup(p.role);
      const bare = group === 'drawers';
      expect(partColor(p, finish) === '#8a9a97').toBe(!bare);
      expect(partColor(p, { ...finish, kind: 'clear' })).toBe(partColor(p));
    }
    expect(partRoughness(finish)).toBeLessThan(partRoughness({ ...finish, sheen: 'flat' }));
    expect(partRoughness()).toBe(1);
  });

  it('groups by what a woodworker would hide together', () => {
    const groups: [PartRole, string][] = [
      ['side', 'carcass'],
      ['platformRail', 'platform'],
      ['ffStile', 'faceFrame'],
      ['frontPanel', 'fronts'],
      ['slideSpacer', 'drawers'],
      ['divider', 'shelves'],
    ];
    for (const [role, group] of groups) expect(partGroup(role)).toBe(group);
  });

  it('hides parts individually and by group', () => {
    const parts = frameless.parts;
    const door = parts.find((p) => p.id === 'c/front/1/L')!;
    expect(visibleParts(parts, {}, {})).toHaveLength(parts.length);
    expect(visibleParts(parts, { [door.id]: true }, {})).not.toContain(door);
    const noFronts = visibleParts(parts, {}, { fronts: true });
    expect(noFronts.some((p) => partGroup(p.role) === 'fronts')).toBe(false);
    expect(noFronts.length).toBe(parts.length - 3);
  });
});

describe('explodeOffset', () => {
  const offset = (id: string) => {
    const p = allParts.find((x) => x.id === `c/${id}`)!;
    return explodeOffset(p, inch(30));
  };
  it('moves sides outward and the back backward', () => {
    expect(offset('side/L')[0]).toBeLessThan(0);
    expect(offset('side/R')[0]).toBeGreaterThan(0);
    expect(offset('back')[2]).toBeLessThan(0);
  });
  it('pulls fronts further forward than drawer boxes, and drawer boxes than the face frame', () => {
    const front = offset('front/0')[2];
    const drawer = offset('drawer/0/side/L')[2];
    const ff = offset('ff/stile/L')[2];
    expect(front).toBeGreaterThan(drawer);
    expect(drawer).toBeGreaterThan(ff);
    expect(ff).toBeGreaterThan(0);
  });
  it('moves all pieces of one shaker door together', () => {
    const pieces = faceFrame.parts.filter((p) => p.id.startsWith('c/front/1/L/'));
    expect(pieces.length).toBe(5);
    expect(new Set(pieces.map((p) => explodeOffset(p, inch(30)).join()))).toHaveProperty('size', 1);
  });
  it('lifts the top, drops the platform and gives every role an offset', () => {
    expect(offset('stretcher/front')[1]).toBeGreaterThan(0);
    expect(offset('platform/front')[1]).toBeLessThan(0);
    for (const p of allParts) expect(explodeOffset(p, inch(30)).some((v) => v !== 0)).toBe(true);
  });
});

describe('roomIsoDirection', () => {
  it('looks into the corner from inside the room when two walls are used', () => {
    // Wall 1 faces +z, wall 2 (after a right turn) faces -x: look from -x, +z.
    const [x, y, z] = roomIsoDirection([
      [0, 1],
      [-1, 0],
    ]);
    expect(x).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
    expect(Math.abs(x)).toBeCloseTo(z, 6);
    expect(y).toBeGreaterThan(0);
  });

  it('looks from the front right of a single wall, as for a cabinet', () => {
    const b = { min: { x: -500, y: 0, z: -500 }, max: { x: 500, y: 900, z: 500 } };
    const v = { width: 800, height: 600 };
    const dir = roomIsoDirection([[0, 1]]);
    expect(fitCamera(b, 'iso', v, 35, 0, false, dir).position).toEqual(
      fitCamera(b, 'iso', v, 35).position,
    );
    // The second wall alone (facing -x): from -x.
    expect(roomIsoDirection([[-1, 0]])[0]).toBeLessThan(0);
    // Nothing anywhere, or walls facing each other: the first wall's view.
    expect(roomIsoDirection([])).toEqual(roomIsoDirection([[0, 1]]));
    expect(
      roomIsoDirection([
        [0, 1],
        [0, -1],
      ]),
    ).toEqual(roomIsoDirection([[0, 1]]));
  });
});

describe('fitCamera', () => {
  it('looks from the left for L-shaped cabinets, whose fronts face the inside corner', () => {
    const b = { min: { x: -500, y: 0, z: -500 }, max: { x: 500, y: 900, z: 500 } };
    const v = { width: 800, height: 600 };
    expect(fitCamera(b, 'iso', v, 35, 0, true).position[0]).toBeLessThan(0);
    expect(fitCamera(b, 'iso', v, 35).position[0]).toBeGreaterThan(0);
    expect(fitCamera(b, 'side', v, 35, 0, true).position[0]).toBeLessThan(-1000);
  });

  const bounds = box(-400, 400, 0, 900, -300, 300);
  const viewport = { width: 800, height: 600 };

  it('frames elevations orthographically, looking along the right axis', () => {
    const front = fitCamera(bounds, 'front', viewport, 35);
    expect(front.orthographic).toBe(true);
    expect(front.position[2]).toBeGreaterThan(front.target[2]);
    // 900 mm tall in 600 px is the binding constraint.
    expect(front.zoom).toBeCloseTo((600 / 900) * 0.78, 9);

    const top = fitCamera(bounds, 'top', viewport, 35);
    expect(top.position[1]).toBeGreaterThan(top.target[1]);
    expect(top.zoom).toBeCloseTo(Math.min(800 / 800, 600 / 600) * 0.78, 9);

    const side = fitCamera(bounds, 'side', viewport, 35);
    expect(side.position[0]).toBeGreaterThan(side.target[0]);
  });

  it('keeps content clear of a top overlay by shifting the target up the screen', () => {
    const plain = fitCamera(bounds, 'front', viewport, 35);
    const inset = fitCamera(bounds, 'front', viewport, 35, 60);
    expect(inset.zoom).toBeLessThan(plain.zoom);
    expect(inset.target[1]).toBeGreaterThan(plain.target[1]);
    const top = fitCamera(bounds, 'top', viewport, 35, 60);
    expect(top.target[2]).toBeLessThan(0); // screen-up is the cabinet back (−z)
  });

  it('puts the iso camera far enough that the bounding sphere fits', () => {
    const iso = fitCamera(bounds, 'iso', { width: 400, height: 800 }, 35);
    expect(iso.orthographic).toBe(false);
    const d = Math.hypot(...iso.position.map((v, i) => v - iso.target[i]!));
    const radius = Math.hypot(800, 900, 600) / 2;
    const halfHorizontal = Math.atan(Math.tan((35 * Math.PI) / 360) * 0.5);
    expect(radius / d).toBeLessThan(Math.sin(halfHorizontal));
    expect(iso.position.every((v, i) => v > iso.target[i]!)).toBe(true); // front, right, above
  });
});

describe('overallDimensions and unionBounds', () => {
  it('measures width, height and depth outside the cabinet', () => {
    const dims = overallDimensions(762, 876.3, 609.6);
    expect(dims.map((d) => [d.label, d.value])).toEqual([
      ['width', 762],
      ['height', 876.3],
      ['depth', 609.6],
    ]);
    for (const d of dims) {
      const length = Math.hypot(...d.to.map((v, i) => v - d.from[i]!));
      expect(length).toBeCloseTo(d.value, 9);
      expect(d.ticks).toHaveLength(2);
    }
    expect(dims[0]!.from[1]).toBeGreaterThan(876.3);
    expect(dims[1]!.from[0]).toBeGreaterThan(762);
  });

  it('unions part bounds', () => {
    expect(unionBounds([box(0, 1, 0, 1, 0, 1), box(-2, 0, 3, 4, 0.5, 9)])).toEqual(
      box(-2, 1, 0, 4, 0, 9),
    );
    const b = unionBounds(frameless.parts.map((p) => p.bounds));
    expect(b.min.y).toBe(0);
    expect(b.max.x).toBeCloseTo(inch(30), 6);
  });
});
