/**
 * Project data model. The zod schemas are the single source of truth; TS types are inferred.
 *
 * All lengths are millimetres (ADR-002). Parts, cut lists and sheet layouts are NOT stored:
 * they are derived from this document by pure functions (see docs/PLAN.md "Data flow").
 */
import { z } from 'zod';
import type { UnitFormat } from '../units';
import { CURRENT_SCHEMA_VERSION } from './version';

const Id = z.string().min(1);
const Length = z.number();
const PositiveLength = z.number().positive();
const NonNegLength = z.number().nonnegative();
const Money = z.number().nonnegative();

// ---------------------------------------------------------------------------------------------
// Units & settings

export const UnitSettingsSchema = z.object({
  system: z.enum(['imperial', 'metric']),
  fractionDenom: z.union([z.literal(16), z.literal(32)]),
  mmDecimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
}) satisfies z.ZodType<UnitFormat>; // stored unit settings drive the formatter directly
export type UnitSettings = z.infer<typeof UnitSettingsSchema>;

export const ShopSettingsSchema = z.object({
  /** Saw blade kerf, applied between every pair of adjacent cuts on a sheet. */
  kerf: NonNegLength,
  /** Strip removed from each factory edge of a sheet before nesting. */
  sheetEdgeTrim: NonNegLength,
  /** Extra solid stock to buy, as a fraction (0.2 = 20%). */
  boardFootWaste: z.number().min(0).max(1),
});
export type ShopSettings = z.infer<typeof ShopSettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Materials

export const SheetMaterialSchema = z.object({
  id: Id,
  name: z.string().min(1),
  /** Actual (measured) thickness, not nominal: dados and part math use this. */
  thickness: PositiveLength,
  length: PositiveLength,
  width: PositiveLength,
  /** Grain runs along `length`. Grain-matched parts never rotate when nested. */
  grain: z.boolean(),
  costPerSheet: Money,
});
export type SheetMaterial = z.infer<typeof SheetMaterialSchema>;

export const SolidStockSchema = z.object({
  id: Id,
  name: z.string().min(1),
  /** Finished (planed) thickness used for part math. */
  thickness: PositiveLength,
  /** Rough thickness used for board-foot purchasing (e.g. 4/4 = 1"). */
  roughThickness: PositiveLength,
  costPerBoardFoot: Money,
});
export type SolidStock = z.infer<typeof SolidStockSchema>;

export const BandingSchema = z.object({
  id: Id,
  name: z.string().min(1),
  thickness: NonNegLength,
  width: PositiveLength,
  /** When true, banded edges are cut short by `thickness` so the finished part is nominal. */
  subtractFromCut: z.boolean(),
  costPerMeter: Money,
});
export type Banding = z.infer<typeof BandingSchema>;

export const HardwareKindSchema = z.enum([
  'hinge',
  'slide',
  'pull',
  'knob',
  'shelfPin',
  // Built-ins (ADR-042): picture lights each; crown and base moulding by length.
  'pictureLight',
  'crownMoulding',
  'baseMoulding',
]);
export type HardwareKind = z.infer<typeof HardwareKindSchema>;

export const HardwareItemSchema = z.object({
  id: Id,
  name: z.string().min(1),
  kind: HardwareKindSchema,
  /** Per hinge, per slide pair, per pull or knob, per pin, per light; mouldings per metre. */
  unitCost: Money,
});
export type HardwareItem = z.infer<typeof HardwareItemSchema>;

export const MaterialLibrarySchema = z.object({
  sheets: z.array(SheetMaterialSchema),
  solids: z.array(SolidStockSchema),
  banding: z.array(BandingSchema),
  hardware: z.array(HardwareItemSchema),
});
export type MaterialLibrary = z.infer<typeof MaterialLibrarySchema>;

/** What each part is made of. Roles map to a sheet/solid (or banding, for *Banding roles). */
export const MaterialRoleSchema = z.enum([
  'carcass',
  'back',
  'shelf',
  'platform',
  'door',
  'frontFrame',
  'frontPanel',
  'faceFrame',
  'drawerBox',
  'drawerBottom',
  'carcassBanding',
  'frontBanding',
]);
export type MaterialRole = z.infer<typeof MaterialRoleSchema>;
export const BANDING_ROLES = ['carcassBanding', 'frontBanding'] as const satisfies MaterialRole[];

