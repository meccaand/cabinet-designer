/**
 * Renderer-neutral 2D drawing (ADR-006). Core produces these; the app renders them to SVG and
 * the PDF export renders the same list, so screen and paper can't disagree. Coordinates are mm
 * with y up; renderers flip as their medium needs.
 */
import type { Mm } from '../units';

export type Fill = 'kick' | 'carcass' | 'frame' | 'front' | 'panel' | 'interior' | 'wall';

export type Primitive =
  | { kind: 'rect'; x: Mm; y: Mm; w: Mm; h: Mm; fill: Fill }
  | { kind: 'line'; x1: Mm; y1: Mm; x2: Mm; y2: Mm; style: 'dimension' | 'extension' }
  | {
      kind: 'text';
      x: Mm;
      y: Mm;
      text: string;
      anchor: 'start' | 'middle' | 'end';
      /** Degrees counter-clockwise (90 = reads bottom to top). */
      rotate: number;
    };

export interface Drawing {
  primitives: Primitive[];
  /** Text height in drawing units (mm), so labels scale with the drawing. */
  textSize: Mm;
  /** Everything drawn, dimensions included. */
  bounds: { x0: Mm; y0: Mm; x1: Mm; y1: Mm };
}
