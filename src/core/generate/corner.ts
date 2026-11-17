/**
 * L-shaped cabinets (ADR-037): a run along the cabinet's wall and a return along the next wall,
 * around an inside corner, with one box inside.
 *
 * Each wing is built in its own coordinates, as if it were a cabinet on its own wall: u along the
 * wall from the wing's outer end (u = 0) to the corner line (u = L, the other wall's line), y up,
 * v out from the wall. The run's coordinates are the cabinet's; the return's are mapped by a
 * quarter turn (x = W − v, z = returnWidth − u). Every part stays an axis-aligned box.
 *
 * The run owns the corner square: its bottom, top, stretchers and shelves reach the return's
 * back, and the return's pieces butt against their front edges. Its back runs to the corner and
 * the return's back butts against its face. Formulas: docs/CONSTRUCTION.md "L-shaped cabinets".
 */
import { box, type Box } from '../geometry';
import { hardwareFor, hingeCount } from '../hardware';
import type { CabinetModel, FrontSummary, Part } from '../parts';
import { inch, quantize, type Mm } from '../units';
import { buildPlatform, check } from './carcass';
import type { BuildContext, WingFrame } from './context';
import { addEndPanel } from './endPanels';
import type { Rect } from './face';
import { buildFront } from './fronts';
import { addHandles } from './handles';
import { hasToeKick, TYPE_TRAITS } from './traits';

/** The face of each wing must be at least this much wider than the other wing's depth. */
const MIN_FACE = inch(6);

interface Wing {
  /** Along the wall, outer end to the corner line. */
  L: Mm;
  D: Mm;
  Dbox: Mm;
  /** The other wing's depth and box depth. */
  otherD: Mm;
  otherDbox: Mm;
  /** The run: owns the corner square. */
  owner: boolean;
}