// ---------------------------------------------------------------------------------------------
// Construction conventions (ADR-008: conventions are data, overridable per cabinet)

export const ConstructionStyleSchema = z.enum(['frameless', 'faceFrame']);
export const JoinerySchema = z.enum(['dado', 'rabbet', 'butt', 'pocket']);
export const BackStyleSchema = z.enum(['inset', 'applied', 'dado']);
export const BaseTopSchema = z.enum(['stretchers', 'full']);
export const FrontStyleSchema = z.enum(['slab', 'shaker']);
export const DoorMountSchema = z.enum(['overlay', 'inset']);

const CarcassConventions = z.object({
  style: ConstructionStyleSchema,
  joinery: JoinerySchema,
  back: BackStyleSchema,
  /** Base cabinets only: two stretchers or a full top panel. */
  baseTop: BaseTopSchema,
  /**
   * Depth of the joint where panels meet the sides. Top/bottom at the ends of the sides sit in
   * rabbets of this depth; panels between the ends (fixed shelves, dividers, a raised
   * face-frame bottom) sit in dados of this depth. Ignored for butt/pocket joinery.
   */
  dadoDepth: PositiveLength,
  backRabbetDepth: PositiveLength,
  backGrooveDepth: PositiveLength,
  /** Distance from the back edge of the sides to the near face of the back groove. */
  backGrooveSetback: NonNegLength,
  stretcherWidth: PositiveLength,
  /** Wall cabinets: width of the hanging rail under the top. */
  hangingRailWidth: PositiveLength,
});

const PlatformConventions = z.object({
  /** Floor cabinets stand on the platform; without it the box fills the height (ADR-036). */
  enabled: z.boolean(),
  height: PositiveLength,
  /** Toe-kick recess from the cabinet front. */
  setback: NonNegLength,
  /** Maximum spacing between cross members of the ladder base. */
  crossMemberSpacing: PositiveLength,
});

const FrontConventions = z.object({
  style: FrontStyleSchema,
  mount: DoorMountSchema,
  /** Frameless overlay: gap between a front and the outside edge of the cabinet. */
  revealEdge: NonNegLength,
  /** Gap between adjacent doors/drawer fronts. */
  revealBetween: NonNegLength,
  /** Frameless base cabinets: door top sits this far below the box top. */
  revealTopBase: NonNegLength,
  /** Face-frame overlay: how far a front overlaps the frame on each side. */
  faceFrameOverlay: NonNegLength,
  /** Inset fronts: gap all around. */
  insetGap: NonNegLength,
});

const FaceFrameConventions = z.object({
  stileWidth: PositiveLength,
  railWidth: PositiveLength,
  mullionWidth: PositiveLength,
  /** How far the frame extends past each carcass side (for scribing). */
  sideOverhang: NonNegLength,
});

const ShakerConventions = z.object({
  stileWidth: PositiveLength,
  railWidth: PositiveLength,
  grooveDepth: PositiveLength,
  /** Total clearance (both sides combined) between panel and groove bottoms. */
  panelClearance: NonNegLength,
  /** Fronts whose centre panel would be narrower or shorter than this are made slab. */
  minPanel: NonNegLength,
});

const DrawerConventions = z.object({
  /** Side-mount slide clearance per side. */
  sideClearance: NonNegLength,
  /** Box height = opening height − this. */
  heightDeduction: NonNegLength,
  /** Minimum space behind the box. */
  rearClearance: NonNegLength,
  /** Available slide lengths; box length = longest that fits. */
  slideLengths: z.array(PositiveLength).min(1),
  bottomGrooveHeight: NonNegLength,
  bottomGrooveDepth: PositiveLength,
  /** Total clearance (both directions combined) between the bottom and its groove bottoms. */
  bottomClearance: NonNegLength,
  /** Face-frame cabinets: width of the slide spacer strips that pack slides out to the frame. */
  spacerWidth: PositiveLength,
});

