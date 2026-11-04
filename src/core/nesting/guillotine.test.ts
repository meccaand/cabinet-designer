import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { inch } from '../units';
import { guillotineNester, type NestPart, type NestResult, type SheetSize } from './index';

const SHEET: SheetSize = { length: inch(96), width: inch(48) };
const KERF = inch(1 / 8);
const EPS = 1e-6;

const part = (id: string, l: number, w: number, grain = true): NestPart => ({
  id,
  label: id,
  length: inch(l),
  width: inch(w),
  grain,
});
const nest = (parts: NestPart[], kerf = KERF, trim = 0, sheet = SHEET) =>
  guillotineNester.nest(parts, sheet, { kerf, trim });

/** Every physical rule a nesting result must obey. Returns readable violations. */
function violations(parts: NestPart[], r: NestResult, kerf: number, trim: number): string[] {
  const out: string[] = [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const placed = r.sheets.flatMap((s) => s.placements.map((p) => p.partId));
  const all = [...placed, ...r.unplaced.map((p) => p.id)].sort();
  if (JSON.stringify(all) !== JSON.stringify(parts.map((p) => p.id).sort()))
    out.push('parts lost or duplicated');

  const [L, W] = [r.sheet.length, r.sheet.width];
  for (const [si, s] of r.sheets.entries()) {
    if (s.placements.length === 0) out.push(`sheet ${si} is empty`);
    for (const p of s.placements) {
      const src = byId.get(p.partId)!;
      const dims = [p.w, p.h].sort((a, b) => a - b);
      const want = [src.length, src.width].sort((a, b) => a - b);
      if (Math.abs(dims[0]! - want[0]!) > EPS || Math.abs(dims[1]! - want[1]!) > EPS)
        out.push(`${p.partId} wrong size`);
      if (src.grain && (p.rotated || Math.abs(p.w - src.length) > EPS))
        out.push(`${p.partId} breaks grain`);
      if (
        p.x < trim - EPS ||
        p.y < trim - EPS ||
        p.x + p.w > L - trim + EPS ||
        p.y + p.h > W - trim + EPS
      ) {
        out.push(`${p.partId} outside the usable sheet`);
      }
    }
    // Any two parts are separated by at least a kerf along x or y.
    for (const [i, a] of s.placements.entries()) {
      for (const b of s.placements.slice(i + 1)) {
        const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        if (gx < kerf - EPS && gy < kerf - EPS)
          out.push(`${a.partId} and ${b.partId} closer than a kerf`);
      }
    }
    // Guillotine: no cut passes through a part's interior.
    for (const c of s.cuts) {
      for (const p of s.placements) {
        const hitsX = Math.min(c.x1, c.x2) < p.x + p.w - EPS && Math.max(c.x1, c.x2) > p.x + EPS;
        const hitsY = Math.min(c.y1, c.y2) < p.y + p.h - EPS && Math.max(c.y1, c.y2) > p.y + EPS;
        const vertical = Math.abs(c.x1 - c.x2) < EPS;
        const inside = vertical
          ? c.x1 > p.x + EPS && c.x1 < p.x + p.w - EPS && hitsY
          : c.y1 > p.y + EPS && c.y1 < p.y + p.h - EPS && hitsX;
        if (inside) out.push(`cut ${c.n} on sheet ${si} goes through ${p.partId}`);
      }
      if ((c.kind === 'rip') !== Math.abs(c.y1 - c.y2) < EPS) out.push(`cut ${c.n} misnamed`);
    }
    if (s.cuts.some((c, i) => c.n !== i + 1)) out.push(`sheet ${si} cuts misnumbered`);
    const area = s.placements.reduce((sum, p) => sum + p.w * p.h, 0);
    if (Math.abs(s.yield - area / (L * W)) > 1e-9) out.push(`sheet ${si} yield wrong`);
  }
  // Unplaced parts really don't fit.
  for (const u of r.unplaced) {
    const fitsStraight = u.length <= L - 2 * trim + EPS && u.width <= W - 2 * trim + EPS;
    const fitsTurned = !u.grain && u.width <= L - 2 * trim + EPS && u.length <= W - 2 * trim + EPS;
    if (fitsStraight || fitsTurned) out.push(`${u.id} reported unplaced but fits`);
  }
  return out;
}

describe('guillotineNester: exact cases', () => {
  it('fits four 24 × 48 panels on a sheet when there is no kerf', () => {
    const parts = Array.from({ length: 8 }, (_, i) => part(`p${i}`, 48, 24));
    const r = nest(parts, 0);
    expect(r.sheets).toHaveLength(2);
    expect(r.sheets.map((s) => s.yield)).toEqual([1, 1]);
    expect(violations(parts, r, 0, 0)).toEqual([]);
  });

  it('respects kerf: four 24 × 48 grain panels cannot share a 48 × 96 sheet', () => {
    // 24 + 1/8 + 24 > 48 across, 48 + 1/8 + 48 > 96 along: one panel per sheet.
    const parts = Array.from({ length: 4 }, (_, i) => part(`p${i}`, 48, 24));
    const r = nest(parts);
    expect(r.sheets).toHaveLength(4);
    expect(violations(parts, r, KERF, 0)).toEqual([]);
  });

  it('puts two 47 15/16" panels side by side when a kerf fits between', () => {
    const parts = [part('a', 47 + 15 / 16, 48), part('b', 47 + 15 / 16, 48)];
    const r = nest(parts);
    expect(r.sheets).toHaveLength(1);
    expect(violations(parts, r, KERF, 0)).toEqual([]);
  });

  it('a full-size part needs no cuts; an oversize part is reported, not dropped', () => {
    const r = nest([part('full', 96, 48), part('huge', 97, 10), part('wide', 50, 49, false)]);
    expect(r.sheets).toHaveLength(1);
    expect(r.sheets[0]!.cuts).toEqual([]);
    expect(r.sheets[0]!.offcut).toBeNull();
    expect(r.unplaced.map((p) => p.id)).toEqual(['huge', 'wide']);
  });

  it('rotates grainless parts to fit, never grain parts', () => {
    // 60" long, 40" wide: only fits with its length across the 48" width... it doesn't.
    // 40 × 60 grainless fits turned (60 along the 96", 40 across).
    const turned = nest([part('g', 40, 60, false)]);
    expect(turned.unplaced).toEqual([]);
    expect(turned.sheets[0]!.placements[0]!).toMatchObject({
      rotated: true,
      w: inch(60),
      h: inch(40),
    });
    expect(nest([part('g', 40, 60, true)]).unplaced.map((p) => p.id)).toEqual(['g']);
  });

  it('trims factory edges first and keeps parts inside the trimmed area', () => {
    const trim = inch(1 / 4);
    const r = nest([part('a', 95.5, 47.5)], KERF, trim);
    expect(r.sheets).toHaveLength(1);
    expect(r.sheets[0]!.cuts.filter((c) => c.stage === 0)).toHaveLength(4);
    expect(nest([part('a', 95.6, 47.5)], KERF, trim).unplaced).toHaveLength(1);
  });

  it('numbers a rip-then-crosscut-then-trim sequence', () => {
    // Two 30 × 20 and one 30 × 12 (grain): one 20" strip holds a 30 × 20 and the 30 × 12
    // (trimmed to 12"); the other 30 × 20 goes in the same strip too.
    const parts = [part('a', 30, 20), part('b', 30, 20), part('c', 30, 12)];
    const r = nest(parts);
    expect(r.sheets).toHaveLength(1);
    const cuts = r.sheets[0]!.cuts;
    expect(cuts.map((c) => [c.stage, c.kind, Math.round((c.size / 25.4) * 1e6) / 1e6])).toEqual([
      [1, 'rip', 20],
      [2, 'crosscut', 30],
      [2, 'crosscut', 30],
      [2, 'crosscut', 30],
      [3, 'rip', 12],
    ]);
    expect(violations(parts, r, KERF, 0)).toEqual([]);
    const offcut = r.sheets[0]!.offcut!;
    expect(offcut.y).toBeCloseTo(inch(20) + KERF, 6);
    expect(offcut.h).toBeCloseTo(inch(28) - KERF, 6);
  });

  it('handles nothing to nest', () => {
    expect(nest([])).toMatchObject({ sheets: [], unplaced: [] });
  });
});

describe('guillotineNester: properties', () => {
  const parts = fc
    .array(
      fc.record({
        l: fc.integer({ min: 2 * 16, max: 97 * 16 }),
        w: fc.integer({ min: 2 * 16, max: 49 * 16 }),
        grain: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40 },
    )
    .map((xs) => xs.map((x, i) => part(`p${i}`, x.l / 16, Math.min(x.l, x.w) / 16, x.grain)));

  it('always produces a valid, cuttable layout', () => {
    fc.assert(
      fc.property(
        parts,
        fc.constantFrom(0, KERF, inch(3 / 16)),
        fc.constantFrom(0, inch(1 / 4)),
        (ps, kerf, trim) => {
          const r = nest(ps, kerf, trim);
          expect(violations(ps, r, kerf, trim)).toEqual([]);
          const area = ps
            .filter((p) => !r.unplaced.includes(p))
            .reduce((s, p) => s + p.length * p.width, 0);
          expect(r.sheets.length).toBeGreaterThanOrEqual(
            Math.ceil(area / (SHEET.length * SHEET.width) - 1e-9),
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
