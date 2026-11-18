/**
 * Built-ins → ordinary cabinets, fillers and run parts (ADR-038, ADR-040). A pure function of
 * the project: compiled cabinets are never stored, so the datums they follow can't drift.
 *
 * Along a run, modules sit left to right from the run's offset (run coordinates: x along the
 * wall from the run's start, y up from the floor, z out from the wall, as for a cabinet).
 *
 * - A **section** is a base box under the countertop and, unless it is base-only, an upper box
 *   standing on the countertop, set back to `upperDepth`. Both boxes have the same width and
 *   stiles, so the stiles line up above and below. A section's `width` is its clear opening;
 *   its boxes are that plus their stiles.
 * - A **stile** module is the visible stile between two sections (each box carries half: split
 *   stiles) or at a section's end (that box carries all of it, e.g. for scribing). A section
 *   side with no stile module beside it gets the style's stile width, which adds to the run.
 * - A **pilaster** becomes a filler board, floor to the top line.
 * - An **obstruction** reserves its width and is drawn, nothing more.
 * - 'auto' sections share what the run's length leaves, equally.
 */
import { BuildContext, BuildError, generateCabinet } from '../generate';
import {
  cabinetConstruction,
  type BuiltIn,
  type Cabinet,
  type ConstructionDefaults,
  type Filler,
  type OpeningNode,
  type Project,
  type Run,
  type SectionModule,
  type Wall,
} from '../model';
import type { CabinetModel } from '../parts';
import { formatLength, inch, quantize, type Mm } from '../units';
import { wallFrames } from '../layout';
import type { Box } from '../geometry';
import { buildCountertop, type CountertopSegment } from './countertop';
import { buildRunTrim, type MouldingEnd, type MouldingSegment, type TrimPath } from './trim';
import { cornerAt, endSection as endModule, ownsBlindBase, strayPartner } from './corners';

/** The narrowest an 'auto' section may become. */
export const MIN_AUTO_WIDTH = inch(6);
/** Room around a TV in a media niche, each side (ADR-041). */
export const TV_CLEARANCE = inch(1);
/** Narrower corner fillers get a warning: doors on the two walls may hit (ADR-042). */
export const MIN_CORNER_FILLER = inch(2);

/** Where a compiled cabinet or filler came from. */
export interface CompiledSource {
  builtInId: string;
  runId: string;
  moduleId: string;
  level: 'base' | 'upper' | 'pilaster';
}

/** Space a run keeps clear, drawn but not built. */
export interface Obstruction {
  id: string;
  builtInId: string;
  runId: string;
  label: string;
  wallId: string;
  /** Along the wall, from its start. */
  offset: Mm;
  width: Mm;
  height: Mm;
  depth: Mm;
}

/**
 * What belongs to a run rather than one box, in run coordinates: the countertop, frieze and
 * corner fillers (parts, cut), the crown and base moulding (bought, by length), and picture
 * lights (bought, counted in `model.hardware`).
 */
export interface Assembly {
  id: string;
  builtInId: string;
  name: string;
  wallId: string;
  offset: Mm;
  model: CabinetModel;
  mouldings: MouldingSegment[];
  lights: Box[];
  /** For dimensioning the run in elevation (run coordinates): each section's clear opening and
   * each pilaster and opening, and the countertop and top lines. */
  guide: { spans: { x0: Mm; x1: Mm }[]; countertop: Mm; topLine: Mm };
}

export interface CompiledBuiltIn {
  cabinets: Cabinet[];
  fillers: Filler[];
  assemblies: Assembly[];
  obstructions: Obstruction[];
  sources: Map<string, CompiledSource>;
  /** Why (part of) the built-in can't be laid out. Box-level problems come from the generator. */
  errors: string[];
  /** Each module's place along its run (run coordinates): for the editor and drawings. */
  modules: Map<string, { x0: Mm; x1: Mm; width: Mm }>;
  /** Things that build but may not be what's wanted (a TV that won't fit its niche). */
  warnings: string[];
  /** Each media niche's clear opening, by its upper box's id. */
  niches: Map<string, { moduleId: string; width: Mm; height: Mm }>;
}

