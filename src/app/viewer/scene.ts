/**
 * Pure helpers for the 3D view: how parts are grouped, coloured and exploded, how the camera
 * frames a cabinet, and where dimension lines go. Kept free of React/three so they're unit
 * tested directly. Scene units are millimetres, in cabinet coordinates (x right, y up, z front).
 */
import type { Box } from '../../core/geometry';
import type { Finish } from '../../core/model';
import type { Part, PartRole } from '../../core/parts';

export type PartGroup =
  'carcass' | 'platform' | 'faceFrame' | 'fronts' | 'drawers' | 'shelves' | 'countertop';

export const PART_GROUPS: { id: PartGroup; label: string }[] = [
  { id: 'carcass', label: 'Carcass' },
  { id: 'faceFrame', label: 'Face frame' },
  { id: 'fronts', label: 'Doors & fronts' },
  { id: 'drawers', label: 'Drawer boxes' },
  { id: 'shelves', label: 'Shelves & dividers' },
  { id: 'platform', label: 'Toe-kick platform' },
  { id: 'countertop', label: 'Countertop & trim' },
];

const GROUP_OF: Record<PartRole, PartGroup> = {
  side: 'carcass',
  bottom: 'carcass',
  top: 'carcass',
  stretcher: 'carcass',
  back: 'carcass',
  hangingRail: 'carcass',
  platformRail: 'platform',
  platformCrossMember: 'platform',
  ffStile: 'faceFrame',
  ffRail: 'faceFrame',
  ffMullion: 'faceFrame',
  slabFront: 'fronts',
  blindPanel: 'fronts',
  filler: 'fronts',
  endPanel: 'fronts',
  endPanelFrame: 'fronts',
  frontStile: 'fronts',
  frontRail: 'fronts',
  frontPanel: 'fronts',
  drawerSide: 'drawers',
  drawerEnd: 'drawers',
  drawerBottom: 'drawers',
  slideSpacer: 'drawers',
  shelfAdjustable: 'shelves',
  shelfFixed: 'shelves',
  shelfNosing: 'shelves',
  divider: 'shelves',
  countertop: 'countertop',
  countertopEdge: 'countertop',
  frieze: 'countertop',
};

export function partGroup(role: PartRole): PartGroup {
  return GROUP_OF[role];
}

/** Parts left after per-part and per-group hiding. */
export function visibleParts(
  parts: Part[],
  hiddenParts: Partial<Record<string, true>>,
  hiddenGroups: Partial<Record<PartGroup, true>>,
): Part[] {
  return parts.filter((p) => !hiddenParts[p.id] && !hiddenGroups[partGroup(p.role)]);
}

/** Wood-ish colours by group: plywood carcass, solid face frame, painted-look fronts. */
const GROUP_COLOR: Record<PartGroup, string> = {
  carcass: '#d9c3a0',
  platform: '#b9a27f',
  faceFrame: '#c9a46c',
  fronts: '#ece4d6',
  drawers: '#e3cfa8',
  shelves: '#d2b98f',
  countertop: '#d9c3a0',
};

/**
 * A part's colour. A painted or stained style colours every part, the plinth included; only
 * drawer boxes stay bare wood (ADR-039).
 */
export function partColor(part: Part, finish?: Finish): string {
  const group = partGroup(part.role);
  if (finish && finish.kind !== 'clear' && group !== 'drawers') {
    return finish.color.toLowerCase();
  }
  if (part.role === 'back' || part.role === 'frontPanel' || part.role === 'drawerBottom')
    return '#c8b08a';
  return GROUP_COLOR[group];
}

const SHEEN_ROUGHNESS: Record<Finish['sheen'], number> = {
  flat: 0.95,
  matte: 0.85,
  satin: 0.65,
  semiGloss: 0.45,
  gloss: 0.3,
};

/** Surface roughness for the material: bare wood is fully rough. */
export function partRoughness(finish?: Finish): number {
  return finish && finish.kind !== 'clear' ? SHEEN_ROUGHNESS[finish.sheen] : 1;
}

