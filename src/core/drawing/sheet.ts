import type { SheetLayout, SheetSize } from '../nesting';
import type { Mm } from '../units';
import type { Drawing, Primitive } from './primitives';

/**
 * One nested sheet seen from above: the sheet (and its trimmed factory edges), each part with
 * its cut list row number, the offcut, and every saw cut with its order. Nesting measures y
 * down from the sheet's top edge; drawings are y-up, so y is mirrored to keep the same picture.
 */
export function sheetDrawing(layout: SheetLayout, sheet: SheetSize, trim: Mm): Drawing {
  const { length: L, width: W } = sheet;
  const textSize = W * 0.04;
  const flip = (y: Mm, h: Mm) => W - y - h;
  const prims: Primitive[] = [
    { kind: 'rect', x: 0, y: 0, w: L, h: W, fill: trim > 0 ? 'trim' : 'sheet' },
  ];
  if (trim > 0) {
    prims.push({ kind: 'rect', x: trim, y: trim, w: L - 2 * trim, h: W - 2 * trim, fill: 'sheet' });
  }
  if (layout.offcut) {
    const o = layout.offcut;
    prims.push({ kind: 'rect', x: o.x, y: flip(o.y, o.h), w: o.w, h: o.h, fill: 'offcut' });
  }
  for (const p of layout.placements) {
    const y = flip(p.y, p.h);
    prims.push({ kind: 'rect', x: p.x, y, w: p.w, h: p.h, fill: 'part' });
    prims.push({
      kind: 'text',
      x: p.x + p.w / 2,
      y: y + p.h / 2,
      text: `#${p.label}`,
      anchor: 'middle',
      rotate: 0,
      size: Math.min(textSize, p.h * 0.6, p.w * 0.4),
      onFill: true,
    });
  }
  for (const c of layout.cuts) {
    prims.push({ kind: 'line', x1: c.x1, y1: W - c.y1, x2: c.x2, y2: W - c.y2, style: 'cut' });
  }
  // Badges last so no part is painted over them.
  for (const c of layout.cuts) {
    prims.push({
      kind: 'badge',
      x: (c.x1 + c.x2) / 2,
      y: W - (c.y1 + c.y2) / 2,
      r: W * 0.022,
      text: String(c.n),
    });
  }
  return { primitives: prims, textSize, bounds: { x0: 0, y0: 0, x1: L, y1: W } };
}
