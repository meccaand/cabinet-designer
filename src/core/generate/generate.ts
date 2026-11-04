/**
 * Cabinet → parts. A pure function of the cabinet and its project (PLAN.md data flow).
 * Construction rules and formulas: docs/CONSTRUCTION.md.
 */
import { hardwareFor } from '../hardware';
import type { Cabinet, Project } from '../model';
import type { CabinetModel } from '../parts';
import { buildCarcass } from './carcass';
import { BuildContext, BuildError } from './context';
import { layoutFace, type LayoutRules, type Rect } from './face';
import { buildFaceFrame, buildFronts } from './fronts';
import { buildDividers, buildDrawers, buildShelves } from './interior';

export type GenerateResult = { ok: true; model: CabinetModel } | { ok: false; errors: string[] };

const SUPPORTED: readonly Cabinet['type'][] = ['base'];

export function generateCabinet(cabinet: Cabinet, project: Project): GenerateResult {
  if (!SUPPORTED.includes(cabinet.type)) {
    return { ok: false, errors: [`${cabinet.type} cabinets are not supported yet.`] };
  }
  try {
    return { ok: true, model: build(new BuildContext(cabinet, project)) };
  } catch (e) {
    if (e instanceof BuildError) return { ok: false, errors: [e.message] };
    throw e;
  }
}

function build(ctx: BuildContext): CabinetModel {
  const f = buildCarcass(ctx);
  const { fronts: fc, carcass, faceFrame: ff } = ctx.c;
  const frameless = carcass.style === 'frameless';
  const inset = fc.mount === 'inset';

  let zone: Rect;
  let rules: LayoutRules;
  if (frameless && !inset) {
    zone = { x0: fc.revealEdge, x1: f.W - fc.revealEdge, y0: f.y0, y1: f.y1 - fc.revealTopBase };
    rules = { pad: 0, rowGap: fc.revealBetween, columnGap: () => fc.revealBetween, members: false };
  } else if (frameless) {
    zone = { x0: f.t, x1: f.W - f.t, y0: f.bottomTop, y1: f.topUnderside };
    rules = {
      pad: 2 * fc.insetGap,
      rowGap: 0,
      columnGap: (divided) => (divided ? f.t : 0),
      members: false,
    };
  } else {
    const x0 = -ff.sideOverhang + ff.stileWidth;
    zone = {
      x0,
      x1: f.W + ff.sideOverhang - ff.stileWidth,
      y0: f.y0 + ff.railWidth,
      y1: f.y1 - ff.railWidth,
    };
    rules = { pad: 0, rowGap: ff.railWidth, columnGap: () => ff.mullionWidth, members: true };
  }
  if (zone.x1 - zone.x0 <= 0 || zone.y1 - zone.y0 <= 0) {
    throw new BuildError('No room left for doors or drawers.');
  }

  const layout = layoutFace(ctx.cabinet.face, zone, rules);
  if (!frameless) buildFaceFrame(ctx, f, layout);
  const { fronts, zFrontInner } = buildFronts(ctx, f, layout);
  const bays = buildDividers(ctx, f, layout);
  const slides = buildDrawers(ctx, f, layout, bays, zFrontInner);
  const adjustableShelves = buildShelves(ctx, f, layout, bays, zFrontInner);

  if (ctx.cabinet.endPanels.left || ctx.cabinet.endPanels.right) {
    ctx.warnings.push('End panels are not generated yet; they arrive with room layout.');
  }
  const hw = { fronts, slides, adjustableShelves };
  return {
    cabinetId: ctx.cabinet.id,
    parts: ctx.parts,
    joints: ctx.joints,
    ...hw,
    hardware: hardwareFor(hw, ctx.c, ctx.project.materials.hardware),
    warnings: ctx.warnings,
  };
}