/** Knobs and pulls when no style says otherwise: dark metal. */
export const DEFAULT_HARDWARE_COLOR = '#3a3a3a';

/**
 * Where a part moves in the exploded view (mm). Rules by role read better than a radial burst:
 * fronts and drawers pull forward, sides move out, the back moves back, the top lifts and the
 * platform drops. Parts of one front or drawer move together.
 */
export function explodeOffset(part: Part, cabinetWidth: number): [number, number, number] {
  const cx = (part.bounds.min.x + part.bounds.max.x) / 2;
  const outward = cx < cabinetWidth / 2 ? -1 : 1;
  switch (part.role) {
    case 'side':
      return [outward * 180, 0, 0];
    case 'back':
      return [0, 0, -220];
    case 'hangingRail':
      return [0, 80, -120];
    case 'top':
    case 'stretcher':
      return [0, 160, 0];
    case 'bottom':
      return [0, -40, 0];
    case 'platformRail':
    case 'platformCrossMember':
      return [0, -160, 0];
    case 'ffStile':
    case 'ffRail':
    case 'ffMullion':
      return [0, 0, 260];
    case 'filler':
      return [0, 0, 640];
    case 'slabFront':
    case 'blindPanel':
    case 'frontStile':
    case 'frontRail':
    case 'frontPanel':
      return [0, 0, 520];
    case 'drawerSide':
    case 'drawerEnd':
    case 'drawerBottom':
      return [0, 0, 380];
    case 'endPanel':
      return [outward * 260, 0, 0];
    case 'endPanelFrame':
      return [outward * 320, 0, 0];
    case 'slideSpacer':
      return [outward * 90, 0, 0];
    case 'shelfAdjustable':
    case 'shelfFixed':
    case 'shelfNosing':
      return [0, 0, 140];
    case 'divider':
      return [0, 0, 60];
    case 'countertop':
    case 'countertopEdge':
      return [0, 120, 0];
    case 'frieze':
      return [0, 160, 0];
  }
}

export function unionBounds(boxes: Box[]): Box {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boxes) {
    for (const a of ['x', 'y', 'z'] as const) {
      min[a] = Math.min(min[a], b.min[a]);
      max[a] = Math.max(max[a], b.max[a]);
    }
  }
  return { min, max };
}

export type View = 'iso' | 'front' | 'top' | 'side';

export interface CameraFit {
  orthographic: boolean;
  position: [number, number, number];
  target: [number, number, number];
  /** Orthographic only: pixels per mm. */
  zoom: number;
}

/** Iso looks from the front right, a little above. */
const ISO_DIRECTION: [number, number, number] = [0.62, 0.48, 0.92];

/**
 * Iso direction for a whole room, looking from inside it: into the corner when things stand on
 * two or more walls (the mean of their normals, as plan [x, z]), otherwise from the front right
 * of the one wall, as for a cabinet.
 */
export function roomIsoDirection(
  normals: readonly (readonly [number, number])[],
): [number, number, number] {
  const [s, up, c] = ISO_DIRECTION;
  const h = Math.hypot(s, c);
  const unique = [...new Map(normals.map((n) => [n.map((v) => v.toFixed(3)).join(), n])).values()];
  const mx = unique.reduce((sum, n) => sum + n[0], 0);
  const mz = unique.reduce((sum, n) => sum + n[1], 0);
  const len = Math.hypot(mx, mz);
  if (unique.length < 2 || len < 0.3) {
    // Front right of the wall: its normal turned as the cabinet iso turns +z.
    const [nx, nz] = unique[0] ?? [0, 1];
    return [nx * c + nz * s, up, -nx * s + nz * c];
  }
  return [(mx / len) * h, up, (mz / len) * h];
}

/**
 * Camera that frames `bounds` in `view`. Standard views are orthographic (true elevations);
 * iso is perspective. `viewport` is the canvas size in CSS pixels.
 */
