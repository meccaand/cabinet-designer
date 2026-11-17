/**
 * Run trim (ADR-042): frieze boards, crown and base moulding, corner fillers and picture lights,
 * generated along a whole run, never per box. Run coordinates as in compile.ts.
 *
 * - **Frieze:** a board of face-frame stock, `topGap − crown height` tall, flush with the
 *   uppers' face frames, from the top line up to the crown. It runs across every module except
 *   an obstruction set to stop the crown. At an end meeting the room it returns along the end
 *   to the wall (the front board covers the return's end); at a wall it stops square; at an
 *   inside corner the earlier wall's frieze runs through to the wall and the later one butts
 *   into its face.
 * - **Crown** (bought, by length) sits on the frieze, from the frieze face out `crownProjection`,
 *   up to the ceiling, along the same path. **Base moulding** (bought) covers the plinth face
 *   along each stretch of sections, stopping square at pilasters and obstructions.
 *   Corners are mitred: inside where two runs meet, outside (with a return to the wall) at an
 *   end meeting the room. Lengths are to the long points.
 * - **Corner fillers:** at an inside corner each run stops short of the other's boxes; a filler
 *   (base) and a corner stile (upper) in the face plane close the gap to the other run's face.
 *   The space behind is a dead corner under the countertop.
 * - **Picture lights** centre on the frieze over each section that asks for one.
 */
import { box, type Box } from '../geometry';
import type { BuildContext } from '../generate';
import type { Run } from '../model';
import { formatLength, quantize, type Mm } from '../units';

export type MouldingEnd = 'square' | 'insideCorner' | 'outsideCorner';

/** A straight length of bought moulding along a run's face, with what happens at each end. */
export interface MouldingSegment {
  kind: 'crown' | 'base';
  x0: Mm;
  x1: Mm;
  /** The face it is applied to, measured from the wall. */
  z: Mm;
  y0: Mm;
  y1: Mm;
  /** How far it stands off that face. */
  projection: Mm;
  ends: { left: MouldingEnd; right: MouldingEnd };
}

/** One stretch of trim along a run, in run coordinates. */
export interface TrimPath {
  x0: Mm;
  x1: Mm;
  left: MouldingEnd;
  right: MouldingEnd;
}

export interface RunTrimInput {
  run: Run;
  /** Paths for the frieze (and the crown on it) and for the base moulding. */
  frieze: (TrimPath & { returnLeft: boolean; returnRight: boolean })[];
  crown: TrimPath[];
  base: TrimPath[];
  topLine: Mm;
  ceiling: Mm;
  friezeHeight: Mm;
  crownHeight: Mm;
  crownProjection: Mm;
  baseMouldingHeight: Mm;
  /** Corner fillers: [x0, x1] at base and upper level. */
  fillers: { level: 'base' | 'upper'; x0: Mm; x1: Mm }[];
  baseTop: Mm;
  /** Box centres along the run of sections with a picture light. */
  lights: Mm[];
  lightWidth: Mm;
  railWidth: Mm;
}

export interface RunTrim {
  mouldings: MouldingSegment[];
  lights: Box[];
}

/** Picture lights: drawn as a bar this tall, standing this far off the frieze. */
const LIGHT_HEIGHT = 2 * 25.4;
const LIGHT_PROJECTION = 3 * 25.4;

