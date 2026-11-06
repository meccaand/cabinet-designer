/**
 * Cabinet → parts. A pure function of the cabinet and its project (PLAN.md data flow).
 * Construction rules and formulas: docs/CONSTRUCTION.md.
 */
import { hardwareFor } from '../hardware';
import type { Cabinet, Project } from '../model';
import type { CabinetModel } from '../parts';
import { blindPlan, buildBlindParts } from './blind';
import { buildCarcass, check, type CarcassFrame } from './carcass';
import { buildCorner } from './corner';
import { buildEndPanels } from './endPanels';
import { BuildContext, BuildError } from './context';
import { layoutFace, type LayoutRules, type Rect } from './face';
import { buildFaceFrame, buildFronts } from './fronts';
import { buildDrawers, buildPartitions, buildShelves } from './interior';
import { TYPE_TRAITS } from './traits';

export type GenerateResult = { ok: true; model: CabinetModel } | { ok: false; errors: string[] };

export function generateCabinet(cabinet: Cabinet, project: Project): GenerateResult {
  try {
    return { ok: true, model: build(new BuildContext(cabinet, project)) };
  } catch (e) {
    if (e instanceof BuildError) return { ok: false, errors: [e.message] };
    throw e;
  }
}

function build(ctx: BuildContext): CabinetModel {
  if (TYPE_TRAITS[ctx.cabinet.type].corner) return buildCorner(ctx);
  const f = buildCarcass(ctx);
  const frameless = ctx.c.carcass.style === 'frameless';
  const blind = blindPlan(ctx.cabinet, f);
  const { zone, rules, blindPanel, stiles } = faceZone(ctx, f, blind?.side, blind?.boundary);
  if (zone.x1 - zone.x0 <= 0 || zone.y1 - zone.y0 <= 0) {
    throw new BuildError('No room left for doors or drawers.');
  }

  const layout = layoutFace(ctx.cabinet.face, zone, rules);
  if (blind) {
    check(
      layout.leaves.every((l) => l.leaf.fill !== 'drawer'),
      'Blind corner cabinets cannot have drawers: the box would hit the blind side. Use a false front.',
    );
  }
  if (!frameless) buildFaceFrame(ctx, f, layout, stiles);
  const { fronts, zFrontInner } = buildFronts(ctx, f, layout);
  if (blind) buildBlindParts(ctx, f, blind, blindPanel, zone);
  buildEndPanels(ctx, f);
  const interior = buildPartitions(ctx, f, layout);
  const slides = buildDrawers(ctx, f, layout, interior, zFrontInner);
  const adjustableShelves = buildShelves(ctx, f, layout, interior, zFrontInner);

  const hw = { fronts, slides, adjustableShelves };
  return {
    cabinetId: ctx.cabinet.id,
    parts: ctx.parts,
    openings: layout.leaves.map((l) => ({ path: l.path, fill: l.leaf.fill, rect: l.rect })),
    joints: ctx.joints,
    ...hw,
    hardware: hardwareFor(hw, ctx.c, ctx.project.materials.hardware),
    warnings: ctx.warnings,
  };
}

/**
 * The part of the face the opening tree is laid out on, and how its children are spaced.
 *
 * Frameless overlay: fronts stop `revealEdge` from the cabinet edges; on a toe kick, fronts
 * start at the box bottom; under a counter they stop `revealTopBase` below the box top.
 * Frameless inset: the box opening. Face frame: inside the stiles and top/bottom rails.
 * A blind corner removes its blind portion from the zone.
 */
function faceZone(
  ctx: BuildContext,
  f: CarcassFrame,
  blindSide: 'left' | 'right' | undefined,
  boundary: number | undefined,
): {
  zone: Rect;
  rules: LayoutRules;
  blindPanel: Rect | null;
  stiles: { left: number; right: number };
} {
  const { fronts: fc, carcass, faceFrame: ff } = ctx.c;
  const inset = fc.mount === 'inset';
  const sw = ff.sideOverhang + ff.stileWidth;
  const stiles = { left: sw, right: sw };
  let zone: Rect;
  let rules: LayoutRules;
  let blindPanel: Rect | null = null;

  if (carcass.style === 'frameless' && !inset) {
    const bottom = f.traits.platform ? 0 : fc.revealEdge;
    const top = f.traits.counter ? fc.revealTopBase : fc.revealEdge;
    zone = { x0: fc.revealEdge, x1: f.W - fc.revealEdge, y0: f.y0 + bottom, y1: f.y1 - top };
    rules = {
      pad: 0,
      rowGap: () => fc.revealBetween,
      columnGap: () => fc.revealBetween,
      members: false,
    };
    if (blindSide && boundary !== undefined) {
      const half = fc.revealBetween / 2;
      blindPanel =
        blindSide === 'left' ? { ...zone, x1: boundary - half } : { ...zone, x0: boundary + half };
      zone =
        blindSide === 'left' ? { ...zone, x0: boundary + half } : { ...zone, x1: boundary - half };
    }
  } else if (carcass.style === 'frameless') {
    zone = { x0: f.t, x1: f.W - f.t, y0: f.bottomTop, y1: f.topUnderside };
    const gap = (divided: boolean) => (divided ? f.t : 0);
    rules = { pad: 2 * fc.insetGap, rowGap: gap, columnGap: gap, members: false };
    if (blindSide && boundary !== undefined) {
      const g = fc.insetGap;
      blindPanel =
        blindSide === 'left'
          ? { x0: f.t + g, x1: boundary - g, y0: zone.y0 + g, y1: zone.y1 - g }
          : { x0: boundary + g, x1: f.W - f.t - g, y0: zone.y0 + g, y1: zone.y1 - g };
      zone = blindSide === 'left' ? { ...zone, x0: boundary } : { ...zone, x1: boundary };
    }
  } else {
    if (blindSide === 'left' && boundary !== undefined) stiles.left = boundary + ff.sideOverhang;
    if (blindSide === 'right' && boundary !== undefined)
      stiles.right = f.W - boundary + ff.sideOverhang;
    check(
      Math.min(stiles.left, stiles.right) >= sw - 1e-6,
      'Blind width is narrower than a face-frame stile.',
    );
    zone = {
      x0: -ff.sideOverhang + stiles.left,
      x1: f.W + ff.sideOverhang - stiles.right,
      y0: f.y0 + ff.railWidth,
      y1: f.y1 - ff.railWidth,
    };
    rules = { pad: 0, rowGap: () => ff.railWidth, columnGap: () => ff.mullionWidth, members: true };
  }
  return { zone, rules, blindPanel, stiles };
}
