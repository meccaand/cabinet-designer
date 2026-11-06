/**
 * Carcass: sides, bottom, top or stretchers, back, and the toe-kick platform.
 * Formulas are documented in docs/CONSTRUCTION.md; coordinates in geometry/box.ts.
 */
import { box } from '../geometry';
import type { Part } from '../parts';
import { quantize, type Mm } from '../units';
import { BuildError, type BuildContext } from './context';
import { hasToeKick, TYPE_TRAITS, type TypeTraits } from './traits';

/** Derived carcass dimensions shared by the face, drawer and shelf steps. */
export interface CarcassFrame {
  W: Mm;
  H: Mm;
  D: Mm;
  /** Carcass panel thickness. */
  t: Mm;
  /** Box bottom (top of the platform) and box top. */
  y0: Mm;
  y1: Mm;
  /** Front of the box (= back face of the face frame, or D when frameless). */
  Dbox: Mm;
  /** Face-frame thickness, 0 when frameless. */
  ft: Mm;
  /** Inside faces of the box: x from t to W − t. */
  bottomTop: Mm;
  topUnderside: Mm;
  /** Front face of the back panel. */
  zBackInner: Mm;
  /** Back of the usable interior: the back panel, or the hanging rail when it is inside. */
  zInterior: Mm;
  /** How far top/bottom/shelves extend into the sides, 0 for butt/pocket. */
  engage: Mm;
  /** Joint kind for panels at the ends of the sides vs. between them. */
  endJoint: 'rabbet' | null;
  midJoint: 'dado' | null;
  sides: { left: Part; right: Part };
  bottom: Part;
  /** Full top panel, or null when the top is two stretchers. */
  top: Part | null;
  back: Part;
  /** The type's traits, with `platform` false when this cabinet's toe kick is turned off. */
  traits: TypeTraits;
}