export function buildCorner(ctx: BuildContext): CabinetModel {
  const { cabinet, c } = ctx;
  const corner = cabinet.corner;
  check(corner !== undefined, 'An L-shaped cabinet needs its return width and depth.');
  const traits = { ...TYPE_TRAITS[cabinet.type], platform: hasToeKick(cabinet.type, c.platform) };
  const face = cabinet.face;
  check(
    face.kind === 'leaf' && (face.fill === 'door' || face.fill === 'open'),
    'An L-shaped cabinet has bi-fold doors or is open: its face cannot be split.',
  );
  const shelfCount = face.shelves?.count ?? 0;
  check(
    !face.shelves?.adjustable || shelfCount === 0,
    'L-shaped cabinets take fixed shelves: each shelf is two pieces joined at the corner.',
  );

  const W = cabinet.width;
  const H = cabinet.height;
  const t = ctx.thickness('carcass');
  const bt = ctx.thickness('back');
  const frameless = c.carcass.style === 'frameless';
  const inset = c.fronts.mount === 'inset';
  check(
    !(frameless && inset),
    'Inset doors on an L-shaped cabinet need a face frame: frameless has no corner post for them to close against.',
  );
  const ft = frameless ? 0 : ctx.thickness('faceFrame');
  const run: Wing = {
    L: W,
    D: cabinet.depth,
    Dbox: quantize(cabinet.depth - ft),
    otherD: corner.returnDepth,
    otherDbox: quantize(corner.returnDepth - ft),
    owner: true,
  };
  const ret: Wing = {
    L: corner.returnWidth,
    D: corner.returnDepth,
    Dbox: quantize(corner.returnDepth - ft),
    otherD: cabinet.depth,
    otherDbox: quantize(cabinet.depth - ft),
    owner: false,
  };
  check(
    W - run.otherD >= MIN_FACE - 1e-6,
    'The width must be at least 6" more than the return depth.',
  );
  check(
    ret.L - ret.otherD >= MIN_FACE - 1e-6,
    'The return width must be at least 6" more than the depth.',
  );

  // Heights and joints shared by both wings (as in carcass.ts).
  const P = traits.platform ? c.platform.height : 0;
  const y0 = P;
  const y1 = H;
  const housed = c.carcass.joinery === 'dado' || c.carcass.joinery === 'rabbet';
  const e = housed ? c.carcass.dadoDepth : 0;
  check(e < t, `Dado/rabbet depth must be less than the ${t.toFixed(1)} mm panel thickness.`);
  check(y1 - y0 > 2 * t, 'Cabinet is too short once the platform and panels are subtracted.');
  const back = c.carcass.back;
  const rd = c.carcass.backRabbetDepth;
  const gd = c.carcass.backGrooveDepth;
  const gs = c.carcass.backGrooveSetback;
  if (back === 'inset') check(rd < t, 'Back rabbet depth must be less than the side thickness.');
  if (back === 'dado') check(gd < t, 'Back groove depth must be less than the panel thickness.');
  const zSide0 = back === 'applied' ? bt : 0;
  const zPanel0 = back === 'dado' ? 0 : bt;
  const zBackInner = back === 'dado' ? gs + bt : bt;
  for (const w of [run, ret]) {
    if (back === 'dado')
      check(gs + bt < w.Dbox - t, 'Back groove setback leaves no room for the cabinet.');
  }
  const raise = frameless ? 0 : Math.max(0, c.faceFrame.railWidth - t);
  const bottomY0 = quantize(y0 + raise);
  const bottomTop = quantize(bottomY0 + t);
  const topUnderside = quantize(y1 - t);
  check(topUnderside - bottomTop > 0, 'No interior height left between bottom and top.');
  const fullTop = !traits.counter || c.carcass.baseTop === 'full';
  const sw = c.carcass.stretcherWidth;
  const backZ0 = back === 'dado' ? zBackInner : zPanel0;

  const turn: WingFrame = {
    map: (b: Box) =>
      box(W - b.max.z, W - b.min.z, b.min.y, b.max.y, ret.L - b.max.x, ret.L - b.min.x),
    axis: (a) => (a === 'x' ? 'z' : a === 'z' ? 'x' : a),
  };
  const inWing = <T>(w: Wing, build: () => T): T => (w.owner ? build() : ctx.inReturn(turn, build));
  const piece = (w: Wing) => (w.owner ? ' (run)' : '');
  const seam = (what: string) =>
    `One of two pieces of the L-shaped ${what}: butt it to the other piece at the corner (biscuits or screws).`;

  // ---- Carcass, one wing at a time --------------------------------------------------------
  interface Built {
    side: Part;
    bottom: Part;
    top: Part | null;
    back: Part;
  }
  const carcass = (w: Wing): Built =>
    inWing(w, () => {
      const { L, Dbox } = w;
      // Where the corner end of each kind of piece stops (u).
      const panelEnd = w.owner ? L - zPanel0 : L - w.otherDbox;
      const backEnd = w.owner ? L - (back === 'dado' ? gs : 0) : L - zBackInner;
      const side = ctx.add({
        id: 'side/end',
        role: 'side',
        name: 'End side',
        materialRole: 'carcass',
        bounds: box(0, t, y0, y1, zSide0, Dbox),
        lengthAxis: 'y',
        thicknessAxis: 'x',
        ...(frameless && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
      });
      const panel = (
        id: string,
        role: 'bottom' | 'top' | 'stretcher',
        name: string,
        u1: Mm,
        ya: Mm,
        yb: Mm,
        z0: Mm,
        z1: Mm,
        banded: boolean,
        joint: 'rabbet' | 'dado' = 'rabbet',
      ) => {
        const p = ctx.add({
          id,
          role,
          name: name + piece(w),
          materialRole: 'carcass',
          bounds: box(t - e, u1, ya, yb, z0, z1),
          lengthAxis: 'x',
          thicknessAxis: 'y',
          notes: [seam(name.toLowerCase())],
          ...(frameless && banded && { banding: { role: 'carcassBanding', edges: ['long1'] } }),
        });
        if (housed) ctx.joint(side, p, joint, 'x', e);
        return p;
      };
      // A face-frame bottom is raised off the end of the side, into a dado.
      const bottom = panel(
        'bottom',
        'bottom',
        'Bottom',
        panelEnd,
        bottomY0,
        bottomTop,
        zPanel0,
        Dbox,
        true,
        raise > 0 ? 'dado' : 'rabbet',
      );
      let top: Part | null = null;
      if (fullTop) {
        top = panel('top', 'top', 'Top', panelEnd, topUnderside, y1, zPanel0, Dbox, true);
      } else {
        check(Dbox - backZ0 >= 2 * sw, 'Cabinet is too shallow for two stretchers.');
        const frontEnd = w.owner ? L - w.otherDbox + sw : L - w.otherDbox;
        const rearEnd = w.owner ? L - backZ0 : L - backZ0 - sw;
        panel(
          'stretcher/front',
          'stretcher',
          'Front stretcher',
          frontEnd,
          topUnderside,
          y1,
          Dbox - sw,
          Dbox,
          true,
        );
        panel(
          'stretcher/back',
          'stretcher',
          'Back stretcher',
          rearEnd,
          topUnderside,
          y1,
          backZ0,
          backZ0 + sw,
          false,
        );
      }

      // Back: rabbeted, applied or grooved, as on any cabinet, but only one side to hold it.
      let backPart: Part;
      if (back === 'applied') {
        backPart = ctx.add({
          id: 'back',
          role: 'back',
          name: 'Back' + piece(w),
          materialRole: 'back',
          bounds: box(0, backEnd, y0, y1, 0, bt),
          lengthAxis: 'y',
          thicknessAxis: 'z',
        });
      } else if (back === 'inset') {
        backPart = ctx.add({
          id: 'back',
          role: 'back',
          name: 'Back' + piece(w),
          materialRole: 'back',
          bounds: box(t - rd, backEnd, y0, y1, 0, bt),
          lengthAxis: 'y',
          thicknessAxis: 'z',
        });
        ctx.joint(side, backPart, 'rabbet', 'x', rd);
      } else {
        const yTop = top ? topUnderside + gd : y1;
        backPart = ctx.add({
          id: 'back',
          role: 'back',
          name: 'Back' + piece(w),
          materialRole: 'back',
          bounds: box(t - gd, backEnd, bottomTop - gd, yTop, gs, gs + bt),
          lengthAxis: 'y',
          thicknessAxis: 'z',
        });
        ctx.joint(side, backPart, 'groove', 'x', gd);
        ctx.joint(bottom, backPart, 'groove', 'y', gd);
        if (top) ctx.joint(top, backPart, 'groove', 'y', gd);
      }
      if (traits.platform) {
        // The return's ladder starts at the front of the run's.
        buildPlatform(ctx, w.owner ? L : L - (w.otherD - c.platform.setback), w.D, P);
      }
      return { side, bottom, top, back: backPart };
    });

  const a = carcass(run);
  const b = carcass(ret);
  // A grooved return back also runs in the run's bottom and top across the corner square.
  if (back === 'dado') {
    ctx.joint(a.bottom, b.back, 'groove', 'y', gd);
    if (a.top) ctx.joint(a.top, b.back, 'groove', 'y', gd);
  }

  // ---- Face: frames, doors ------------------------------------------------------------------
  const fc = c.fronts;
  const ff = c.faceFrame;
  const doors = face.fill === 'door';
  /** The face of a wing in its own coordinates: the door zone (frameless) or the opening. */
  const opening = (w: Wing): Rect => {
    if (frameless) {
      const bottom = traits.platform ? 0 : fc.revealEdge;
      const topGap = traits.counter ? fc.revealTopBase : fc.revealEdge;
      return {
        x0: fc.revealEdge,
        x1: w.L - w.otherD,
        y0: y0 + bottom,
        y1: y1 - topGap,
      };
    }
    return {
      x0: ff.stileWidth,
      x1: w.L - w.otherD - ff.stileWidth,
      y0: y0 + ff.railWidth,
      y1: y1 - ff.railWidth,
    };
  };

  const faceFrame = (w: Wing) =>
    inWing(w, () => {
      const { sideOverhang: oh, stileWidth: fsw, railWidth: rw } = ff;
      const cornerStile = w.L - w.otherD - fsw;
      const frameEnd = w.owner ? w.L - w.otherDbox : w.L - w.otherD;
      const member = (
        id: string,
        name: string,
        role: 'ffStile' | 'ffRail',
        r: Rect,
        notes?: string[],
      ) =>
        ctx.add({
          id,
          role,
          name,
          materialRole: 'faceFrame',
          bounds: box(r.x0, r.x1, r.y0, r.y1, w.Dbox, w.D),
          lengthAxis: role === 'ffRail' ? 'x' : 'y',
          thicknessAxis: 'z',
          ...(notes && { notes }),
        });
      member('ff/stile/end', 'Face frame stile', 'ffStile', { x0: -oh, x1: fsw, y0, y1 });
      member(
        'ff/stile/corner',
        w.owner ? 'Face frame corner stile (run)' : 'Face frame corner stile',
        'ffStile',
        { x0: cornerStile, x1: frameEnd, y0, y1 },
        w.owner
          ? ['Wider by the frame thickness: the return frame butts against its face.']
          : undefined,
      );
      member('ff/rail/top', 'Face frame top rail', 'ffRail', {
        x0: fsw,
        x1: cornerStile,
        y0: y1 - rw,
        y1,
      });
      member('ff/rail/bottom', 'Face frame bottom rail', 'ffRail', {
        x0: fsw,
        x1: cornerStile,
        y0,
        y1: y0 + rw,
      });
    });

  if (!frameless) {
    faceFrame(run);
    faceFrame(ret);
  }

  const fronts: FrontSummary[] = [];
  const faceDepth = { run: run.D, ret: ret.D };
  if (doors) {
    for (const w of [run, ret]) {
      const o = opening(w);
      let r: Rect;
      if (frameless) {
        // The run's door stops short of the return door's face by the gap between fronts.
        const td = ctx.thickness(c.fronts.style === 'shaker' ? 'frontFrame' : 'door');
        r = w.owner ? { ...o, x1: o.x1 - td - fc.revealBetween } : o;
      } else {
        const grow = inset ? -fc.insetGap : fc.faceFrameOverlay;
        r = { x0: o.x0 - grow, x1: o.x1 + grow, y0: o.y0 - grow, y1: o.y1 + grow };
      }
      const hinges = hingeCount(r.y1 - r.y0, c);
      const notes = w.owner
        ? ['Bi-fold: hinge this door to the cabinet at its outer end.']
        : [
            `Bi-fold: hinge this door to the other one at the corner with ${hinges} bi-fold hinges; its pull goes near the free edge.`,
          ];
      const summary: FrontSummary = {
        kind: 'door',
        width: quantize(r.x1 - r.x0),
        height: quantize(r.y1 - r.y0),
        ...(w.owner && { noPull: true as const }),
      };
      // The return's leaf carries the handle at its free edge, the wing's outer end (u = 0).
      const { thickness } = inWing(w, () => {
        const built = buildFront(ctx, w.D, 'bifold', 'door', w.owner ? 'run' : '', r, inset, notes);
        const zFace = inset ? w.D : quantize(w.D + built.thickness);
        addHandles(ctx, summary, built, r, zFace, 'left');
        return built;
      });
      if (!frameless && !inset) {
        check(
          ff.stileWidth >= fc.faceFrameOverlay + thickness - 1e-6,
          'The corner stiles are too narrow for the bi-fold doors to clear each other: widen the face-frame stiles or reduce the overlay.',
        );
      }
      if (!inset) faceDepth[w.owner ? 'run' : 'ret'] = quantize(w.D + thickness);
      fronts.push(summary);
    }
  }
  const frontInner = (w: Wing) => {
    if (!doors || !inset) return w.Dbox;
    return Math.min(
      w.Dbox,
      quantize(w.D - ctx.thickness(c.fronts.style === 'shaker' ? 'frontFrame' : 'door')),
    );
  };

  // ---- Fixed shelves, two pieces each -------------------------------------------------------
  if (shelfCount > 0 && c.shelves.nosingHeight > 0 && face.fill === 'open') {
    ctx.warnings.push('Shelf nosing is not made for L-shaped shelves yet: add it by hand.');
  }
  if (shelfCount > 0) {
    const ts = ctx.thickness('shelf');
    const pitch = (topUnderside - bottomTop) / (shelfCount + 1);
    check(pitch > ts, 'Too many shelves for the height.');
    const se = housed ? e : 0;
    const runFront = frontInner(run);
    for (let i = 1; i <= shelfCount; i++) {
      const yc = bottomTop + pitch * i;
      for (const [w, built] of [
        [run, a],
        [ret, b],
      ] as const) {
        inWing(w, () => {
          const shelf = ctx.add({
            id: `shelf/${i}`,
            role: 'shelfFixed',
            name: 'Fixed shelf' + piece(w),
            materialRole: 'shelf',
            bounds: box(
              t - se,
              w.owner ? w.L - zBackInner : w.L - runFront,
              yc - ts / 2,
              yc + ts / 2,
              zBackInner,
              frontInner(w),
            ),
            lengthAxis: 'x',
            thicknessAxis: 'y',
            notes: [seam('shelf')],
            banding: { role: 'carcassBanding', edges: ['long1'] },
          });
          if (housed) ctx.joint(built.side, shelf, 'dado', 'x', se);
        });
      }
    }
  }

  // ---- End panels ---------------------------------------------------------------------------
  const te = ctx.thickness('door');
  const oh = frameless ? 0 : ff.sideOverhang;
  if (cabinet.endPanels.left) {
    addEndPanel(ctx, { D: run.D, H, traits }, 'L', -oh - te, faceDepth.run);
  }
  if (cabinet.endPanels.right) {
    inWing(ret, () => addEndPanel(ctx, { D: ret.D, H, traits }, 'R', -oh - te, faceDepth.ret));
  }

  const hw = { fronts, slides: [], adjustableShelves: 0 };
  return {
    cabinetId: cabinet.id,
    parts: ctx.parts,
    openings: [{ path: '', fill: face.fill, rect: opening(run) }],
    joints: ctx.joints,
    handles: ctx.handles,
    ...hw,
    hardware: hardwareFor(hw, c, ctx.project.materials.hardware),
    warnings: ctx.warnings,
  };
}
