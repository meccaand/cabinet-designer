import { describe, expect, it } from 'vitest';
import { box, extent, intersection } from './box';

describe('box geometry', () => {
  const a = box(0, 10, 0, 10, 0, 10);

  it('measures extents and keeps reversed ranges negative', () => {
    expect(extent(a, 'x')).toBe(10);
    expect(extent(box(5, 2, 0, 1, 0, 1), 'x')).toBe(-3);
  });

  it('intersects overlapping boxes', () => {
    expect(intersection(a, box(8, 20, 2, 4, -5, 5))).toEqual(box(8, 10, 2, 4, 0, 5));
  });

  it('treats touching or disjoint boxes as not intersecting', () => {
    expect(intersection(a, box(10, 20, 0, 10, 0, 10))).toBeNull();
    expect(intersection(a, box(0, 10, 11, 20, 0, 10))).toBeNull();
    expect(intersection(a, box(0, 10, 0, 10, 10 + 4e-7, 20))).toBeNull();
  });
});
