/**
 * Guillotine nesting for sheet goods (ADR-007): cut the sheet into strips edge to edge, cut each
 * strip into sections, cut each section into the parts stacked in it, then trim any part
 * shorter than its section. Every cut goes straight across the piece being cut, so it works on
 * a table saw or with a track saw.
 *
 * Sheet coordinates: x along the sheet length (the grain), y across it. A part with grain must
 * have its length along x. Strips are filled first-fit; several sort orders and both strip
 * directions are tried, and the result with the fewest sheets (then the biggest leftover) wins.
 */
import { quantize, type Mm } from '../units';

export interface NestPart {
  id: string;
  /** Short label for diagrams (the cut list row number). */
  label: string;
  length: Mm;
  width: Mm;
  /** Length must run along the sheet's grain (x). Grainless parts may rotate. */
  grain: boolean;
}

export interface SheetSize {
  /** Along the grain. */
  length: Mm;
  width: Mm;
}

export interface NestOptions {
  kerf: Mm;
  /** Strip removed from every factory edge before parts are laid out. */
  trim: Mm;
}

export interface Placement {
  partId: string;
  label: string;
  x: Mm;
  y: Mm;
  /** Extent along x (sheet length) and y. */
  w: Mm;
  h: Mm;
  /** True when the part's length runs across the sheet. */
  rotated: boolean;
}

export interface Cut {
  /** Order on this sheet, from 1. */
  n: number;
  /** Rip: parallel to the sheet length (with the grain). Crosscut: across it. */
  kind: 'rip' | 'crosscut';
  /**
   * 0 = trim a factory edge, 1 = cut a strip off the sheet, 2 = cut a section off the strip,
   * 3 = cut a part off its section, 4 = trim a part to length.
   */
  stage: 0 | 1 | 2 | 3 | 4;
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
  /** The dimension this cut sets: strip width, part length, or part width. */
  size: Mm;
  partId: string | null;
}

export interface SheetLayout {
  placements: Placement[];
  cuts: Cut[];
  /** Area of parts on this sheet / area of the sheet. */
  yield: number;
  /** Biggest clean rectangle left over (for reuse), or null. */
  offcut: { x: Mm; y: Mm; w: Mm; h: Mm } | null;
}

export interface NestResult {
  sheet: SheetSize;
  sheets: SheetLayout[];
  /** Parts larger than the usable sheet in every allowed orientation. Never dropped silently. */
  unplaced: NestPart[];
}

export interface Nester {
  nest(parts: NestPart[], sheet: SheetSize, options: NestOptions): NestResult;
}

/** Strip direction: 'rip' strips run the full sheet length; 'crosscut' strips run across it. */
type Mode = 'rip' | 'crosscut';

interface Item {
  part: NestPart;
  /** Extent along the strip (s) and across it (t); t0 is from the strip's edge. */
  ps: Mm;
  pt: Mm;
  t0: Mm;
  rotated: boolean;
}
/** A section of a strip, crosscut off it, holding parts stacked across the strip. */
interface Column {
  s0: Mm;
  width: Mm;
  usedT: Mm;
  items: Item[];
}
interface Strip {
  t0: Mm;
  height: Mm;
  used: Mm;
  columns: Column[];
}
interface WorkSheet {
  strips: Strip[];
  usedT: Mm;
}

const EPS = 1e-6;

/** The two ways a part can lie in a strip for a mode: [along strip, across strip, rotated]. */
function orientations(p: NestPart, mode: Mode): [Mm, Mm, boolean][] {
  // Unrotated, the part's length is along x. In rip mode strips run along x.
  const straight: [Mm, Mm, boolean] =
    mode === 'rip' ? [p.length, p.width, false] : [p.width, p.length, false];
  if (p.grain) return [straight];
  const turned: [Mm, Mm, boolean] = [straight[1], straight[0], true];
  return Math.abs(p.length - p.width) < EPS ? [straight] : [straight, turned];
}

/**
 * Three-stage packing: strips across the sheet, columns cut off each strip, and parts stacked
 * in each column. A part first tries to stack in an existing column (filling height left by a
 * shorter part), then to start a column in an existing strip, then a new strip, then a sheet.
 */
