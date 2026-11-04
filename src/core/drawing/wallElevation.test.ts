import { describe, expect, it } from 'vitest';
import { createCabinet, generateCabinet } from '../generate';
import { createProject, type Cabinet } from '../model';
import type { CabinetModel } from '../parts';
import { inch } from '../units';
import { wallElevation } from './index';

function room() {
  const p = createProject('p', 'Wall');
  const at = (c: Cabinet, offset: number): Cabinet => ({
    ...c,
    placement: { ...c.placement, wallId: 'wall-1', offset: inch(offset) },
  });
  p.cabinets = [
    at(createCabinet(p, 'base', { id: 'a', width: inch(30) }), 0),
    at(createCabinet(p, 'base', { id: 'b', width: inch(24) }), 33),
    at(createCabinet(p, 'wall', { id: 'u', width: inch(30) }), 6),
    {
      ...createCabinet(p, 'tall', { id: 'elsewhere' }),
      placement: { wallId: null, offset: 0, elevation: 0 },
    },
  ];
  p.fillers = [
    {
      id: 'f',
      wallId: 'wall-1',
      offset: inch(30),
      width: inch(3),
      height: inch(30.5),
      elevation: inch(4),
      depth: 600,
    },
  ];
  const models = new Map<string, CabinetModel | null>(
    p.cabinets.map((c) => {
      const r = generateCabinet(c, p);
      return [c.id, r.ok ? r.model : null];
    }),
  );
  return { p, models };
}

const texts = (d: ReturnType<typeof wallElevation>) =>
  d.primitives.flatMap((x) => (x.kind === 'text' ? [x.text] : []));

describe('wallElevation', () => {
  it('draws the wall, the items on it, and chained widths and gaps', () => {
    const { p, models } = room();
    const d = wallElevation(p, 'wall-1', models);
    expect(d.primitives[0]).toMatchObject({
      kind: 'rect',
      fill: 'wall',
      w: inch(120),
      h: inch(96),
    });
    // Floor run: 30 base, 3 filler, 24 base, then 63" to the wall end. Upper: 6" gap, 30, 84".
    expect(texts(d)).toEqual(['30"', '3"', '24"', '63"', '6"', '30"', '84"', '96"']);
    const rects = d.primitives.filter((x) => x.kind === 'rect');
    const partCount = ['a', 'b', 'u'].reduce((n, id) => n + models.get(id)!.parts.length, 0);
    expect(rects).toHaveLength(1 + partCount + 1); // wall + parts + filler
    expect(rects.some((r) => r.kind === 'rect' && r.fill === 'frame' && r.x === inch(30))).toBe(
      true,
    );
  });

  it('skips cabinets that fail to build and returns an empty drawing for a missing wall', () => {
    const { p, models } = room();
    models.set('b', null);
    expect(texts(wallElevation(p, 'wall-1', models))).toContain('24"'); // still dimensioned
    expect(wallElevation(p, 'nope', models).primitives).toEqual([]);
    p.fillers[0]!.id = 'orphan';
    p.fillers = [];
    expect(wallElevation(p, 'wall-1', models).primitives.length).toBeGreaterThan(1);
  });
});
