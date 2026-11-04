/**
 * Every style × joinery × back × top × door mount × front style combination, on a 30" drawer-
 * over-doors base. Each is checked against the physical invariants and against expected sizes
 * computed here from the formulas in docs/CONSTRUCTION.md (independently of the generator).
 */
import { describe, expect, it } from 'vitest';
import { createProject, type ConstructionDefaults, type ConstructionOverrides } from '../model';
import type { Part } from '../parts';
import { inch } from '../units';
import { violations } from './__tests__/invariants';
import { createBaseCabinet, generateCabinet } from './index';

const STYLES = ['frameless', 'faceFrame'] as const;
const JOINERY = ['dado', 'rabbet', 'butt', 'pocket'] as const;
const BACKS = ['inset', 'applied', 'dado'] as const;
const TOPS = ['stretchers', 'full'] as const;
const MOUNTS = ['overlay', 'inset'] as const;
const FRONTS = ['slab', 'shaker'] as const;

const combos = STYLES.flatMap((style) =>
  JOINERY.flatMap((joinery) =>
    BACKS.flatMap((back) =>
      TOPS.flatMap((baseTop) =>
        MOUNTS.flatMap((mount) =>
          FRONTS.map((front) => ({ style, joinery, back, baseTop, mount, front })),
        ),
      ),
    ),
  ),
);

const project = createProject('p', 'Matrix');
const C: ConstructionDefaults = project.construction;
const W = inch(30);
const H = inch(34.5);
const D = inch(24);
const t = 18;
const bt = 5.2;
const ff = inch(3 / 4);
const P = C.platform.height;
const jd = C.carcass.dadoDepth;
const {
  revealEdge: re,
  revealBetween: rb,
  revealTopBase: rtb,
  faceFrameOverlay: ov,
  insetGap: ig,
} = C.fronts;
const { stileWidth: fs, railWidth: fr } = C.faceFrame;
const { stileWidth: ss, railWidth: sr, grooveDepth: sg, panelClearance: pc, minPanel } = C.shaker;
const DRAWER_FF = inch(5); // preset: 6" front − 2 × 1/2" overlay
const DRAWER_FL = inch(6);

