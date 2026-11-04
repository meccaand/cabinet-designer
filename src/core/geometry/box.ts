import { quantize, type Mm } from '../units';

export type Axis = 'x' | 'y' | 'z';
export const AXES: readonly Axis[] = ['x', 'y', 'z'];

export interface Vec3 {
  x: Mm;
  y: Mm;
  z: Mm;
}

/** Axis-aligned box in cabinet coordinates: x left→right, y floor→up, z back→front. */
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Overlaps thinner than this are treated as touching (values are quantized to 1e-6 mm). */
const TOUCH_TOLERANCE = 5e-7;

/**
 * Box from its ranges. Ranges are NOT reordered: if a calculation yields x1 < x0 the box has a
 * negative extent, so the error surfaces (the part builder rejects it) instead of being hidden.
 */
export function box(x0: Mm, x1: Mm, y0: Mm, y1: Mm, z0: Mm, z1: Mm): Box {
  return {
    min: { x: quantize(x0), y: quantize(y0), z: quantize(z0) },
    max: { x: quantize(x1), y: quantize(y1), z: quantize(z1) },
  };
}

export function extent(b: Box, axis: Axis): Mm {
  return quantize(b.max[axis] - b.min[axis]);
}

/** The shared volume of two boxes, or null when they are disjoint or only touch. */
export function intersection(a: Box, b: Box): Box | null {
  const min = { x: 0, y: 0, z: 0 };
  const max = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) {
    min[axis] = Math.max(a.min[axis], b.min[axis]);
    max[axis] = Math.min(a.max[axis], b.max[axis]);
    if (max[axis] - min[axis] <= TOUCH_TOLERANCE) return null;
  }
  return box(min.x, max.x, min.y, max.y, min.z, max.z);
}