function pack(parts: NestPart[], mode: Mode, Ls: Mm, Lt: Mm, kerf: Mm): WorkSheet[] {
  const sheets: WorkSheet[] = [];
  for (const part of parts) {
    const options = orientations(part, mode);
    type Choice = { score: [number, number]; apply: () => void };
    let best: Choice | null = null;
    const offer = (score: [number, number], apply: () => void) => {
      if (
        !best ||
        score[0] < best.score[0] - EPS ||
        (Math.abs(score[0] - best.score[0]) < EPS && score[1] < best.score[1] - EPS)
      ) {
        best = { score, apply };
      }
    };
    for (const sheet of sheets) {
      for (const strip of sheet.strips) {
        for (const [ps, pt, rotated] of options) {
          // Stack in an existing column: least width wasted, then least height left.
          for (const col of strip.columns) {
            const t0 = col.usedT + kerf;
            if (ps <= col.width + EPS && t0 + pt <= strip.height + EPS) {
              offer([0, (col.width - ps) * pt + (strip.height - t0 - pt)], () => {
                col.items.push({ part, ps, pt, t0, rotated });
                col.usedT = t0 + pt;
              });
            }
          }
          // A new column in an existing strip: least strip height wasted.
          const s0 = strip.columns.length ? strip.used + kerf : 0;
          if (pt <= strip.height + EPS && s0 + ps <= Ls + EPS) {
            offer([1, strip.height - pt], () => {
              strip.columns.push({
                s0,
                width: ps,
                usedT: pt,
                items: [{ part, ps, pt, t0: 0, rotated }],
              });
              strip.used = s0 + ps;
            });
          }
        }
      }
    }
    if (best) {
      (best as Choice).apply();
      continue;
    }
    // A new strip: the thinnest orientation that fits along the strip.
    const o = options
      .filter((x) => x[0] <= Ls + EPS && x[1] <= Lt + EPS)
      .sort((a, b) => a[1] - b[1])[0];
    if (!o) continue; // too big; reported as unplaced by the caller
    const [ps, pt, rotated] = o;
    let sheet = sheets.find((sh) => (sh.strips.length ? sh.usedT + kerf : 0) + pt <= Lt + EPS);
    if (!sheet) {
      sheet = { strips: [], usedT: 0 };
      sheets.push(sheet);
    }
    const t0 = sheet.strips.length ? sheet.usedT + kerf : 0;
    sheet.strips.push({
      t0,
      height: pt,
      used: ps,
      columns: [{ s0: 0, width: ps, usedT: pt, items: [{ part, ps, pt, t0: 0, rotated }] }],
    });
    sheet.usedT = t0 + pt;
  }
  return sheets;
}

const ORDERS: ((a: NestPart, b: NestPart) => number)[] = [
  (a, b) => Math.min(b.length, b.width) - Math.min(a.length, a.width) || b.length - a.length,
  (a, b) => b.length * b.width - a.length * a.width,
  (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width) || b.width - a.width,
  (a, b) => b.width - a.width || b.length - a.length,
  (a, b) => b.length - a.length || b.width - a.width,
  (a, b) => b.length + b.width - (a.length + a.width),
];
/** Extra deterministic shuffles of the area order: cheap, and they often save a sheet. */
const SHUFFLES = 12;

/** The parts in each order to try: the sort orders, then seeded shuffles. */
function orderings(parts: NestPart[]): NestPart[][] {
  const out = ORDERS.map((o) => [...parts].sort(o));
  const byArea = out[1] ?? [];
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return seed / 2 ** 32;
  };
  for (let k = 0; k < SHUFFLES; k++) {
    // Mostly large-first: swap neighbours at random, so big parts still lead.
    const order = [...byArea];
    for (let i = order.length - 1; i > 0; i--) {
      if (random() < 0.5) {
        const j = Math.max(0, i - 1 - Math.floor(random() * 3));
        const a = order[i];
        const b = order[j];
        if (a && b) {
          order[i] = b;
          order[j] = a;
        }
      }
    }
    out.push(order);
  }
  return out;
}

export const guillotineNester: Nester = {
  nest(parts, sheet, { kerf, trim }) {
    const Lx = sheet.length - 2 * trim;
    const Ly = sheet.width - 2 * trim;
    const fits = (p: NestPart) =>
      (['rip', 'crosscut'] as const).some((m) =>
        orientations(p, m).some(
          ([s, t]) => s <= (m === 'rip' ? Lx : Ly) + EPS && t <= (m === 'rip' ? Ly : Lx) + EPS,
        ),
      );
    const placeable = parts.filter(fits);
    const unplaced = parts.filter((p) => !fits(p));

    let best: { mode: Mode; sheets: WorkSheet[] } | null = null;
    for (const mode of ['rip', 'crosscut'] as const) {
      const [Ls, Lt] = mode === 'rip' ? [Lx, Ly] : [Ly, Lx];
      for (const order of orderings(placeable)) {
        const sheets = pack(order, mode, Ls, Lt, kerf);
        if (!best || better(sheets, best.sheets)) best = { mode, sheets };
      }
    }
    const layouts = (best?.sheets ?? []).map((ws) =>
      layout(ws, best?.mode ?? 'rip', sheet, Lx, Ly, kerf, trim),
    );
    return { sheet, sheets: layouts, unplaced };
  },
};

/** Fewer sheets wins; then the most material left in one piece on the last sheet. */
function better(a: WorkSheet[], b: WorkSheet[]): boolean {
  if (a.length !== b.length) return a.length < b.length;
  return (a.at(-1)?.usedT ?? 0) < (b.at(-1)?.usedT ?? 0) - EPS;
}

