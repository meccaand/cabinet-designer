/**
 * Core drawings on a jsPDF page (ADR-006): the same primitives the screen renders as SVG, with
 * the same colours, so paper and screen match.
 */
import type { jsPDF } from 'jspdf';
import type { Drawing, Fill } from '../../core/drawing';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Scale and offset that fit drawing bounds (y-up) into a page box (y-down), centred. */
export function fitDrawing(bounds: Drawing['bounds'], box: Box) {
  const { x0, y0, x1, y1 } = bounds;
  const scale = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  const ox = box.x + (box.w - (x1 - x0) * scale) / 2;
  const oy = box.y + (box.h - (y1 - y0) * scale) / 2;
  return {
    scale,
    x: (v: number) => ox + (v - x0) * scale,
    y: (v: number) => oy + (y1 - v) * scale,
  };
}

const INK = '#5b5348';
const CUT = '#b03a2e';
const FILLS: Record<Fill, { fill: string; stroke: string | null }> = {
  kick: { fill: '#b9a27f', stroke: INK },
  carcass: { fill: '#e4d3b6', stroke: INK },
  frame: { fill: '#d6b47e', stroke: INK },
  front: { fill: '#f1ebe0', stroke: INK },
  panel: { fill: '#e2d4bb', stroke: INK },
  interior: { fill: '#e9dcc4', stroke: INK },
  wall: { fill: '#f4f1ea', stroke: '#9a9389' },
  sheet: { fill: '#f0e6d2', stroke: INK },
  trim: { fill: '#d8ccb6', stroke: INK },
  part: { fill: '#e2c99c', stroke: INK },
  offcut: { fill: '#f0e6d2', stroke: null },
};

/**
 * The standard PDF fonts only cover Windows-1252. `≈` (a rounded size) becomes `~`, which the
 * packet's notes explain; anything else outside the set becomes `?` rather than garbage.
 */
export function pdfText(s: string): string {
  return s.replace(/≈/g, '~').replace(/[^\n\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
}

/** Draw `d` scaled to fit `box`. */
export function drawDrawing(doc: jsPDF, d: Drawing, box: Box): void {
  const t = fitDrawing(d.bounds, box);
  const line = 0.5;
  doc.setLineDashPattern([], 0);
  for (const p of d.primitives) {
    switch (p.kind) {
      case 'rect': {
        const { fill, stroke } = FILLS[p.fill];
        const x = t.x(p.x);
        const y = t.y(p.y + p.h);
        const w = p.w * t.scale;
        const h = p.h * t.scale;
        doc.setFillColor(fill);
        doc.setLineWidth(p.fill === 'part' ? line * 1.5 : line);
        if (stroke) doc.setDrawColor(stroke);
        doc.rect(x, y, w, h, stroke ? 'FD' : 'F');
        if (p.fill === 'offcut') hatch(doc, x, y, w, h);
        break;
      }
      case 'line':
        doc.setDrawColor(p.style === 'cut' ? CUT : '#6d675d');
        doc.setLineWidth(p.style === 'cut' ? line * 1.5 : line * 0.6);
        doc.setLineDashPattern(p.style === 'cut' ? [4, 2.5] : [], 0);
        doc.line(t.x(p.x1), t.y(p.y1), t.x(p.x2), t.y(p.y2));
        doc.setLineDashPattern([], 0);
        break;
      case 'text': {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#22201c');
        doc.setFontSize((p.size ?? d.textSize) * t.scale);
        const text = pdfText(p.text);
        // Anchor by hand: jsPDF's own alignment ignores rotation.
        const shift = { start: 0, middle: 0.5, end: 1 }[p.anchor] * doc.getTextWidth(text);
        const a = (p.rotate * Math.PI) / 180;
        doc.text(text, t.x(p.x) - shift * Math.cos(a), t.y(p.y) + shift * Math.sin(a), {
          baseline: 'middle',
          angle: p.rotate,
        });
        break;
      }
      case 'badge': {
        const r = p.r * t.scale;
        doc.setFillColor(CUT);
        doc.circle(t.x(p.x), t.y(p.y), r, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#ffffff');
        doc.setFontSize(r * 1.3);
        doc.text(p.text, t.x(p.x), t.y(p.y), { align: 'center', baseline: 'middle' });
        break;
      }
    }
  }
  doc.setTextColor('#000000');
  doc.setFont('helvetica', 'normal');
}

/** 45° hatching inside a rectangle (the reusable offcut). */
function hatch(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  const gap = 6;
  doc.setDrawColor('#c9bda5');
  doc.setLineWidth(0.6);
  for (let k = -h + gap; k < w; k += gap) {
    const t0 = Math.max(0, -k);
    const t1 = Math.min(h, w - k);
    doc.line(x + k + t0, y + t0, x + k + t1, y + t1);
  }
}