const EndPanelConventions = z.object({
  /** Flat, or framed: a frame of thin solid strips applied over the outside, so the field
   * between them reads as a recessed panel (ADR-041). */
  style: z.enum(['flat', 'framed']),
  /** Framed: width of the stiles and rails. */
  frameWidth: PositiveLength,
  /** Framed: thickness of the applied strips. */
  frameThickness: PositiveLength,
});

const ShelfConventions = z.object({
  /** Adjustable shelves: total width clearance (both sides combined). */
  widthClearance: NonNegLength,
  /** Shelves are this much shallower than the interior depth. */
  depthSetback: NonNegLength,
  pinsPerShelf: z.int().min(0),
  /**
   * Shelves in open openings get a solid strip on the front edge this tall, its top flush with
   * the shelf top, so they read thicker than the sheet stock (0 = none). Behind doors they don't.
   */
  nosingHeight: NonNegLength,
});

const HingeTier = z.object({
  /** Doors up to this height (inclusive) get `count` hinges; null = any height. */
  upTo: PositiveLength.nullable(),
  count: z.int().min(1),
});

const HardwareConventions = z.object({
  hingeTiers: z
    .array(HingeTier)
    .min(1)
    .refine((tiers) => tiers.at(-1)?.upTo === null, 'The last hinge tier must cover any height.'),
  /** Drawer fronts wider than this get two pulls. */
  twoPullsOver: PositiveLength,
  /** What opens doors and drawers: a pull (bar handle) or a round knob. */
  handle: z.enum(['pull', 'knob']),
  knobDiameter: PositiveLength,
  /** Overall length of a pull. */
  pullLength: PositiveLength,
  /**
   * Doors: from the door's top edge to the handle centre (from the bottom edge for doors hung
   * high, centred above 48" off the floor).
   */
  handleFromEnd: NonNegLength,
  /** Slab doors: from the opening edge to the handle centre. Shaker doors centre it on the stile. */
  handleFromEdge: NonNegLength,
});

const MaterialAssignments = z.record(MaterialRoleSchema, Id);

export const ConstructionDefaultsSchema = z.object({
  carcass: CarcassConventions,
  platform: PlatformConventions,
  fronts: FrontConventions,
  faceFrame: FaceFrameConventions,
  shaker: ShakerConventions,
  drawer: DrawerConventions,
  shelves: ShelfConventions,
  hardware: HardwareConventions,
  endPanel: EndPanelConventions,
  materials: MaterialAssignments,
});
export type ConstructionDefaults = z.infer<typeof ConstructionDefaultsSchema>;

/** Per-cabinet overrides: any field of any group. Unset fields inherit the project default. */
export const ConstructionOverridesSchema = z.object({
  carcass: CarcassConventions.partial().optional(),
  platform: PlatformConventions.partial().optional(),
  fronts: FrontConventions.partial().optional(),
  faceFrame: FaceFrameConventions.partial().optional(),
  shaker: ShakerConventions.partial().optional(),
  drawer: DrawerConventions.partial().optional(),
  shelves: ShelfConventions.partial().optional(),
  hardware: HardwareConventions.partial().optional(),
  endPanel: EndPanelConventions.partial().optional(),
  materials: z.partialRecord(MaterialRoleSchema, Id).optional(),
});
export type ConstructionOverrides = z.infer<typeof ConstructionOverridesSchema>;

// ---------------------------------------------------------------------------------------------
// Cabinet face: a tree of openings (ADR in PLAN.md: one generator path for all cabinet types)

export const OpeningFillSchema = z.enum(['door', 'doorPair', 'drawer', 'falseFront', 'open']);
export type OpeningFill = z.infer<typeof OpeningFillSchema>;

export const OpeningLeafSchema = z.object({
  kind: z.literal('leaf'),
  fill: OpeningFillSchema,
  /** Single doors only. */
  hinge: z.enum(['left', 'right']).optional(),
  /** Shelves behind this opening (doors or open). */
  shelves: z.object({ count: z.int().min(0).max(20), adjustable: z.boolean() }).optional(),
});
export type OpeningLeaf = z.infer<typeof OpeningLeafSchema>;