export function compileBuiltIn(project: Project, builtIn: BuiltIn): CompiledBuiltIn {
  const out: CompiledBuiltIn = {
    cabinets: [],
    fillers: [],
    assemblies: [],
    obstructions: [],
    sources: new Map(),
    errors: [],
    modules: new Map(),
    warnings: [],
    niches: new Map(),
  };
  const styled = { construction: {}, ...(builtIn.styleId && { styleId: builtIn.styleId }) };
  const c = cabinetConstruction(project, styled);
  if (c.carcass.style !== 'faceFrame') {
    out.errors.push(
      `${builtIn.name}: built-ins are face-frame construction. Choose a face-frame style.`,
    );
    return out;
  }
  const halves: WrapHalf[] = [];
  for (const run of builtIn.runs) {
    try {
      compileRun(project, builtIn, run, c, out, halves);
    } catch (e) {
      if (!(e instanceof BuildError)) throw e;
      const wall = project.room.walls.find((w) => w.id === run.wallId);
      out.errors.push(`${wall?.name ?? 'Run'}: ${e.message}`);
    }
  }
  for (const a of halves) {
    const b = halves.find((h) => h.cornerWallId === a.cornerWallId && h.side === 'left');
    if (a.side !== 'right' || !b) continue;
    try {
      wrapCorner(builtIn, a, b, out);
    } catch (e) {
      if (!(e instanceof BuildError)) throw e;
      out.errors.push(`${a.wall.name}: ${e.message}`);
    }
  }
  return out;
}

/** One run's end bay at a corner with wrap-around shelves (ADR-044). */
interface WrapHalf {
  /** The later wall: the corner is at its start. */
  cornerWallId: string;
  /** The run's end at the corner: 'right' for the earlier wall's run. */
  side: 'left' | 'right';
  run: Run;
  wall: Wall;
  section: SectionLayout;
  upperHeight: Mm;
  topLine: Mm;
  shelves: number;
}

/**
 * Wrap-around shelves: the two end bays at a corner become one L-shaped open shelving cabinet
 * (ADR-037) standing on the countertop, its run along the earlier wall and its return along
 * the later one. Each wing keeps its bay's outer stile; the corner stiles meet where the two
 * runs' upper faces cross.
 */
function wrapCorner(builtIn: BuiltIn, a: WrapHalf, b: WrapHalf, out: CompiledBuiltIn) {
  if (
    Math.abs(a.run.countertopHeight - b.run.countertopHeight) > 1e-6 ||
    Math.abs(a.topLine - b.topLine) > 1e-6
  ) {
    throw new BuildError(
      `wrap-around shelves need the runs on both walls at the same countertop height and top line.`,
    );
  }
  if (a.shelves !== b.shelves) {
    throw new BuildError(
      `wrap-around shelves need the same number of shelves in both corner bays (${a.section.module.name || 'this one'} has ${a.shelves}, ${b.section.module.name || 'the other'} has ${b.shelves}).`,
    );
  }
  const names = [a.section.module.name, b.section.module.name].filter(Boolean).join(' + ');
  const id = `${builtIn.id}/corner/${a.cornerWallId}`;
  const cabinet: Cabinet = {
    id,
    name: `${builtIn.name} · Corner shelves${names ? ` (${names})` : ''}`,
    type: 'lShelf',
    width: quantize(a.wall.length - a.run.offset - a.section.x0),
    height: a.upperHeight,
    depth: a.run.upperDepth,
    placement: {
      wallId: a.wall.id,
      offset: quantize(a.run.offset + a.section.x0),
      elevation: a.run.countertopHeight,
    },
    ...(builtIn.styleId && { styleId: builtIn.styleId }),
    // Standing on the countertop: no toe kick, and the run sets the outer stiles.
    construction: { faceFrame: { sideOverhang: 0 }, platform: { enabled: false } },
    face: { kind: 'leaf', fill: 'open', shelves: { count: a.shelves, adjustable: false } },
    endPanels: {
      left: a.section.module.endPanels.left,
      right: b.section.module.endPanels.right,
    },
    stiles: { left: a.section.stiles.left, right: b.section.stiles.right },
    corner: {
      returnWidth: quantize(b.run.offset + b.section.x0 + b.section.W),
      returnDepth: b.run.upperDepth,
    },
  };
  out.cabinets.push(cabinet);
  out.sources.set(id, {
    builtInId: builtIn.id,
    runId: a.run.id,
    moduleId: a.section.module.id,
    level: 'upper',
  });
}

interface SectionLayout {
  module: SectionModule;
  /** Box stiles (face frame), excluding any side overhang. */
  stiles: { left: Mm; right: Mm };
  /** Left edge of the boxes, in run coordinates, and their width. */
  x0: Mm;
  W: Mm;
}