/** Turn a packed sheet into placements and a numbered cut sequence in sheet coordinates. */
function layout(
  ws: WorkSheet,
  mode: Mode,
  sheet: SheetSize,
  Lx: Mm,
  Ly: Mm,
  kerf: Mm,
  trim: Mm,
): SheetLayout {
  const [Ls, Lt] = mode === 'rip' ? [Lx, Ly] : [Ly, Lx];
  // (s, t) in the usable area → (x, y) on the sheet.
  const xy = (s: Mm, t: Mm): [Mm, Mm] =>
    mode === 'rip' ? [trim + s, trim + t] : [trim + t, trim + s];
  const placements: Placement[] = [];
  const cuts: Cut[] = [];
  const cut = (stage: Cut['stage'], a: [Mm, Mm], b: [Mm, Mm], size: Mm, partId: string | null) => {
    // A cut running along x is a rip; along y, a crosscut.
    const alongX = Math.abs(a[1] - b[1]) < EPS;
    cuts.push({
      n: cuts.length + 1,
      kind: alongX ? 'rip' : 'crosscut',
      stage,
      x1: quantize(a[0]),
      y1: quantize(a[1]),
      x2: quantize(b[0]),
      y2: quantize(b[1]),
      size: quantize(size),
      partId,
    });
  };

  if (trim > 0) {
    const L = sheet.length;
    const W = sheet.width;
    cut(0, [0, trim], [L, trim], trim, null);
    cut(0, [0, W - trim], [L, W - trim], trim, null);
    cut(0, [trim, 0], [trim, W], trim, null);
    cut(0, [L - trim, 0], [L - trim, W], trim, null);
  }

  // Stage 1: strips off the sheet, in order. No cut needed if a strip ends at the far edge.
  for (const strip of ws.strips) {
    const end = strip.t0 + strip.height;
    if (end < Lt - EPS) cut(1, xy(0, end), xy(Ls, end), strip.height, null);
  }
  // Stage 2: columns off each strip. Stage 3: parts off each column. Stage 4: trim a part
  // narrower than its column.
  for (const strip of ws.strips) {
    for (const col of strip.columns) {
      const end = col.s0 + col.width;
      if (end < Ls - EPS)
        cut(2, xy(end, strip.t0), xy(end, strip.t0 + strip.height), col.width, null);
    }
    for (const col of strip.columns) {
      for (const it of col.items) {
        const top = strip.t0 + it.t0 + it.pt;
        if (top < strip.t0 + strip.height - EPS) {
          cut(3, xy(col.s0, top), xy(col.s0 + col.width, top), it.pt, it.part.id);
        }
      }
      for (const it of col.items) {
        if (it.ps < col.width - EPS) {
          const t = strip.t0 + it.t0;
          cut(4, xy(col.s0 + it.ps, t), xy(col.s0 + it.ps, t + it.pt), it.ps, it.part.id);
        }
      }
      for (const it of col.items) {
        const [x0, y0] = xy(col.s0, strip.t0 + it.t0);
        const [x1, y1] = xy(col.s0 + it.ps, strip.t0 + it.t0 + it.pt);
        placements.push({
          partId: it.part.id,
          label: it.part.label,
          x: quantize(Math.min(x0, x1)),
          y: quantize(Math.min(y0, y1)),
          w: quantize(Math.abs(x1 - x0)),
          h: quantize(Math.abs(y1 - y0)),
          rotated: it.rotated,
        });
      }
    }
  }

  const area = placements.reduce((sum, p) => sum + p.w * p.h, 0);
  // Biggest leftover: past the last strip, or the end of the strip with most left.
  const rest = Lt - ws.usedT - (ws.strips.length ? kerf : 0);
  const candidates: { s: Mm; t: Mm; ls: Mm; lt: Mm }[] = [];
  if (rest > EPS) candidates.push({ s: 0, t: Lt - rest, ls: Ls, lt: rest });
  for (const strip of ws.strips) {
    const left = Ls - strip.used - kerf;
    if (left > EPS) candidates.push({ s: Ls - left, t: strip.t0, ls: left, lt: strip.height });
    for (const col of strip.columns) {
      const up = strip.height - col.usedT - kerf;
      if (up > EPS)
        candidates.push({ s: col.s0, t: strip.t0 + col.usedT + kerf, ls: col.width, lt: up });
    }
  }
  const big = candidates.sort((a, b) => b.ls * b.lt - a.ls * a.lt)[0];
  let offcut: SheetLayout['offcut'] = null;
  if (big) {
    const [x0, y0] = xy(big.s, big.t);
    const [x1, y1] = xy(big.s + big.ls, big.t + big.lt);
    offcut = { x: quantize(x0), y: quantize(y0), w: quantize(x1 - x0), h: quantize(y1 - y0) };
  }
  return { placements, cuts, yield: area / (sheet.length * sheet.width), offcut };
}
