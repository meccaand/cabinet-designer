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
import { buildCountertop, type CountertopSegment } from './countertop';

/** The narrowest an 'auto' section may become. */
export const MIN_AUTO_WIDTH = inch(6);
/** Room around a TV in a media niche, each side (ADR-041). */
export const TV_CLEARANCE = inch(1);

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

/** Parts that belong to a run rather than one box (the countertop), in run coordinates. */
export interface Assembly {
  id: string;
  builtInId: string;
  name: string;
  wallId: string;
  offset: Mm;
  model: CabinetModel;
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
  for (const run of builtIn.runs) {
    try {
      compileRun(project, builtIn, run, c, out);
    } catch (e) {
      if (!(e instanceof BuildError)) throw e;
      const wall = project.room.walls.find((w) => w.id === run.wallId);
      out.errors.push(`${wall?.name ?? 'Run'}: ${e.message}`);
    }
  }
  return out;
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
  let x = 0;
  mods.forEach((m, i) => {
    if (m.kind !== 'section') {
      out.modules.set(m.id, { x0: x, x1: x + m.width, width: m.width });
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
    const footprint = imp.left + width + imp.right;
    out.modules.set(m.id, { x0: x, x1: quantize(x + footprint), width });
    x = quantize(x + footprint);
  });

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
    const baseCabinet: Cabinet = {
      ...common,
      id: `${base}/base`,
      name: `${label} base`,
      type: 'base',
      height: baseHeight,
      depth: run.baseDepth,
      placement: { wallId: wall.id, offset: quantize(run.offset + s.x0), elevation: 0 },
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
    if (m.upper) {
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

  // ---- Countertop: continuous over neighbouring sections, stopping at anything else ---------
  const segments: CountertopSegment[] = [];
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
    const last = inSeg.at(-1);
    if (first && last) {
      // End panels, with any applied frame (ADR-041).
      const te =
        thickness(project, c, 'door') +
        (c.endPanel.style === 'framed' ? c.endPanel.frameThickness : 0);
      segments.push({
        x0: quantize(first.x0 - (first.module.endPanels.left ? te : 0)),
        x1: quantize(last.x0 + last.W + (last.module.endPanels.right ? te : 0)),
        exposedLeft: seg.first === 0 && run.ends.left === 'open',
        exposedRight: seg.last === mods.length - 1 && run.ends.right === 'open',
        joints: inSeg.slice(1).map((s) => s.x0),
      });
    }
  };
  mods.forEach((m, i) => {
    if (m.kind === 'section' || m.kind === 'stile') open = { first: open?.first ?? i, last: i };
    else close();
  });
  close();
  if (segments.length) {
    const carrier: Cabinet = {
      id: run.id,
      name: `${builtIn.name} countertop (${wall.name})`,
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
    buildCountertop(ctx, run, segments);
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
        hardware: [],
        warnings: ctx.warnings,
      },
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
