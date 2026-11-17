/**
 * A run's countertop (ADR-038, ADR-040): a sheet-stock top on the base boxes with a solid edge
 * strip along the front (and across exposed ends), so it reads `countertopEdge` thick.
 *
 * - The top sits on the boxes; its top is the run's countertop height. It runs from the wall to
 *   the back of the front strip.
 * - The front strip's face is `countertopOverhang` past the face frames, its top flush with the
 *   top. It must be no thicker than the overhang, or it would hit the face frames below the top.
 * - At an exposed end the top runs `countertopOverhang` past the box (and its end panel), and an
 *   end strip covers it, butted behind the front strip. Against a wall, a pilaster or an
 *   obstruction it stops flush.
 * - A top longer than a sheet is split into as few pieces as fit, each seam over a joint between
 *   two boxes. The strips are split at the same seams.
 */
import { box } from '../geometry';
import { BuildError, type BuildContext } from '../generate';
import type { Run } from '../model';
import { formatLength, quantize, type Mm } from '../units';

export interface CountertopSegment {
  /** Run coordinates of the boxes covered, end panels included. */
  x0: Mm;
  x1: Mm;
  exposedLeft: boolean;
  exposedRight: boolean;
  /** Where neighbouring boxes meet: the only places a seam may go. */
  joints: Mm[];
}

const EPS = 1e-6;

export function buildCountertop(ctx: BuildContext, run: Run, segments: CountertopSegment[]): void {
  const f = (v: Mm) => formatLength(v, ctx.project.units);
  const top = ctx.stock('carcass');
  const plyT = top.thickness;
  const et = ctx.thickness('faceFrame');
  const oh = run.countertopOverhang;
  const H = run.countertopHeight;
  const eh = run.countertopEdge;
  if (oh < et - EPS) {
    throw new BuildError(
      `the countertop overhang (${f(oh)}) must be at least the edge strip's thickness (${f(et)}), so the strip clears the face frames.`,
    );
  }
  if (eh < plyT - EPS) {
    throw new BuildError(
      `the countertop edge (${f(eh)}) must be at least as tall as the top is thick (${f(plyT)}).`,
    );
  }
  const sheet = ctx.project.materials.sheets.find((s) => s.id === top.id);
  const maxLen = sheet ? sheet.length - 2 * ctx.project.shop.sheetEdgeTrim : Infinity;
  const zFront = quantize(run.baseDepth + oh);
  const zStrip = quantize(zFront - et);
  const y0 = quantize(H - plyT);
  const yStrip = quantize(H - eh);

  segments.forEach((seg, si) => {
    const x0 = quantize(seg.x0 - (seg.exposedLeft ? oh : 0));
    const x1 = quantize(seg.x1 + (seg.exposedRight ? oh : 0));
    const cuts = seams(x0, x1, seg.joints, maxLen, f);
    const bounds = [x0, ...cuts, x1];
    const n = bounds.length - 1;
    const tag = segments.length > 1 ? `${si + 1}/` : '';
    for (let k = 0; k < n; k++) {
      const px0 = bounds[k] ?? x0;
      const px1 = bounds[k + 1] ?? x1;
      const first = k === 0;
      const last = k === n - 1;
      const notes =
        n > 1
          ? [
              `One of ${n} pieces: butt the seam${n > 2 ? 's' : ''} over the box joints and join with biscuits or screws from below.`,
            ]
          : [];
      ctx.add({
        id: `countertop/${tag}${k + 1}`,
        role: 'countertop',
        name: 'Countertop',
        materialRole: 'carcass',
        bounds: box(
          quantize(first && seg.exposedLeft ? px0 + et : px0),
          quantize(last && seg.exposedRight ? px1 - et : px1),
          y0,
          H,
          0,
          zStrip,
        ),
        lengthAxis: 'x',
        thicknessAxis: 'y',
        notes,
      });
      ctx.add({
        id: `countertop/${tag}${k + 1}/edge`,
        role: 'countertopEdge',
        name: 'Countertop edge',
        materialRole: 'faceFrame',
        bounds: box(px0, px1, yStrip, H, zStrip, zFront),
        lengthAxis: 'x',
        thicknessAxis: 'z',
        notes: ['Glue to the front of the top, top edges flush.'],
      });
    }
    for (const [side, exposed, xs] of [
      ['L', seg.exposedLeft, [x0, x0 + et]],
      ['R', seg.exposedRight, [x1 - et, x1]],
    ] as const) {
      if (!exposed) continue;
      ctx.add({
        id: `countertop/${tag}end/${side}`,
        role: 'countertopEdge',
        name: 'Countertop end',
        materialRole: 'faceFrame',
        bounds: box(quantize(xs[0]), quantize(xs[1]), yStrip, H, 0, zStrip),
        lengthAxis: 'z',
        thicknessAxis: 'x',
        notes: ['Glue to the end of the top, behind the front edge.'],
      });
    }
  });
}

/** As few seams as keep every piece within `maxLen`, each at a joint; greedy, farthest first. */
export function seams(
  x0: Mm,
  x1: Mm,
  joints: Mm[],
  maxLen: Mm,
  f: (v: Mm) => string = String,
): Mm[] {
  const out: Mm[] = [];
  let start = x0;
  while (x1 - start > maxLen + EPS) {
    const reach = joints.filter(
      (j) => j > start + EPS && j - start <= maxLen + EPS && j < x1 - EPS,
    );
    if (reach.length === 0) {
      throw new BuildError(
        `the countertop is longer than a sheet (${f(maxLen)}) with no joint between boxes to split it at: add a stile and a second section, or shorten the run.`,
      );
    }
    start = Math.max(...reach);
    out.push(start);
  }
  return out;
}
