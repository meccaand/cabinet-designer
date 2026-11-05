import { describe, expect, it } from 'vitest';
import type { NestPart, Nester } from '../core/nesting';
import { createSampleProject } from './sample';
import { cachingNester, deriveOutputs } from './outputs';

describe('cachingNester', () => {
  const sheet = { length: 2440, width: 1220 };
  const options = { kerf: 3, trim: 0 };
  const parts = (w: number): NestPart[] => [
    { id: 'a', label: '1', length: 700, width: w, grain: true },
  ];

  it('reuses a layout for identical inputs and recomputes for any change', () => {
    let calls = 0;
    const counting: Nester = {
      nest: (ps, s) => (calls++, { sheet: s, sheets: [], unplaced: ps }),
    };
    const cached = cachingNester(counting, 2);
    const first = cached.nest(parts(300), sheet, options);
    expect(cached.nest(parts(300), sheet, options)).toBe(first);
    expect(calls).toBe(1);
    cached.nest(parts(301), sheet, options);
    cached.nest(parts(300), sheet, { ...options, kerf: 4 });
    expect(calls).toBe(3);
    // Least recently used goes first: width 300 / kerf 3 was evicted by the two above.
    cached.nest(parts(300), sheet, options);
    expect(calls).toBe(4);
  });

  it('lets a move skip nesting: outputs of a moved cabinet reuse the same layouts', () => {
    const project = createSampleProject();
    const before = deriveOutputs(project);
    const moved = {
      ...project,
      cabinets: project.cabinets.map((c, i) =>
        i === 0 ? { ...c, placement: { ...c.placement, offset: c.placement.offset + 10 } } : c,
      ),
    };
    const after = deriveOutputs(moved);
    expect(after.project).toBe(moved);
    after.nests.forEach((n, i) => expect(n.result).toBe(before.nests[i]!.result));
    expect(after.estimate.total).toBe(before.estimate.total);
  });
});