export interface OpeningSplit {
  kind: 'split';
  /** 'rows' stacks children top to bottom; 'columns' places them left to right. */
  dir: 'rows' | 'columns';
  /**
   * Child sizes along `dir`. Frameless: the size of the front (door/drawer front) itself.
   * Face frame: the size of the opening between rails/mullions. 'auto' children share
   * whatever the fixed-size children leave, equally.
   */
  children: { size: 'auto' | number; node: OpeningNode }[];
  /** Frameless columns: a full-depth divider panel between children. */
  divider?: boolean | undefined;
}
export type OpeningNode = OpeningLeaf | OpeningSplit;

export const OpeningSplitSchema: z.ZodType<OpeningSplit> = z.object({
  kind: z.literal('split'),
  dir: z.enum(['rows', 'columns']),
  get children() {
    return z
      .array(
        z.object({ size: z.union([z.literal('auto'), PositiveLength]), node: OpeningNodeSchema }),
      )
      .min(2);
  },
  divider: z.boolean().optional(),
});

export const OpeningNodeSchema: z.ZodType<OpeningNode> = z.union([
  OpeningLeafSchema,
  OpeningSplitSchema,
]);

// ---------------------------------------------------------------------------------------------
// Cabinets, room, project

export const CabinetTypeSchema = z.enum([
  'base',
  'wall',
  'tall',
  'drawerBank',
  'openShelf',
  'blindBase',
  'blindWall',
  'lBase',
  'lShelf',
]);
export type CabinetType = z.infer<typeof CabinetTypeSchema>;
const BLIND_TYPES: readonly CabinetType[] = ['blindBase', 'blindWall'];
const L_TYPES: readonly CabinetType[] = ['lBase', 'lShelf'];

export const CabinetSchema = z
  .object({
    id: Id,
    name: z.string(),
    type: CabinetTypeSchema,
    /** Overall box size; see docs/PLAN.md "Construction conventions" for exactly what's included. */
    width: PositiveLength,
    height: PositiveLength,
    depth: PositiveLength,
    placement: z.object({
      /** null = not yet placed on a wall. */
      wallId: Id.nullable(),
      /** Distance from the wall's start to the cabinet's left edge. L-shaped cabinets ignore it:
       * they always sit in the corner at the end of their wall (ADR-037). */
      offset: Length,
      /** Floor to the bottom of the cabinet (0 for base/tall). */
      elevation: NonNegLength,
    }),
    construction: ConstructionOverridesSchema,
    face: OpeningNodeSchema,
    endPanels: z.object({ left: z.boolean(), right: z.boolean() }),
    /** The style preset this cabinet follows; its own overrides still apply on top. */
    styleId: Id.optional(),
    /**
     * Face frame: outer stile widths when they differ from the convention. Built-in runs split
     * the stile between neighbouring boxes and widen it at walls for scribing (ADR-040).
     */
    stiles: z.object({ left: PositiveLength, right: PositiveLength }).optional(),
    blind: z
      .object({
        /** Which end of the cabinet is hidden behind the adjacent run. */
        side: z.enum(['left', 'right']),
        blindWidth: PositiveLength,
        pullFillerWidth: NonNegLength,
      })
      .optional(),
    /**
     * L-shaped cabinets: the wing along the next wall (the "return"). `width` and `depth` are
     * the wing along the cabinet's own wall (the "run"); both widths are measured to the corner.
     */
    corner: z
      .object({
        returnWidth: PositiveLength,
        returnDepth: PositiveLength,
      })
      .optional(),
  })
  .refine((c) => BLIND_TYPES.includes(c.type) === (c.blind !== undefined), {
    message: 'Blind corner cabinets need blind settings; other types must not have them.',
    path: ['blind'],
  })
  .refine((c) => L_TYPES.includes(c.type) === (c.corner !== undefined), {
    message: 'L-shaped cabinets need return settings; other types must not have them.',
    path: ['corner'],
  });