export function buildRunTrim(ctx: BuildContext, t: RunTrimInput): RunTrim {
  const f = (v: Mm) => formatLength(v, ctx.project.units);
  const tf = ctx.thickness('faceFrame');
  const { run } = t;
  const zU = run.upperDepth;

  // ---- Frieze boards -------------------------------------------------------------------------
  if (t.friezeHeight > 0) {
    const y0 = t.topLine;
    const y1 = quantize(t.topLine + t.friezeHeight);
    const many = t.frieze.length > 1;
    t.frieze.forEach((p, i) => {
      const tag = many ? `${i + 1}/` : '';
      const length = p.x1 - p.x0;
      ctx.add({
        id: `frieze/${tag}front`,
        role: 'frieze',
        name: 'Frieze',
        materialRole: 'faceFrame',
        bounds: box(p.x0, p.x1, y0, y1, quantize(zU - tf), zU),
        lengthAxis: 'x',
        thicknessAxis: 'z',
        notes: [
          'Fasten to blocking on the box tops, and to the wall where nothing is below.',
          ...(length > 144 * 25.4
            ? [`Longer than 12' (${f(length)}): splice it over a stile.`]
            : []),
        ],
      });
      for (const [side, on, x] of [
        ['L', p.returnLeft, p.x0],
        ['R', p.returnRight, quantize(p.x1 - tf)],
      ] as const) {
        if (!on) continue;
        ctx.add({
          id: `frieze/${tag}return/${side}`,
          role: 'frieze',
          name: 'Frieze return',
          materialRole: 'faceFrame',
          bounds: box(x, quantize(x + tf), y0, y1, 0, quantize(zU - tf)),
          lengthAxis: 'z',
          thicknessAxis: 'x',
          notes: ['Butt behind the end of the front frieze, flush with the end panel.'],
        });
      }
    });
  }

  // ---- Corner fillers ------------------------------------------------------------------------
  t.fillers.forEach((fl, i) => {
    const upper = fl.level === 'upper';
    const z = upper ? zU : run.baseDepth;
    ctx.add({
      id: `corner/${fl.level}/${i}`,
      role: 'filler',
      name: upper ? 'Corner stile' : 'Corner filler',
      materialRole: 'faceFrame',
      bounds: box(
        fl.x0,
        fl.x1,
        upper ? run.countertopHeight : 0,
        upper ? t.topLine : t.baseTop,
        quantize(z - tf),
        z,
      ),
      lengthAxis: 'y',
      thicknessAxis: 'z',
      notes: [
        "Closes the inside corner to the other wall's face frames; scribe to fit. The corner behind is dead space.",
      ],
    });
  });

  // ---- Bought mouldings ----------------------------------------------------------------------
  const mouldings: MouldingSegment[] = [];
  if (t.crownHeight > 0) {
    for (const p of t.crown) {
      mouldings.push({
        kind: 'crown',
        x0: p.x0,
        x1: p.x1,
        z: zU,
        y0: quantize(t.ceiling - t.crownHeight),
        y1: t.ceiling,
        projection: t.crownProjection,
        ends: { left: p.left, right: p.right },
      });
    }
  }
  if (t.baseMouldingHeight > 0) {
    for (const p of t.base) {
      mouldings.push({
        kind: 'base',
        x0: p.x0,
        x1: p.x1,
        z: run.baseDepth,
        y0: 0,
        y1: t.baseMouldingHeight,
        projection: tf,
        ends: { left: p.left, right: p.right },
      });
    }
  }

  // ---- Picture lights ------------------------------------------------------------------------
  const yc = t.friezeHeight > 0 ? t.topLine + t.friezeHeight / 2 : t.topLine - t.railWidth / 2;
  const lights = t.lights.map((xc) =>
    box(
      quantize(xc - t.lightWidth / 2),
      quantize(xc + t.lightWidth / 2),
      quantize(yc - LIGHT_HEIGHT / 2),
      quantize(yc + LIGHT_HEIGHT / 2),
      zU,
      quantize(zU + LIGHT_PROJECTION),
    ),
  );
  return { mouldings, lights };
}

/** A moulding's length to buy, to the long points: the face run, plus at each mitred end its
 * projection, plus an outside corner's return back to the wall. */
export function mouldingLength(m: MouldingSegment): Mm {
  let len = m.x1 - m.x0;
  for (const end of [m.ends.left, m.ends.right]) {
    if (end === 'insideCorner') len += m.projection;
    if (end === 'outsideCorner') len += 2 * m.projection + m.z;
  }
  return len;
}

export interface MouldingTotal {
  kind: 'crown' | 'base';
  length: Mm;
  /** Joints where two lengths meet in an inside corner (each needs two mitred or coped ends). */
  insideMiters: number;
  /** Outside corners, each with a return to the wall. */
  outsideMiters: number;
}

/** Totals over every segment. Inside corners are shared by two segments, so count once. */
export function mouldingTotals(segments: readonly MouldingSegment[]): MouldingTotal[] {
  return (['crown', 'base'] as const).flatMap((kind) => {
    const mine = segments.filter((s) => s.kind === kind);
    if (mine.length === 0) return [];
    const ends = mine.flatMap((s) => [s.ends.left, s.ends.right]);
    return [
      {
        kind,
        length: quantize(mine.reduce((sum, s) => sum + mouldingLength(s), 0)),
        insideMiters: Math.ceil(ends.filter((e) => e === 'insideCorner').length / 2),
        outsideMiters: ends.filter((e) => e === 'outsideCorner').length,
      },
    ];
  });
}

/**
 * Boxes to draw a moulding with (run coordinates): the length along the face, out to the long
 * point at a mitred end, and at an outside corner the return back to the wall.
 */
export function mouldingBoxes(m: MouldingSegment): Box[] {
  const p = m.projection;
  const out = m.ends.left === 'outsideCorner';
  const outR = m.ends.right === 'outsideCorner';
  const x0 = out ? m.x0 - p : m.x0;
  const x1 = outR ? m.x1 + p : m.x1;
  const boxes = [box(x0, x1, m.y0, m.y1, m.z, m.z + p)];
  if (out) boxes.push(box(x0, m.x0, m.y0, m.y1, 0, m.z));
  if (outR) boxes.push(box(m.x1, x1, m.y0, m.y1, 0, m.z));
  return boxes;
}