function compileRun(
  project: Project,
  builtIn: BuiltIn,
  run: Run,
  c: ConstructionDefaults,
  out: CompiledBuiltIn,
  halves: WrapHalf[],
): void {
  const found = project.room.walls.find((w) => w.id === run.wallId);
  if (!found) throw new BuildError('its wall no longer exists.');
  const wall: Wall = found;
  const units = project.units;
  const f = (v: Mm) => formatLength(v, units);
  const mods = run.modules;
  const sw = c.faceFrame.stileWidth;
  const isSection = (i: number) => mods[i]?.kind === 'section';

  // ---- Widths: stiles, then 'auto' sections -----------------------------------------------
  /** The share of the stile module at `i` that belongs to a section on one side of it. */
  const stileShare = (i: number): Mm => {
    const m = mods[i];
    if (m?.kind !== 'stile') return 0;
    return isSection(i - 1) && isSection(i + 1) ? m.width / 2 : m.width;
  };
  mods.forEach((m, i) => {
    if (m.kind === 'stile' && !isSection(i - 1) && !isSection(i + 1)) {
      throw new BuildError('a stile needs a section beside it.');
    }
  });
  const implied = (i: number) => {
    const left = mods[i - 1]?.kind === 'stile' ? 0 : sw;
    const right = mods[i + 1]?.kind === 'stile' ? 0 : sw;
    return { left, right };
  };
  const autos = mods.filter((m) => m.kind === 'section' && m.width === 'auto').length;
  const fixed = mods.reduce((sum, m, i) => {
    if (m.kind !== 'section') return sum + m.width;
    const imp = implied(i);
    return sum + imp.left + imp.right + (m.width === 'auto' ? 0 : m.width);
  }, 0);
  const autoWidth = autos ? quantize((run.length - fixed) / autos) : 0;
  if (autos && autoWidth < MIN_AUTO_WIDTH) {
    throw new BuildError(
      `the run is ${f(run.length)} long, which leaves ${f(Math.max(0, autoWidth))} for each auto-width section: lengthen the run or narrow other modules.`,
    );
  }

  // ---- Positions ---------------------------------------------------------------------------
  const sections: SectionLayout[] = [];
  const spans: { x0: Mm; x1: Mm }[] = [];
  let x = 0;
  mods.forEach((m, i) => {
    if (m.kind !== 'section') {
      out.modules.set(m.id, { x0: x, x1: x + m.width, width: m.width });
      if (m.kind !== 'stile') spans.push({ x0: x, x1: quantize(x + m.width) });
      if (m.kind === 'pilaster') pilaster(m.id, m.width, m.depth, x);
      if (m.kind === 'obstruction') {
        out.obstructions.push({
          id: `${builtIn.id}/${m.id}`,
          builtInId: builtIn.id,
          runId: run.id,
          label: m.label,
          wallId: wall.id,
          offset: quantize(run.offset + x),
          width: m.width,
          height: m.height,
          depth: run.baseDepth,
        });
      }
      x = quantize(x + m.width);
      return;
    }
    const width = m.width === 'auto' ? autoWidth : m.width;
    const imp = implied(i);
    const stiles = {
      left: imp.left || stileShare(i - 1),
      right: imp.right || stileShare(i + 1),
    };
    const x0 = quantize(x + imp.left - stiles.left);
    const W = quantize(stiles.left + width + stiles.right);
    const shared = (side: 'left' | 'right') =>
      side === 'left'
        ? mods[i - 1]?.kind === 'stile' && isSection(i - 2)
        : mods[i + 1]?.kind === 'stile' && isSection(i + 2);
    for (const side of ['left', 'right'] as const) {
      if (m.endPanels[side] && shared(side)) {
        throw new BuildError(
          `${m.name || 'a section'} has an end panel on its ${side} side, where it meets the next section.`,
        );
      }
    }
    sections.push({ module: m, stiles, x0, W });
    spans.push({ x0: quantize(x + imp.left), x1: quantize(x + imp.left + width) });
    const footprint = imp.left + width + imp.right;
    out.modules.set(m.id, { x0: x, x1: quantize(x + footprint), width });
    x = quantize(x + footprint);
  });

  // ---- Corners with the run on the adjoining wall (ADR-042, ADR-044) -----------------------
  const runEnd = x;
  const wallEnd = quantize(wall.length - run.offset);
  const last = mods.length - 1;
  const partner = {
    left: run.ends.left === 'corner' ? cornerPartner(project, builtIn, run, 'left') : null,
    right: run.ends.right === 'corner' ? cornerPartner(project, builtIn, run, 'right') : null,
  };
  const corner = {
    left: partner.left ? cornerAt(builtIn, run.wallId) : null,
    right: partner.right ? cornerAt(builtIn, partner.right.wallId) : null,
  };
  const boxed = (i: number) => mods[i]?.kind === 'section' || mods[i]?.kind === 'stile';
  const endSection = (side: 'left' | 'right') => (side === 'left' ? sections[0] : sections.at(-1));
  /** The end section, when it is at the very end of the run (only stiles beyond it). */
  const cornerSection = (side: 'left' | 'right') =>
    boxed(side === 'left' ? 0 : last) ? endSection(side) : undefined;
  /** The end section whose base box carries on into the corner: a blind base. */
  const blindAt = (side: 'left' | 'right') => {
    const k = corner[side];
    if (!k || !ownsBlindBase(k, side) || !mods.length) return undefined;
    const s = cornerSection(side);
    if (!s) {
      throw new BuildError(
        `the blind corner base at its ${side} end needs a section there, to carry on into the corner.`,
      );
    }
    return s;
  };
  const blind = { left: blindAt('left'), right: blindAt('right') };
  if (blind.left && blind.left === blind.right) {
    throw new BuildError(
      'its only section would be a blind corner at both ends: add a section, or make one corner dead.',
    );
  }
  /** The end section whose upper becomes one wing of wrap-around shelves. */
  const wrapAt = (side: 'left' | 'right') => {
    const k = corner[side];
    const other = partner[side];
    if (k?.upper !== 'wrap' || !other || !mods.length || !other.modules.length) return undefined;
    const s = cornerSection(side);
    if (s?.module.upper?.kind !== 'openBay') {
      throw new BuildError(
        `wrap-around shelves need an open bay at its ${side} end, in the corner: change the module there, or the corner's uppers.`,
      );
    }
    // The other run reports its own end.
    const theirs = endModule(other.modules, side === 'left' ? 'right' : 'left');
    return theirs?.upper?.kind === 'openBay' ? s : undefined;
  };
  const wrap = { left: wrapAt('left'), right: wrapAt('right') };

  // ---- Boxes -------------------------------------------------------------------------------
  const plyT = thickness(project, c, 'carcass');
  const baseHeight = quantize(run.countertopHeight - plyT);
  const topLine = quantize(wall.height - builtIn.topGap);
  const upperHeight = quantize(topLine - run.countertopHeight);
  if (sections.some((s) => s.module.upper) && upperHeight <= 0) {
    throw new BuildError(
      `the upper bays would have no height: the top line (${f(topLine)}) is at or below the countertop (${f(run.countertopHeight)}).`,
    );
  }
  for (const s of sections) {
    const m = s.module;
    const base = `${builtIn.id}/${m.id}`;
    const label = `${builtIn.name} · ${m.name || 'Section'}`;
    const common = {
      width: s.W,
      ...(builtIn.styleId && { styleId: builtIn.styleId }),
      // The run sets the stiles; a side overhang would push frames into their neighbours.
      construction: { faceFrame: { sideOverhang: 0 } },
      endPanels: m.endPanels,
      stiles: s.stiles,
    };
    const leaf = (doors: 1 | 2, hinge?: 'left' | 'right'): OpeningNode => ({
      kind: 'leaf',
      fill: doors === 2 ? 'doorPair' : 'door',
      ...(hinge && doors === 1 && { hinge }),
      shelves: { count: m.base.shelves, adjustable: true },
    });
    const groups = m.base.groups;
    const [only] = groups;
    // A blind base carries on past the run's end to the wall, behind the other run; its blind
    // stile covers the end stile and everything to the wall.
    const blindSide = blind.left === s ? 'left' : blind.right === s ? 'right' : null;
    const past = blindSide === 'left' ? s.x0 + run.offset : wallEnd - (s.x0 + s.W);
    const baseX0 = blindSide === 'left' ? -run.offset : s.x0;
    const baseCabinet: Cabinet = {
      ...common,
      id: `${base}/base`,
      name: `${label} base`,
      type: blindSide ? 'blindBase' : 'base',
      ...(blindSide && {
        width: quantize(s.W + past),
        blind: {
          side: blindSide,
          blindWidth: quantize(s.stiles[blindSide] + past),
          // The other run's corner filler stands where a pull filler would.
          pullFillerWidth: 0,
        },
      }),
      height: baseHeight,
      depth: run.baseDepth,
      placement: { wallId: wall.id, offset: quantize(run.offset + baseX0), elevation: 0 },
      face:
        groups.length === 1 && only
          ? leaf(only.doors, only.hinge)
          : {
              kind: 'split',
              dir: 'columns',
              children: groups.map((g) => ({
                size: 'auto' as const,
                node: leaf(g.doors, g.hinge),
              })),
            },
    };
    out.cabinets.push(baseCabinet);
    out.sources.set(baseCabinet.id, {
      builtInId: builtIn.id,
      runId: run.id,
      moduleId: m.id,
      level: 'base',
    });
    const wrapSide = wrap.left === s ? 'left' : wrap.right === s ? 'right' : null;
    if (m.upper && wrapSide) {
      halves.push({
        cornerWallId: wrapSide === 'left' ? wall.id : (partner.right?.wallId ?? ''),
        side: wrapSide,
        run,
        wall,
        section: s,
        upperHeight,
        topLine,
        shelves: m.upper.kind === 'openBay' ? (m.upper.shelves ?? run.shelves) : run.shelves,
      });
    } else if (m.upper) {
      const upper: Cabinet = {
        ...common,
        id: `${base}/upper`,
        name: `${label} upper`,
        type: 'wall',
        height: upperHeight,
        depth: run.upperDepth,
        placement: {
          wallId: wall.id,
          offset: quantize(run.offset + s.x0),
          elevation: run.countertopHeight,
        },
        // Fixed shelves at the run's linked lines (or the bay's own count), evenly spaced.
        face: {
          kind: 'leaf',
          fill: 'open',
          shelves: {
            count: m.upper.kind === 'openBay' ? (m.upper.shelves ?? run.shelves) : run.shelves,
            adjustable: false,
          },
        },
      };
      if (m.upper.kind === 'mediaNiche') {
        upper.face = nicheFace(upper, m.upper, s.W - s.stiles.left - s.stiles.right, m);
      }
      out.cabinets.push(upper);
      out.sources.set(upper.id, {
        builtInId: builtIn.id,
        runId: run.id,
        moduleId: m.id,
        level: 'upper',
      });
    }
  }

  // ---- Corner fillers -------------------------------------------------------------------------
  /** Where the other run's face plane at `depth` crosses this run (run coordinates). */
  const across = (side: 'left' | 'right', depth: Mm) =>
    quantize(side === 'left' ? depth - run.offset : wallEnd - depth);
  // End panels, with any applied frame (ADR-041).
  const te =
    thickness(project, c, 'door') + (c.endPanel.style === 'framed' ? c.endPanel.frameThickness : 0);
  const fillers: { level: 'base' | 'upper'; x0: Mm; x1: Mm }[] = [];
  for (const side of ['left', 'right'] as const) {
    const other = partner[side];
    if (!other || !boxed(side === 'left' ? 0 : last)) continue;
    const here = side === 'left' ? 0 : runEnd;
    const face = across(side, other.baseDepth);
    const width = side === 'left' ? here - face : face - here;
    if (width < -1e-6) {
      throw new BuildError(
        `its ${side} end runs into the boxes on the other wall: it must stop at least ${f(other.baseDepth)} from the corner.`,
      );
    }
    if (endSection(side)?.module.endPanels[side]) {
      throw new BuildError(`an end panel can't go at the ${side} end, in the corner.`);
    }
    // A blind box fills its own side of the corner; the other run keeps its filler.
    if (!blind[side] && width < MIN_CORNER_FILLER - 1e-6) {
      out.warnings.push(
        `${wall.name}: the corner filler at the ${side} end is only ${f(Math.max(0, width))}: doors on the two walls may hit. Leave at least ${f(MIN_CORNER_FILLER)}.`,
      );
    }
    if (width > 1e-6 && !blind[side]) {
      fillers.push({ level: 'base', x0: Math.min(here, face), x1: Math.max(here, face) });
    }
    const upperFace = across(side, other.upperDepth);
    if (endSection(side)?.module.upper && !wrap[side] && Math.abs(upperFace - here) > 1e-6) {
      fillers.push({
        level: 'upper',
        x0: Math.min(here, upperFace),
        x1: Math.max(here, upperFace),
      });
    }
  }
  const atStart = (side: 'left' | 'right') => {
    const s = endSection(side);
    if (!s || !s.module.endPanels[side]) return side === 'left' ? 0 : runEnd;
    const flush = side === 'left' ? s.x0 <= 1e-6 : s.x0 + s.W >= runEnd - 1e-6;
    if (!flush) return side === 'left' ? 0 : runEnd;
    return quantize(side === 'left' ? s.x0 - te : s.x0 + s.W + te);
  };
  const endKind = (side: 'left' | 'right'): MouldingEnd =>
    run.ends[side] === 'open'
      ? 'outsideCorner'
      : run.ends[side] === 'corner'
        ? 'insideCorner'
        : 'square';

  // ---- Countertop: continuous over neighbouring sections, stopping at anything else ---------
  const segments: CountertopSegment[] = [];
  const basePaths: TrimPath[] = [];
  let open: { first: number; last: number } | null = null;
  const close = () => {
    const seg = open;
    open = null;
    if (!seg) return;
    const inSeg = sections.filter((s) => {
      const i = mods.indexOf(s.module);
      return i >= seg.first && i <= seg.last;
    });
    const first = inSeg[0];
    const lastS = inSeg.at(-1);
    if (!first || !lastS) return;
    const x0 = quantize(first.x0 - (first.module.endPanels.left ? te : 0));
    const x1 = quantize(lastS.x0 + lastS.W + (lastS.module.endPanels.right ? te : 0));
    const startsRun = seg.first === 0;
    const endsRun = seg.last === last;
    // At a corner the earlier wall's top runs through to the wall; the later one butts into
    // its front edge.
    const left = startsRun && partner.left;
    const right = endsRun && partner.right;
    segments.push({
      x0: left ? across('left', left.baseDepth + left.countertopOverhang) : x0,
      x1: right ? wallEnd : x1,
      exposedLeft: startsRun && run.ends.left === 'open',
      exposedRight: endsRun && run.ends.right === 'open',
      joints: inSeg.slice(1).map((s) => s.x0),
    });
    basePaths.push({
      x0: left ? across('left', left.baseDepth) : x0,
      x1: right ? across('right', right.baseDepth) : x1,
      left: startsRun ? endKind('left') : 'square',
      right: endsRun ? endKind('right') : 'square',
    });
  };
  mods.forEach((m, i) => {
    if (m.kind === 'section' || m.kind === 'stile') open = { first: open?.first ?? i, last: i };
    else close();
  });
  close();

  // ---- Frieze and crown: along the whole run, except across obstructions that stop them ------
  const friezePaths: (TrimPath & { returnLeft: boolean; returnRight: boolean })[] = [];
  const crownPaths: TrimPath[] = [];
  let from: number | null = null;
  const closePath = (to: number) => {
    if (from === null) return;
    const i = from;
    from = null;
    const xi = out.modules.get(mods[i]?.id ?? '')?.x0 ?? 0;
    const xj = out.modules.get(mods[to]?.id ?? '')?.x1 ?? runEnd;
    const startsRun = i === 0;
    const endsRun = to === last;
    const l = startsRun ? partner.left : null;
    const r = endsRun ? partner.right : null;
    const left = startsRun ? endKind('left') : 'square';
    const right = endsRun ? endKind('right') : 'square';
    const x0 = startsRun ? atStart('left') : xi;
    const x1 = endsRun ? atStart('right') : xj;
    friezePaths.push({
      x0: l ? across('left', l.upperDepth) : x0,
      x1: r ? wallEnd : x1,
      left,
      right,
      returnLeft: left === 'outsideCorner',
      returnRight: right === 'outsideCorner',
    });
    crownPaths.push({
      x0: l ? across('left', l.upperDepth) : x0,
      x1: r ? across('right', r.upperDepth) : x1,
      left,
      right,
    });
  };
  mods.forEach((m, i) => {
    if (m.kind === 'obstruction' && m.crown === 'stop') closePath(i - 1);
    else from ??= i;
  });
  closePath(last);

  const friezeHeight = quantize(builtIn.topGap - builtIn.trim.crownHeight);
  if (friezeHeight < -1e-6) {
    throw new BuildError(
      `the crown (${f(builtIn.trim.crownHeight)}) is taller than the space above the uppers (${f(builtIn.topGap)}).`,
    );
  }
  // Over the box; a wrapped bay's over its opening, which runs on to the corner stile where
  // the two runs' uppers meet.
  const lights = sections
    .filter((s) => s.module.pictureLight && s.module.upper)
    .map((s) => {
      if (wrap.left === s && partner.left) {
        return quantize(
          (across('left', partner.left.upperDepth) + sw + s.x0 + s.W - s.stiles.right) / 2,
        );
      }
      if (wrap.right === s && partner.right) {
        return quantize(
          (s.x0 + s.stiles.left + across('right', partner.right.upperDepth) - sw) / 2,
        );
      }
      return quantize(s.x0 + s.W / 2);
    });

  if (mods.length) {
    const carrier: Cabinet = {
      id: run.id,
      name: `${builtIn.name} run (${wall.name})`,
      type: 'base',
      width: Math.max(1, x),
      height: run.countertopHeight,
      depth: run.baseDepth,
      placement: { wallId: wall.id, offset: run.offset, elevation: 0 },
      construction: {},
      ...(builtIn.styleId && { styleId: builtIn.styleId }),
      face: { kind: 'leaf', fill: 'open' },
      endPanels: { left: false, right: false },
    };
    const ctx = new BuildContext(carrier, project);
    if (segments.length) buildCountertop(ctx, run, segments);
    const trim = buildRunTrim(ctx, {
      run,
      frieze: friezePaths,
      crown: crownPaths,
      base: basePaths,
      topLine,
      ceiling: wall.height,
      friezeHeight: Math.max(0, friezeHeight),
      crownHeight: builtIn.trim.crownHeight,
      crownProjection: builtIn.trim.crownProjection,
      baseMouldingHeight: builtIn.trim.baseMouldingHeight,
      fillers,
      baseTop: baseHeight,
      lights,
      lightWidth: builtIn.trim.pictureLightWidth,
      railWidth: c.faceFrame.railWidth,
    });
    const lightItem = project.materials.hardware.find((h) => h.kind === 'pictureLight');
    out.assemblies.push({
      id: run.id,
      builtInId: builtIn.id,
      name: carrier.name,
      wallId: wall.id,
      offset: run.offset,
      model: {
        cabinetId: run.id,
        parts: ctx.parts,
        openings: [],
        joints: ctx.joints,
        fronts: [],
        handles: [],
        slides: [],
        adjustableShelves: 0,
        hardware: lights.length
          ? [
              {
                kind: 'pictureLight',
                itemId: lightItem?.id ?? null,
                name: lightItem?.name ?? 'Picture light',
                qty: lights.length,
              },
            ]
          : [],
        warnings: ctx.warnings,
      },
      mouldings: trim.mouldings,
      lights: trim.lights,
      guide: { spans, countertop: run.countertopHeight, topLine },
    });
  }

  /**
   * A media niche (ADR-041): the upper box split into a bridge of cubbies over the TV opening
   * by a fixed shelf whose top is exactly the top of the flanking bays' shelf on the chosen
   * line. The line is read from an open bay of the same size built by the generator itself, so
   * the two can't disagree.
   */
  function nicheFace(
    probe: Cabinet,
    niche: Extract<SectionModule['upper'], { kind: 'mediaNiche' }>,
    openingWidth: Mm,
    module: SectionModule,
  ): OpeningNode {
    const where = module.name || 'The TV section';
    if (run.shelves < niche.bridgeLine) {
      throw new BuildError(
        `${where}: the bridge lines up with shelf line ${niche.bridgeLine} from the top, but the run's bays have ${run.shelves} shelves.`,
      );
    }
    const r = generateCabinet(probe, project);
    if (!r.ok) throw new BuildError(`${where}: ${r.errors.join(' ')}`);
    const shelfTops = r.model.parts
      .filter((p) => p.role === 'shelfFixed')
      .map((p) => p.bounds.max.y)
      .sort((a, b) => b - a);
    const line = shelfTops[niche.bridgeLine - 1];
    const rail = (which: 'top' | 'bottom') =>
      r.model.parts.find((p) => p.id === `${probe.id}/ff/rail/${which}`)?.bounds;
    const top = rail('top');
    const bottom = rail('bottom');
    if (line === undefined || !top || !bottom) {
      throw new BuildError(`${where}: couldn't find the shelf line for the bridge.`);
    }
    const bridgeHeight = quantize(top.min.y - line);
    const nicheHeight = quantize(line - c.faceFrame.railWidth - bottom.max.y);
    if (bridgeHeight <= 0 || nicheHeight <= 0) {
      throw new BuildError(`${where}: no room for both the bridge and the niche.`);
    }
    out.niches.set(probe.id, { moduleId: module.id, width: openingWidth, height: nicheHeight });
    if (niche.tvSize !== null) {
      const tvW = (niche.tvSize * 16) / Math.hypot(16, 9);
      const tvH = (niche.tvSize * 9) / Math.hypot(16, 9);
      const needW = tvW + 2 * TV_CLEARANCE;
      const needH = tvH + 2 * TV_CLEARANCE;
      if (needW > openingWidth + 1e-6 || needH > nicheHeight + 1e-6) {
        out.warnings.push(
          `${where}: a ${f(niche.tvSize)} TV (${f(tvW)} × ${f(tvH)}) needs ${f(needW)} × ${f(needH)} with ${f(TV_CLEARANCE)} all round, but the niche is ${f(openingWidth)} × ${f(nicheHeight)}.`,
        );
      }
    }
    const open: OpeningNode = { kind: 'leaf', fill: 'open' };
    const bridge: OpeningNode =
      niche.cubbies === 1
        ? open
        : {
            kind: 'split',
            dir: 'columns',
            divider: true,
            children: Array.from({ length: niche.cubbies }, () => ({
              size: 'auto' as const,
              node: open,
            })),
          };
    return {
      kind: 'split',
      dir: 'rows',
      divider: true,
      children: [
        { size: bridgeHeight, node: bridge },
        { size: 'auto', node: open },
      ],
    };
  }

  function pilaster(id: string, width: Mm, depth: Mm, at: Mm) {
    const filler: Filler = {
      id: `${builtIn.id}/${id}`,
      wallId: wall.id,
      offset: quantize(run.offset + at),
      width,
      height: quantize(wall.height - builtIn.topGap),
      elevation: 0,
      depth,
      name: 'Pilaster',
      ...(builtIn.styleId && { styleId: builtIn.styleId }),
    };
    out.fillers.push(filler);
    out.sources.set(filler.id, {
      builtInId: builtIn.id,
      runId: run.id,
      moduleId: id,
      level: 'pilaster',
    });
  }
}

