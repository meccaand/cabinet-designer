/**
 * Default project contents. Every value here is an ASSUMED shop convention listed in
 * docs/PLAN.md "Construction conventions" for review; all are user-editable.
 */
import { inch } from '../units';
import type {
  Cabinet,
  ConstructionDefaults,
  ConstructionOverrides,
  MaterialLibrary,
  Project,
  ShopSettings,
  StylePreset,
  UnitSettings,
} from './schema';
import { CURRENT_SCHEMA_VERSION } from './version';

export const DEFAULT_MATERIALS: MaterialLibrary = {
  sheets: [
    {
      id: 'ply-18',
      name: '3/4" Plywood',
      thickness: 18, // measured ≈ 0.709"; nominal 3/4" sheet goods are undersized
      length: inch(96),
      width: inch(48),
      grain: true,
      costPerSheet: 85,
    },
    {
      id: 'ply-12',
      name: '1/2" Plywood',
      thickness: 12,
      length: inch(96),
      width: inch(48),
      grain: true,
      costPerSheet: 65,
    },
    {
      id: 'ply-5',
      name: '1/4" Plywood',
      thickness: 5.2,
      length: inch(96),
      width: inch(48),
      grain: true,
      costPerSheet: 40,
    },
  ],
  solids: [
    {
      id: 'poplar-4-4',
      name: 'Poplar 4/4',
      thickness: inch(3 / 4),
      roughThickness: inch(1),
      costPerBoardFoot: 5,
    },
  ],
  banding: [
    {
      id: 'veneer-0.5',
      name: 'Iron-on veneer 0.5 mm',
      thickness: 0.5,
      width: inch(7 / 8),
      subtractFromCut: false,
      costPerMeter: 1,
    },
    {
      id: 'pvc-2',
      name: 'PVC 2 mm',
      thickness: 2,
      width: 22,
      subtractFromCut: true,
      costPerMeter: 1.5,
    },
  ],
  hardware: [
    { id: 'hinge-35', name: 'Concealed hinge, 35 mm cup', kind: 'hinge', unitCost: 4 },
    { id: 'slide-side', name: 'Side-mount slide (pair)', kind: 'slide', unitCost: 12 },
    { id: 'pull', name: 'Pull', kind: 'pull', unitCost: 5 },
    { id: 'shelf-pin-5', name: 'Shelf pin, 5 mm', kind: 'shelfPin', unitCost: 0.1 },
    // Last, where the 2 → 3 migration adds it to older projects.
    { id: 'knob', name: 'Knob', kind: 'knob', unitCost: 6 },
  ],
};

export const DEFAULT_CONSTRUCTION: ConstructionDefaults = {
  carcass: {
    style: 'frameless',
    joinery: 'dado',
    back: 'inset',
    baseTop: 'stretchers',
    dadoDepth: inch(1 / 4),
    backRabbetDepth: inch(3 / 8),
    backGrooveDepth: inch(3 / 8),
    backGrooveSetback: inch(3 / 4),
    stretcherWidth: inch(4),
    hangingRailWidth: inch(3),
  },
  platform: { enabled: true, height: inch(4), setback: inch(3), crossMemberSpacing: inch(24) },
  fronts: {
    style: 'slab',
    mount: 'overlay',
    revealEdge: inch(1 / 16),
    revealBetween: inch(1 / 8),
    revealTopBase: inch(1 / 8),
    faceFrameOverlay: inch(1 / 2),
    insetGap: inch(1 / 16),
  },
  faceFrame: {
    stileWidth: inch(1.5),
    railWidth: inch(1.5),
    mullionWidth: inch(2),
    sideOverhang: 0,
  },
  shaker: {
    stileWidth: inch(2.25),
    railWidth: inch(2.25),
    grooveDepth: inch(1 / 4),
    panelClearance: inch(1 / 16),
    minPanel: inch(2),
  },
  drawer: {
    sideClearance: inch(1 / 2),
    heightDeduction: inch(1),
    rearClearance: inch(1 / 2),
    slideLengths: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28].map(inch),
    bottomGrooveHeight: inch(1 / 2),
    bottomGrooveDepth: inch(1 / 4),
    bottomClearance: inch(1 / 16),
    spacerWidth: inch(2),
  },
  shelves: {
    widthClearance: inch(1 / 16),
    depthSetback: inch(1 / 4),
    pinsPerShelf: 4,
    nosingHeight: 0,
  },
  hardware: {
    hingeTiers: [
      { upTo: inch(40), count: 2 },
      { upTo: inch(60), count: 3 },
      { upTo: inch(80), count: 4 },
      { upTo: null, count: 5 },
    ],
    twoPullsOver: inch(24),
    handle: 'pull',
    knobDiameter: inch(1.25),
    pullLength: inch(5),
    handleFromEnd: inch(2.75),
    handleFromEdge: inch(1.25),
  },
  endPanel: { style: 'flat', frameWidth: inch(2.25), frameThickness: inch(1 / 4) },
  materials: {
    carcass: 'ply-18',
    back: 'ply-5',
    shelf: 'ply-18',
    platform: 'ply-18',
    door: 'ply-18',
    frontFrame: 'poplar-4-4',
    frontPanel: 'ply-5',
    faceFrame: 'poplar-4-4',
    drawerBox: 'ply-12',
    drawerBottom: 'ply-5',
    carcassBanding: 'veneer-0.5',
    frontBanding: 'veneer-0.5',
  },
};