describe.each(combos)('$style / $joinery / $back back / $baseTop / $mount / $front', (k) => {
  const construction: ConstructionOverrides = {
    carcass: { style: k.style, joinery: k.joinery, back: k.back, baseTop: k.baseTop },
    fronts: { mount: k.mount, style: k.front },
  };
  const cabinet = createBaseCabinet(project, { id: 'c', width: W, construction });
  const result = generateCabinet(cabinet, project);
  if (!result.ok) throw new Error(result.errors.join('; '));
  const parts = result.model.parts;
  const get = (suffix: string): Part => {
    const p = parts.find((x) => x.id === `c/${suffix}`);
    if (!p) throw new Error(`no part ${suffix}`);
    return p;
  };

  const frameless = k.style === 'frameless';
  const housed = k.joinery === 'dado' || k.joinery === 'rabbet';
  const Dbox = frameless ? D : D - ff;
  const raise = frameless ? 0 : fr - t;
  const bottomTop = P + raise + t;

  it('passes the physical invariants', () => {
    expect(violations(result.model, cabinet, project)).toEqual([]);
  });

  it('sizes the carcass', () => {
    const sideDepth = k.back === 'applied' ? Dbox - bt : Dbox;
    expect(get('side/L').cut.length).toBeCloseTo(H - P, 6);
    expect(get('side/L').cut.width).toBeCloseTo(sideDepth, 6);

    const panelLength = W - 2 * t + (housed ? 2 * jd : 0);
    const panelDepth = k.back === 'dado' ? Dbox : Dbox - bt;
    expect(get('bottom').cut.length).toBeCloseTo(panelLength, 6);
    expect(get('bottom').cut.width).toBeCloseTo(panelDepth, 6);
    if (k.baseTop === 'full') {
      expect(get('top').cut.length).toBeCloseTo(panelLength, 6);
      expect(get('top').cut.width).toBeCloseTo(panelDepth, 6);
    } else {
      expect(get('stretcher/front').cut.length).toBeCloseTo(panelLength, 6);
      expect(get('stretcher/back').cut.width).toBeCloseTo(C.carcass.stretcherWidth, 6);
    }

    const back = get('back');
    if (k.back === 'applied') {
      expect(back.cut.length).toBeCloseTo(H - P, 6);
      expect(back.cut.width).toBeCloseTo(W, 6);
    } else if (k.back === 'inset') {
      expect(back.cut.length).toBeCloseTo(H - P, 6);
      expect(back.cut.width).toBeCloseTo(W - 2 * (t - C.carcass.backRabbetDepth), 6);
    } else {
      const gd = C.carcass.backGrooveDepth;
      const top = k.baseTop === 'full' ? H - t + gd : H;
      expect(back.cut.length).toBeCloseTo(top - (bottomTop - gd), 6);
      expect(back.cut.width).toBeCloseTo(W - 2 * t + 2 * gd, 6);
    }
  });

  it('sizes the doors and drawer front', () => {
    // [drawer front width, drawer front height, each door width, door height]
    let dfw: number, dfh: number, dw: number, dh: number;
    if (frameless && k.mount === 'overlay') {
      dfw = W - 2 * re;
      dfh = DRAWER_FL;
      dw = (W - 2 * re - rb) / 2;
      dh = H - P - rtb - DRAWER_FL - rb;
    } else if (frameless) {
      dfw = W - 2 * t - 2 * ig;
      dfh = DRAWER_FL;
      dw = (W - 2 * t - 4 * ig) / 2;
      dh = H - P - 2 * t - (DRAWER_FL + 2 * ig) - 2 * ig;
    } else {
      const opening = W - 2 * fs;
      const doorOpening = H - P - 3 * fr - DRAWER_FF;
      const grow = k.mount === 'overlay' ? ov : -ig;
      const pairGap = k.mount === 'overlay' ? rb : 2 * ig;
      dfw = opening + 2 * grow;
      dfh = DRAWER_FF + 2 * grow;
      dw = (opening + 2 * grow - pairGap) / 2;
      dh = doorOpening + 2 * grow;
    }
    // Drawer fronts here are all too short for a shaker panel, so they are slab.
    const df = get('front/0');
    expect(df.role).toBe('slabFront');
    expect(df.cut.length).toBeCloseTo(dfw, 6);
    expect(df.cut.width).toBeCloseTo(dfh, 6);

    if (k.front === 'slab') {
      const door = get('front/1/L');
      expect(door.cut.length).toBeCloseTo(dh, 6);
      expect(door.cut.width).toBeCloseTo(dw, 6);
    } else {
      expect(dw - 2 * ss).toBeGreaterThan(minPanel);
      expect(get('front/1/L/stile/L').cut.length).toBeCloseTo(dh, 6);
      expect(get('front/1/R/rail/top').cut.length).toBeCloseTo(dw - 2 * ss, 6);
      const panel = get('front/1/L/panel');
      expect(panel.cut.length).toBeCloseTo(dh - 2 * sr + 2 * sg - pc, 6);
      expect(panel.cut.width).toBeCloseTo(dw - 2 * ss + 2 * sg - pc, 6);
    }
  });

  it('sizes the drawer box', () => {
    const d = C.drawer;
    const mountWidth = frameless ? W - 2 * t : W - 2 * fs;
    const boxW = mountWidth - 2 * d.sideClearance;
    let slot: number;
    if (frameless && k.mount === 'overlay')
      slot = DRAWER_FL + rtb - t; // clipped by the top
    else if (frameless) slot = DRAWER_FL + 2 * ig;
    else slot = DRAWER_FF;
    const zBack = k.back === 'dado' ? C.carcass.backGrooveSetback + bt : bt;
    const frontT = k.front === 'shaker' ? ff : t; // inset doors push the box back
    const zFront = k.mount === 'inset' ? Math.min(Dbox, D - frontT) : Dbox;
    const L = Math.max(...d.slideLengths.filter((l) => l <= zFront - zBack - d.rearClearance));

    const side = get('drawer/0/side/L');
    expect(side.cut.length).toBeCloseTo(L, 6);
    expect(side.cut.width).toBeCloseTo(slot - d.heightDeduction, 6);
    expect(get('drawer/0/front').cut.length).toBeCloseTo(boxW - 2 * 12, 6);
    expect(result.model.slides).toEqual([L]);
  });

  it('lists face-frame members only for face-frame cabinets', () => {
    const ffParts = parts.filter((p) => p.role.startsWith('ff'));
    expect(ffParts.length).toBe(frameless ? 0 : 5);
    const spacers = parts.filter((p) => p.role === 'slideSpacer');
    expect(spacers.length).toBe(frameless ? 0 : 2);
    for (const s of spacers) expect(s.cut.thickness).toBeCloseTo(fs - t, 6);
  });
});