/**
 * The run on the adjoining wall that this run's `side` end meets round an inside corner: on the
 * wall before (left) or after (right), in the same built-in, with its facing end set to meet.
 */
function cornerPartner(project: Project, builtIn: BuiltIn, run: Run, side: 'left' | 'right'): Run {
  const frames = wallFrames(project.room);
  const i = frames.findIndex((fr) => fr.wall.id === run.wallId);
  const frame = frames[i];
  const inside = side === 'left' ? frame?.startCorner : frame?.endCorner;
  const next = inside === 'inside' ? frames[side === 'left' ? i - 1 : i + 1] : undefined;
  if (!frame || !next) {
    throw new BuildError(
      `its ${side} end is set to meet the run on the next wall, but ${frame?.wall.name ?? 'its wall'} doesn't ${side === 'left' ? 'start' : 'end'} at an inside corner.`,
    );
  }
  const facing = side === 'left' ? 'right' : 'left';
  const other = builtIn.runs.find((r) => r.wallId === next.wall.id && r.ends[facing] === 'corner');
  if (!other) {
    const stray = strayPartner(project, builtIn, run, side);
    throw new BuildError(
      stray
        ? `its ${side} end is set to meet the run on ${next.wall.name}, but that run is in “${stray.builtIn.name}”. Runs meet round a corner only within one built-in: join the two in this built-in's run editor.`
        : `its ${side} end is set to meet a run round the corner, but no run on ${next.wall.name} has its ${facing} end set to meet it.`,
    );
  }
  return other;
}