export function buildCarcass(ctx: BuildContext): CarcassFrame {
  const { cabinet, c } = ctx;
  const traits = { ...TYPE_TRAITS[cabinet.type], platform: hasToeKick(cabinet.type, c.platform) };
  const W = cabinet.width;
  const H = cabinet.height;
  const D = cabinet.depth;
  const t = ctx.thickness('carcass');
  const bt = ctx.thickness('back');
  const frameless = c.carcass.style === 'frameless';
  const ft = frameless ? 0 : ctx.thickness('faceFrame');
  const Dbox = quantize(D - ft);
  const P = traits.platform ? c.platform.height : 0;
  const y0 = P;
  const y1 = H;

  const housed = c.carcass.joinery === 'dado' || c.carcass.joinery === 'rabbet';
  const engage = housed ? c.carcass.dadoDepth : 0;
  check(engage < t, `Dado/rabbet depth must be less than the ${fmt(t)} mm panel thickness.`);
  check(W - 2 * t > 0, 'Cabinet is too narrow for its side panels.');
  check(y1 - y0 > 2 * t, 'Cabinet is too short once the platform and panels are subtracted.');

  // Back: where panels start (z) and the back's own bounds.
  const back = c.carcass.back;
  const rd = c.carcass.backRabbetDepth;
  const gd = c.carcass.backGrooveDepth;
  const gs = c.carcass.backGrooveSetback;
  if (back === 'inset') check(rd < t, 'Back rabbet depth must be less than the side thickness.');
  if (back === 'dado') {
    check(gd < t, 'Back groove depth must be less than the panel thickness.');
    check(gs + bt < Dbox - t, 'Back groove setback leaves no room for the cabinet.');
  }
  /** Back edge of the sides. */
  const zSide0 = back === 'applied' ? bt : 0;
  /** Back edge of bottom/top/stretchers. */
  const zPanel0 = back === 'dado' ? 0 : bt;
  const zBackInner = back === 'dado' ? gs + bt : bt;

  // Bottom: frameless sits at the end of the sides; face frame is raised flush with the rail top.
  const raise = frameless ? 0 : Math.max(0, c.faceFrame.railWidth - t);
  const bottomY0 = quantize(y0 + raise);
  const bottomTop = quantize(bottomY0 + t);
  const topUnderside = quantize(y1 - t);
  check(topUnderside - bottomTop > 0, 'No interior height left between bottom and top.');
  const bottomJoint = raise > 0 ? (housed ? 'dado' : null) : housed ? 'rabbet' : null;

  // Sides
  const left = ctx.add({
    id: 'side/L',
    role: 'side',
    name: 'Left side',
    materialRole: 'carcass',
    bounds: box(0, t, y0, y1, zSide0, Dbox),
    lengthAxis: 'y',
    thicknessAxis: 'x',
    ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
  });
  const right = ctx.add({
    id: 'side/R',
    role: 'side',
    name: 'Right side',
    materialRole: 'carcass',
    bounds: box(W - t, W, y0, y1, zSide0, Dbox),
    lengthAxis: 'y',
    thicknessAxis: 'x',
    ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
  });
  const between = (z0: Mm, z1: Mm, ya: Mm, yb: Mm) =>
    box(t - engage, W - t + engage, ya, yb, z0, z1);
  const housePanel = (panel: Part, kind: 'rabbet' | 'dado' | null) => {
    if (!kind) return;
    ctx.joint(left, panel, kind, 'x', engage);
    ctx.joint(right, panel, kind, 'x', engage);
  };

  const bottom = ctx.add({
    id: 'bottom',
    role: 'bottom',
    name: 'Bottom',
    materialRole: 'carcass',
    bounds: between(zPanel0, Dbox, bottomY0, bottomTop),
    lengthAxis: 'x',
    thicknessAxis: 'y',
    ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
  });
  housePanel(bottom, bottomJoint);

  // Top: a full panel or front + back stretchers, both flat, flush with the side tops.
  let top: Part | null = null;
  if (!traits.counter || c.carcass.baseTop === 'full') {
    top = ctx.add({
      id: 'top',
      role: 'top',
      name: 'Top',
      materialRole: 'carcass',
      bounds: between(zPanel0, Dbox, topUnderside, y1),
      lengthAxis: 'x',
      thicknessAxis: 'y',
      ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
    });
    housePanel(top, housed ? 'rabbet' : null);
  } else {
    const sw = c.carcass.stretcherWidth;
    const backZ0 = back === 'dado' ? zBackInner : zPanel0;
    check(Dbox - backZ0 >= 2 * sw, 'Cabinet is too shallow for two stretchers.');
    const front = ctx.add({
      id: 'stretcher/front',
      role: 'stretcher',
      name: 'Front stretcher',
      materialRole: 'carcass',
      bounds: between(Dbox - sw, Dbox, topUnderside, y1),
      lengthAxis: 'x',
      thicknessAxis: 'y',
      ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
    });
    const rear = ctx.add({
      id: 'stretcher/back',
      role: 'stretcher',
      name: 'Back stretcher',
      materialRole: 'carcass',
      bounds: between(backZ0, backZ0 + sw, topUnderside, y1),
      lengthAxis: 'x',
      thicknessAxis: 'y',
    });
    housePanel(front, housed ? 'rabbet' : null);
    housePanel(rear, housed ? 'rabbet' : null);
  }

  // Back panel
  let backPart: Part;
  if (back === 'applied') {
    backPart = ctx.add({
      id: 'back',
      role: 'back',
      name: 'Back',
      materialRole: 'back',
      bounds: box(0, W, y0, y1, 0, bt),
      lengthAxis: 'y',
      thicknessAxis: 'z',
    });
  } else if (back === 'inset') {
    backPart = ctx.add({
      id: 'back',
      role: 'back',
      name: 'Back',
      materialRole: 'back',
      bounds: box(t - rd, W - t + rd, y0, y1, 0, bt),
      lengthAxis: 'y',
      thicknessAxis: 'z',
    });
    ctx.joint(left, backPart, 'rabbet', 'x', rd);
    ctx.joint(right, backPart, 'rabbet', 'x', rd);
  } else {
    // In grooves in the sides and bottom; in the top too when it is a full panel. Under
    // stretchers it runs to the top of the sides.
    const yTop = top ? topUnderside + gd : y1;
    backPart = ctx.add({
      id: 'back',
      role: 'back',
      name: 'Back',
      materialRole: 'back',
      bounds: box(t - gd, W - t + gd, bottomTop - gd, yTop, gs, gs + bt),
      lengthAxis: 'y',
      thicknessAxis: 'z',
    });
    ctx.joint(left, backPart, 'groove', 'x', gd);
    ctx.joint(right, backPart, 'groove', 'x', gd);
    ctx.joint(bottom, backPart, 'groove', 'y', gd);
    if (top) ctx.joint(top, backPart, 'groove', 'y', gd);
  }

  if (traits.platform) buildPlatform(ctx, W, D, P);
  const zInterior = traits.hangingRail
    ? buildHangingRail(ctx, {
        W,
        t,
        bottomTop,
        topUnderside,
        zBackInner,
        groove: back === 'dado',
        gs,
      })
    : zBackInner;

  return {
    W,
    H,
    D,
    t,
    y0,
    y1,
    Dbox,
    ft,
    bottomTop,
    topUnderside,
    zBackInner,
    zInterior,
    engage,
    endJoint: housed ? 'rabbet' : null,
    midJoint: housed ? 'dado' : null,
    sides: { left, right },
    bottom,
    top,
    back: backPart,
    traits,
  };
}