export function fitCamera(
  bounds: Box,
  view: View,
  viewport: { width: number; height: number },
  fovDegrees: number,
  /** Pixels covered by overlays at the top of the canvas (the toolbar); content stays below. */
  insetTop = 0,
  /** Iso and side views from the left: an L-shaped cabinet's fronts face the inside corner,
   * front and left. */
  fromLeft = false,
  /** Iso only: look along this instead (a room, see roomIsoDirection). */
  isoDirection?: readonly [number, number, number],
): CameraFit {
  const dir: readonly [number, number, number] =
    isoDirection ??
    (fromLeft ? [-ISO_DIRECTION[0], ISO_DIRECTION[1], ISO_DIRECTION[2]] : ISO_DIRECTION);
  const c: [number, number, number] = [
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  ];
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  const margin = 0.78;

  if (view === 'iso') {
    const radius = Math.hypot(size.x, size.y, size.z) / 2;
    const aspect = viewport.width / viewport.height;
    const halfFov = (fovDegrees * Math.PI) / 360;
    // Fit the bounding sphere in whichever of the vertical/horizontal fields is tighter.
    const tightest = Math.min(Math.tan(halfFov), Math.tan(halfFov) * aspect);
    const distance = radius / Math.sin(Math.atan(tightest)) / margin;
    const n = Math.hypot(...dir);
    return {
      orthographic: false,
      position: [
        c[0] + (dir[0] / n) * distance,
        c[1] + (dir[1] / n) * distance,
        c[2] + (dir[2] / n) * distance,
      ],
      target: c,
      zoom: 1,
    };
  }

  // Screen-horizontal and screen-vertical extents for each elevation.
  const [w, h] =
    view === 'front' ? [size.x, size.y] : view === 'top' ? [size.x, size.z] : [size.z, size.y];
  const usable = Math.max(1, viewport.height - insetTop);
  const zoom = Math.min(viewport.width / w, usable / h) * margin;
  // Shift the target "up" on screen by half the inset so the model centres in the usable area.
  const shift = insetTop / 2 / zoom;
  const target: [number, number, number] =
    view === 'top' ? [c[0], c[1], c[2] - shift] : [c[0], c[1] + shift, c[2]];
  const far = 10_000;
  const position: [number, number, number] =
    view === 'front'
      ? [target[0], target[1], target[2] + far]
      : view === 'top'
        ? [target[0], target[1] + far, target[2] + 1] // a hair forward: screen-up = cabinet back
        : [target[0] + (fromLeft ? -far : far), target[1], target[2]];
  return { orthographic: true, position, target, zoom };
}

export interface DimensionLine {
  label: 'width' | 'height' | 'depth';
  value: number;
  from: [number, number, number];
  to: [number, number, number];
  /** Short perpendicular ticks at each end. */
  ticks: [[number, number, number], [number, number, number]][];
}

/**
 * Overall dimensions: width across the top front edge, height up the right front edge, depth
 * along the top right edge. Offset outward so they never sit on the cabinet.
 */
/** How far dimension lines sit outside the cabinet (mm). */
export const DIMENSION_OFFSET = 60;

export function overallDimensions(width: number, height: number, depth: number): DimensionLine[] {
  const off = DIMENSION_OFFSET;
  const tick = 25;
  const top = height + off;
  return [
    {
      label: 'width',
      value: width,
      from: [0, top, depth],
      to: [width, top, depth],
      ticks: [
        [
          [0, top - tick, depth],
          [0, top + tick, depth],
        ],
        [
          [width, top - tick, depth],
          [width, top + tick, depth],
        ],
      ],
    },
    {
      label: 'height',
      value: height,
      from: [width + off, 0, depth],
      to: [width + off, height, depth],
      ticks: [
        [
          [width + off - tick, 0, depth],
          [width + off + tick, 0, depth],
        ],
        [
          [width + off - tick, height, depth],
          [width + off + tick, height, depth],
        ],
      ],
    },
    {
      label: 'depth',
      value: depth,
      from: [width + off, top, 0],
      to: [width + off, top, depth],
      ticks: [
        [
          [width + off, top - tick, 0],
          [width + off, top + tick, 0],
        ],
        [
          [width + off, top - tick, depth],
          [width + off, top + tick, depth],
        ],
      ],
    },
  ];
}