export const DEFAULT_SHOP: ShopSettings = {
  kerf: inch(1 / 8),
  sheetEdgeTrim: 0,
  boardFootWaste: 0.2,
};

export const IMPERIAL_UNITS: UnitSettings = {
  system: 'imperial',
  fractionDenom: 16,
  mmDecimals: 1,
};
export const METRIC_UNITS: UnitSettings = { system: 'metric', fractionDenom: 16, mmDecimals: 1 };

/**
 * A new project with one 10' wall and no cabinets. The caller supplies the id (core has no
 * randomness, ADR-001).
 */
export function createProject(
  id: string,
  name: string,
  system: UnitSettings['system'] = 'imperial',
): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    units: system === 'imperial' ? IMPERIAL_UNITS : METRIC_UNITS,
    shop: DEFAULT_SHOP,
    construction: DEFAULT_CONSTRUCTION,
    materials: DEFAULT_MATERIALS,
    room: {
      walls: [{ id: 'wall-1', name: 'Wall 1', length: inch(120), height: inch(96), turn: 'right' }],
    },
    stylePresets: [],
    builtIns: [],
    cabinets: [],
    fillers: [],
  };
}

/** The style preset a cabinet follows, if any. */
export function cabinetStyle(
  project: Project,
  cabinet: Pick<Cabinet, 'styleId'>,
): StylePreset | undefined {
  return cabinet.styleId === undefined
    ? undefined
    : project.stylePresets.find((s) => s.id === cabinet.styleId);
}

/**
 * Effective conventions for one cabinet: project defaults, then its style preset's overrides,
 * then its own (ADR-039). Every reader of a cabinet's conventions goes through this.
 */
export function cabinetConstruction(
  project: Project,
  cabinet: Pick<Cabinet, 'styleId' | 'construction'>,
): ConstructionDefaults {
  const style = cabinetStyle(project, cabinet);
  const styled = style
    ? resolveConstruction(project.construction, style.construction)
    : project.construction;
  return resolveConstruction(styled, cabinet.construction);
}

/** Conventions with overrides applied per field. */
export function resolveConstruction(
  defaults: ConstructionDefaults,
  overrides: ConstructionOverrides,
): ConstructionDefaults {
  return {
    carcass: merge(defaults.carcass, overrides.carcass),
    platform: merge(defaults.platform, overrides.platform),
    fronts: merge(defaults.fronts, overrides.fronts),
    faceFrame: merge(defaults.faceFrame, overrides.faceFrame),
    shaker: merge(defaults.shaker, overrides.shaker),
    drawer: merge(defaults.drawer, overrides.drawer),
    shelves: merge(defaults.shelves, overrides.shelves),
    hardware: merge(defaults.hardware, overrides.hardware),
    endPanel: merge(defaults.endPanel, overrides.endPanel),
    materials: merge(defaults.materials, overrides.materials),
  };
}

/** Shallow merge that ignores explicitly-undefined override fields. */
function merge<T extends object>(
  base: T,
  over: { [K in keyof T]?: T[K] | undefined } | undefined,
): T {
  if (!over) return base;
  const out = { ...base };
  for (const key of Object.keys(over) as (keyof T)[]) {
    const value = over[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