/**
 * Wall cabinets hang from a rail screwed through into the studs, directly under the top and
 * butted between the sides. With a grooved back it sits in the setback space behind the back
 * (if that space is at least a panel thick); otherwise it sits in front of the back, and
 * interior parts stop in front of it. Returns the back of the usable interior.
 */
function buildHangingRail(
  ctx: BuildContext,
  f: { W: Mm; t: Mm; bottomTop: Mm; topUnderside: Mm; zBackInner: Mm; groove: boolean; gs: Mm },
): Mm {
  const width = ctx.c.carcass.hangingRailWidth;
  const behind = f.groove && f.gs >= f.t;
  const z0 = behind ? f.gs - f.t : f.zBackInner;
  check(f.topUnderside - width > f.bottomTop, 'Cabinet is too short for its hanging rail.');
  ctx.add({
    id: 'hangingRail',
    role: 'hangingRail',
    name: 'Hanging rail',
    materialRole: 'carcass',
    bounds: box(f.t, f.W - f.t, f.topUnderside - width, f.topUnderside, z0, z0 + f.t),
    lengthAxis: 'x',
    thicknessAxis: 'z',
  });
  return behind ? f.zBackInner : quantize(f.zBackInner + f.t);
}

/**
 * Separate ladder base: full-width front and back rails, cross members between them at both
 * ends and at most `crossMemberSpacing` apart (centre to centre). Front face sits `setback`
 * behind the cabinet front.
 */
export function buildPlatform(ctx: BuildContext, W: Mm, D: Mm, P: Mm): void {
  const { setback, crossMemberSpacing } = ctx.c.platform;
  const tp = ctx.thickness('platform');
  const zFront = D - setback;
  check(zFront - 2 * tp > 0, 'Toe-kick setback leaves no room for the platform.');

  ctx.add({
    id: 'platform/front',
    role: 'platformRail',
    name: 'Platform front rail',
    materialRole: 'platform',
    bounds: box(0, W, 0, P, zFront - tp, zFront),
    lengthAxis: 'x',
    thicknessAxis: 'z',
  });
  ctx.add({
    id: 'platform/back',
    role: 'platformRail',
    name: 'Platform back rail',
    materialRole: 'platform',
    bounds: box(0, W, 0, P, 0, tp),
    lengthAxis: 'x',
    thicknessAxis: 'z',
  });
  const span = W - tp;
  const count = Math.max(2, Math.ceil(span / crossMemberSpacing - 1e-9) + 1);
  for (let i = 0; i < count; i++) {
    const x = (span * i) / (count - 1);
    ctx.add({
      id: `platform/cross/${i}`,
      role: 'platformCrossMember',
      name: 'Platform cross member',
      materialRole: 'platform',
      bounds: box(x, x + tp, 0, P, tp, zFront - tp),
      lengthAxis: 'z',
      thicknessAxis: 'x',
    });
  }
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new BuildError(message);
}

function fmt(mm: Mm): string {
  return mm.toFixed(1);
}

export { check };