export type Cabinet = z.infer<typeof CabinetSchema>;

export const WallSchema = z.object({
  id: Id,
  name: z.string(),
  length: PositiveLength,
  height: PositiveLength,
  /**
   * 90° corner at this wall's start, relative to the previous wall (ignored for the first).
   * Walking along the walls, cabinets are on the right, so 'right' is an inside corner (an L or
   * U kitchen) and 'left' an outside corner.
   */
  turn: z.enum(['left', 'right']),
});
export type Wall = z.infer<typeof WallSchema>;

/** A filler strip between cabinets or between a cabinet and a wall, set in the face plane. */
export const FillerSchema = z.object({
  id: Id,
  wallId: Id,
  /** Distance from the wall's start to the filler's left edge. */
  offset: Length,
  width: PositiveLength,
  height: PositiveLength,
  /** Floor to the bottom of the filler. */
  elevation: NonNegLength,
  /** Wall to the filler's front face (lines up with the neighbouring fronts). */
  depth: PositiveLength,
  /** What the cut list calls it (a built-in's pilaster); "Filler" when absent. */
  name: z.string().optional(),
  /** Stock and finish from this style, as a cabinet's (a built-in's pilaster). */
  styleId: Id.optional(),
});
export type Filler = z.infer<typeof FillerSchema>;

/** How a style's surfaces look in the 3D view. Paint and stain cover every visible part. */
export const FinishSchema = z.object({
  kind: z.enum(['paint', 'stain', 'clear']),
  /** #rrggbb */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sheen: z.enum(['flat', 'matte', 'satin', 'semiGloss', 'gloss']),
  /** Knobs and pulls, #rrggbb. */
  hardwareColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Finish = z.infer<typeof FinishSchema>;

/**
 * A named look shared by many cabinets (ADR-038, ADR-039): construction overrides layered
 * between the project defaults and each cabinet's own overrides, plus a finish. Editing the
 * preset restyles every cabinet that follows it.
 */
export const StylePresetSchema = z.object({
  id: Id,
  name: z.string().min(1),
  construction: ConstructionOverridesSchema,
  finish: FinishSchema,
});
export type StylePreset = z.infer<typeof StylePresetSchema>;

// ---------------------------------------------------------------------------------------------
// Built-ins (ADR-038, ADR-040): wall runs of modules sharing a style and datums. Compiled into
// ordinary cabinets, fillers and run parts; never stored as cabinets.

const ModuleId = Id;
const AutoLength = z.union([z.literal('auto'), PositiveLength]);

/** One door group of a section's base: a single door or a pair, between face-frame mullions. */
export const DoorGroupSchema = z.object({
  doors: z.union([z.literal(1), z.literal(2)]),
  /** Single doors: the hinged side. */
  hinge: z.enum(['left', 'right']).optional(),
});
export type DoorGroup = z.infer<typeof DoorGroupSchema>;

/**
 * A base box with doors, and (usually) an upper open bay standing on the countertop, set back.
 * `width` is the clear opening between its face-frame stiles; the stiles come from the stile
 * modules beside it. A tower is a section too.
 */
export const SectionModuleSchema = z.object({
  kind: z.literal('section'),
  id: ModuleId,
  name: z.string(),
  /** 'auto' sections share what the run's length leaves, equally (symmetry by default). */
  width: AutoLength,
  base: z.object({
    groups: z.array(DoorGroupSchema).min(1),
    /** Adjustable shelves behind the doors. */
    shelves: z.int().min(0).max(10),
  }),
  /** null: a base only. */
  upper: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('openBay'),
        /** null follows the run's linked shelf lines. */
        shelves: z.int().min(0).max(20).nullable(),
      }),
      /**
       * A framed opening for a TV from the countertop up to a bridge of open cubbies. The
       * bridge's shelf lines up with one of the run's shelf lines (1 = the top one).
       */
      z.object({
        kind: z.literal('mediaNiche'),
        cubbies: z.int().min(1).max(6),
        bridgeLine: z.int().min(1).max(20),
        /** The TV's diagonal, to check it fits (16:9); null = no check. */
        tvSize: PositiveLength.nullable(),
      }),
    ])
    .nullable(),
  endPanels: z.object({ left: z.boolean(), right: z.boolean() }),
  /** A picture light on the frieze, centred over the section. */
  pictureLight: z.boolean(),
});
export type SectionModule = z.infer<typeof SectionModuleSchema>;

