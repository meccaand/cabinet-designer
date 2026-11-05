import { describe, expect, it } from 'vitest';
import { guillotineNester } from '../nesting';
import { inch } from '../units';
import { sheetDrawing } from './sheet';

const SHEET = { length: inch(96), width: inch(48) };

describe('sheetDrawing', () => {
  // Two 30 × 20 and one 30 × 12 grain parts: one 20" strip along the top edge (nesting y = 0).
  const parts = [
    { id: 'a', label: '1', length: inch(30), width: inch(20), grain: true },
    { id: 'b', label: '1', length: inch(30), width: inch(20), grain: true },
    { id: 'c', label: '2', length: inch(30), width: inch(12), grain: true },
  ];

  it('draws the sheet, each part with its row number, the offcut, cuts and their order', () => {
    const layout = guillotineNester.nest(parts, SHEET, { kerf: inch(1 / 8), trim: 0 }).sheets[0]!;
    const d = sheetDrawing(layout, SHEET, 0);
    expect(d.bounds).toEqual({ x0: 0, y0: 0, x1: SHEET.length, y1: SHEET.width });
    const rects = d.primitives.filter((p) => p.kind === 'rect');
    expect(rects.map((r) => r.fill)).toEqual(['sheet', 'offcut', 'part', 'part', 'part']);
    const labels = d.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    expect(labels.sort()).toEqual(['#1', '#1', '#2']);
    const badges = d.primitives.filter((p) => p.kind === 'badge');
    expect(badges.map((b) => b.text)).toEqual(layout.cuts.map((c) => String(c.n)));
    expect(d.primitives.filter((p) => p.kind === 'line' && p.style === 'cut')).toHaveLength(
      layout.cuts.length,
    );

    // Nesting measures y down from the top edge; the drawing is y-up, so the strip at
    // nesting y = 0 is drawn against the top (y1) of the drawing.
    for (const pl of layout.placements) {
      const r = rects.find(
        (x) => x.fill === 'part' && x.x === pl.x && x.w === pl.w && x.h === pl.h,
      );
      expect(r).toBeDefined();
    }
    const tops = rects.filter((r) => r.fill === 'part').map((r) => r.y + r.h);
    expect(Math.max(...tops)).toBeCloseTo(SHEET.width, 9);
    // Part labels shrink to fit the part.
    const small = d.primitives.find((p) => p.kind === 'text' && p.text === '#2');
    expect(small?.kind === 'text' && small.size).toBeLessThanOrEqual(inch(12) * 0.6);
  });

  it('shades trimmed factory edges', () => {
    const layout = guillotineNester.nest(parts, SHEET, { kerf: inch(1 / 8), trim: inch(1 / 4) })
      .sheets[0]!;
    const rects = sheetDrawing(layout, SHEET, inch(1 / 4)).primitives.filter(
      (p) => p.kind === 'rect',
    );
    expect(rects.slice(0, 2)).toEqual([
      { kind: 'rect', x: 0, y: 0, w: SHEET.length, h: SHEET.width, fill: 'trim' },
      {
        kind: 'rect',
        x: inch(1 / 4),
        y: inch(1 / 4),
        w: SHEET.length - inch(1 / 2),
        h: SHEET.width - inch(1 / 2),
        fill: 'sheet',
      },
    ]);
  });
});