function thickness(project: Project, c: ConstructionDefaults, role: 'carcass' | 'door'): Mm {
  const id = c.materials[role];
  const m = [...project.materials.sheets, ...project.materials.solids].find((x) => x.id === id);
  if (!m) throw new BuildError(`No sheet or solid stock "${id}" for ${role}.`);
  return m.thickness;
}

/** Built-ins expanded: the project with compiled cabinets and fillers added, plus run parts. */
export interface ExpandedProject {
  project: Project;
  sources: ReadonlyMap<string, CompiledSource>;
  assemblies: Assembly[];
  obstructions: Obstruction[];
  errors: ReadonlyMap<string, string[]>;
  modules: ReadonlyMap<string, { x0: Mm; x1: Mm; width: Mm }>;
  /** By built-in id. */
  warnings: ReadonlyMap<string, string[]>;
  /** Each media niche's clear opening, by module id. */
  niches: ReadonlyMap<string, { width: Mm; height: Mm }>;
}

/**
 * The project as built: its own cabinets and fillers, then every built-in's. `compile` lets the
 * caller cache per built-in (compiled objects keep their identity, so their parts stay cached).
 */
export function expandProject(
  project: Project,
  compile: (project: Project, b: BuiltIn) => CompiledBuiltIn = compileBuiltIn,
): ExpandedProject {
  if (project.builtIns.length === 0) {
    return {
      project,
      sources: new Map(),
      assemblies: [],
      obstructions: [],
      errors: new Map(),
      modules: new Map(),
      warnings: new Map(),
      niches: new Map(),
    };
  }
  const compiled = project.builtIns.map((b) => [b, compile(project, b)] as const);
  const sources = new Map<string, CompiledSource>();
  const modules = new Map<string, { x0: Mm; x1: Mm; width: Mm }>();
  const niches = new Map<string, { width: Mm; height: Mm }>();
  for (const [, r] of compiled) {
    r.sources.forEach((v, k) => sources.set(k, v));
    r.modules.forEach((v, k) => modules.set(k, v));
    r.niches.forEach((v) => niches.set(v.moduleId, { width: v.width, height: v.height }));
  }
  return {
    project: {
      ...project,
      cabinets: [...project.cabinets, ...compiled.flatMap(([, r]) => r.cabinets)],
      fillers: [...project.fillers, ...compiled.flatMap(([, r]) => r.fillers)],
    },
    sources,
    assemblies: compiled.flatMap(([, r]) => r.assemblies),
    obstructions: compiled.flatMap(([, r]) => r.obstructions),
    errors: new Map(compiled.map(([b, r]) => [b.id, r.errors])),
    modules,
    warnings: new Map(compiled.map(([b, r]) => [b.id, r.warnings])),
    niches,
  };
}