/**
 * The visible face-frame stile between sections, or at a run end. Between two sections each
 * box carries half of it (split stiles); beside one section, that box carries all of it.
 */
export const StileModuleSchema = z.object({
  kind: z.literal('stile'),
  id: ModuleId,
  width: PositiveLength,
});

/** A flat, full-height board, e.g. beside a chimney breast. */
export const PilasterModuleSchema = z.object({
  kind: z.literal('pilaster'),
  id: ModuleId,
  width: PositiveLength,
  /** Wall to its face. */
  depth: PositiveLength,
});

/** Space the run keeps clear for something that isn't cabinetry: a fireplace, a window. */
export const ObstructionModuleSchema = z.object({
  kind: z.literal('obstruction'),
  id: ModuleId,
  label: z.string(),
  width: PositiveLength,
  height: PositiveLength,
  /** The crown and frieze run across it (a fireplace) or stop either side (a window to the
   * ceiling). The countertop and base moulding always stop. */
  crown: z.enum(['continue', 'stop']),
});

export const RunModuleSchema = z.discriminatedUnion('kind', [
  SectionModuleSchema,
  StileModuleSchema,
  PilasterModuleSchema,
  ObstructionModuleSchema,
]);
export type RunModule = z.infer<typeof RunModuleSchema>;

const RunEndSchema = z.enum(['wall', 'open', 'corner']);

export const RunSchema = z.object({
  id: Id,
  wallId: Id,
  /** From the wall's start to the run's left end. */
  offset: NonNegLength,
  /** What 'auto' sections share: the run's overall length along the wall. */
  length: PositiveLength,
  /** Floor to the top of the countertop: every base box sits under it (datum). */
  countertopHeight: PositiveLength,
  /** Wall to the face of the base boxes' face frames. */
  baseDepth: PositiveLength,
  /** Wall to the face of the upper bays (set back from the base: the ledge). */
  upperDepth: PositiveLength,
  /** The countertop's front edge (and exposed ends) past the face frame. */
  countertopOverhang: NonNegLength,
  /** How thick the countertop reads: the height of its solid edge strip. */
  countertopEdge: PositiveLength,
  /** Shelves in every upper bay that follows the run's lines (datum). */
  shelves: z.int().min(0).max(20),
  /**
   * What each end of the run meets: a wall (flush, scribed), open room (overhang, returns), or
   * the run on the next wall round an inside corner (ADR-042). At a corner, the run on the
   * earlier wall runs through to the wall; the later one starts past it, with fillers.
   */
  ends: z.object({ left: RunEndSchema, right: RunEndSchema }),
  modules: z.array(RunModuleSchema),
});
export type Run = z.infer<typeof RunSchema>;

export const BuiltInSchema = z.object({
  id: Id,
  name: z.string().min(1),
  /** The look of every box (ADR-039); null = the project defaults. */
  styleId: Id.nullable(),
  /** Ceiling to the top of the upper boxes: room for the frieze and crown (one line, all walls). */
  topGap: NonNegLength,
  /**
   * Run trim (ADR-042). The frieze fills `topGap` below the crown, so it is `topGap − crown
   * height` tall (none if 0).
   */
  trim: z.object({
    crownHeight: NonNegLength,
    /** How far the crown stands out from the frieze. */
    crownProjection: NonNegLength,
    /** Applied over the plinth face; 0 = none. */
    baseMouldingHeight: NonNegLength,
    pictureLightWidth: PositiveLength,
  }),
  runs: z.array(RunSchema),
});
export type BuiltIn = z.infer<typeof BuiltInSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: Id,
    name: z.string(),
    units: UnitSettingsSchema,
    shop: ShopSettingsSchema,
    construction: ConstructionDefaultsSchema,
    materials: MaterialLibrarySchema,
    room: z.object({ walls: z.array(WallSchema) }),
    stylePresets: z.array(StylePresetSchema),
    builtIns: z.array(BuiltInSchema),
    cabinets: z.array(CabinetSchema),
    fillers: z.array(FillerSchema),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });

    duplicates(p.cabinets.map((c) => c.id)).forEach((id) =>
      issue(`Duplicate cabinet id "${id}".`, ['cabinets']),
    );
    duplicates(p.room.walls.map((w) => w.id)).forEach((id) =>
      issue(`Duplicate wall id "${id}".`, ['room', 'walls']),
    );
    const m = p.materials;
    const materialIds = [...m.sheets, ...m.solids, ...m.banding, ...m.hardware].map((x) => x.id);
    duplicates(materialIds).forEach((id) => issue(`Duplicate material id "${id}".`, ['materials']));

    const stock = new Set([...m.sheets, ...m.solids].map((x) => x.id));
    const banding = new Set(m.banding.map((x) => x.id));
    const checkRoles = (
      assign: Partial<Record<MaterialRole, string>>,
      path: (string | number)[],
    ) => {
      for (const [role, id] of Object.entries(assign) as [MaterialRole, string][]) {
        const pool = (BANDING_ROLES as readonly string[]).includes(role) ? banding : stock;
        if (!pool.has(id))
          issue(`Material "${id}" for role "${role}" does not exist.`, [...path, role]);
      }
    };
    checkRoles(p.construction.materials, ['construction', 'materials']);

    duplicates(p.stylePresets.map((s) => s.id)).forEach((id) =>
      issue(`Duplicate style id "${id}".`, ['stylePresets']),
    );
    p.stylePresets.forEach((s, i) => {
      if (s.construction.materials) {
        checkRoles(s.construction.materials, ['stylePresets', i, 'construction', 'materials']);
      }
    });
    const styleIds = new Set(p.stylePresets.map((s) => s.id));

    const wallIds = new Set(p.room.walls.map((w) => w.id));
    p.cabinets.forEach((c, i) => {
      if (c.construction.materials) {
        checkRoles(c.construction.materials, ['cabinets', i, 'construction', 'materials']);
      }
      if (c.styleId !== undefined && !styleIds.has(c.styleId)) {
        issue(`Style "${c.styleId}" does not exist.`, ['cabinets', i, 'styleId']);
      }
      if (c.placement.wallId !== null && !wallIds.has(c.placement.wallId)) {
        issue(`Wall "${c.placement.wallId}" does not exist.`, [
          'cabinets',
          i,
          'placement',
          'wallId',
        ]);
      }
    });
    p.fillers.forEach((f, i) => {
      if (!wallIds.has(f.wallId))
        issue(`Wall "${f.wallId}" does not exist.`, ['fillers', i, 'wallId']);
    });

    duplicates(p.builtIns.map((b) => b.id)).forEach((id) =>
      issue(`Duplicate built-in id "${id}".`, ['builtIns']),
    );
    duplicates(p.builtIns.flatMap((b) => b.runs.map((r) => r.id))).forEach((id) =>
      issue(`Duplicate run id "${id}".`, ['builtIns']),
    );
    p.builtIns.forEach((b, i) => {
      if (b.styleId !== null && !styleIds.has(b.styleId)) {
        issue(`Style "${b.styleId}" does not exist.`, ['builtIns', i, 'styleId']);
      }
      duplicates(b.runs.flatMap((r) => r.modules.map((m) => m.id))).forEach((id) =>
        issue(`Duplicate module id "${id}".`, ['builtIns', i, 'runs']),
      );
      b.runs.forEach((r, j) => {
        if (!wallIds.has(r.wallId))
          issue(`Wall "${r.wallId}" does not exist.`, ['builtIns', i, 'runs', j, 'wallId']);
      });
    });
  });
export type Project = z.infer<typeof ProjectSchema>;

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
}
