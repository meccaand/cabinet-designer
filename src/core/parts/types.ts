import type { Axis, Box, Rect } from '../geometry';
import type { HardwareKind, MaterialRole, OpeningFill } from '../model';
import type { Mm } from '../units';

export type PartRole =
  | 'side'
  | 'bottom'
  | 'top'
  | 'stretcher'
  | 'back'
  | 'hangingRail'
  | 'platformRail'
  | 'platformCrossMember'
  | 'ffStile'
  | 'ffRail'
  | 'ffMullion'
  | 'slabFront'
  | 'blindPanel'
  | 'filler'
  | 'endPanel'
  | 'frontStile'
  | 'frontRail'
  | 'frontPanel'
  | 'drawerSide'
  | 'drawerEnd'
  | 'drawerBottom'
  | 'slideSpacer'
  | 'shelfAdjustable'
  | 'shelfFixed'
  | 'divider';

export interface PartSize {
  /** Along the grain (or the longer side, for grainless material). */
  length: Mm;
  width: Mm;
  thickness: Mm;
}

/** Banding id per edge; null = unbanded. Long edges run along the length; ends along the width. */
export interface PartEdges {
  long1: string | null;
  long2: string | null;
  end1: string | null;
  end2: string | null;
}

/**
 * One physical piece of a cabinet. Derived, never edited (PLAN.md data flow).
 *
 * `bounds` is the part's real volume in cabinet coordinates, including the portion that sits
 * inside a dado, rabbet or groove of a neighbouring part. `finished` is the bounds' extents;
 * `cut` is what to cut on the saw (finished minus banding marked "subtract from cut").
 */
export interface Part {
  id: string;
  cabinetId: string;
  role: PartRole;
  name: string;
  materialRole: MaterialRole;
  materialId: string;
  bounds: Box;
  lengthAxis: Axis;
  thicknessAxis: Axis;
  finished: PartSize;
  cut: PartSize;
  /** True when the material has a grain direction that must follow `length`. */
  grain: boolean;
  edges: PartEdges;
  notes: string[];
  /** A rectangle cut from the bottom front corner (end panels: the toe kick). */
  notch?: { height: Mm; depth: Mm };
  /** L-shaped cabinets: the part belongs to the return, the wing along the next wall. */
  wing?: 'return';
}

/**
 * Where one part sits inside a machined recess of another. `depth` is the engagement along
 * `axis`, so the parts' bounds overlap by exactly `depth` along that axis. Overlaps that are
 * not declared joints are construction errors (checked by tests).
 */
export interface Joint {
  /** The part that is machined (has the dado/rabbet/groove). */
  host: string;
  /** The part that sits in it. */
  guest: string;
  kind: 'dado' | 'rabbet' | 'groove';
  axis: Axis;
  depth: Mm;
}

export interface FrontSummary {
  kind: 'door' | 'drawer' | 'falseFront';
  width: Mm;
  height: Mm;
  /** The leaf of a bi-fold pair hinged to the cabinet: opened by the pull on the other leaf. */
  noPull?: true;
}

/** One leaf of the face tree, laid out: the front's cell (frameless) or the opening (face frame). */
export interface OpeningCell {
  path: string;
  fill: OpeningFill;
  rect: Rect;
}

/** Everything derived from one cabinet. */
export interface CabinetModel {
  cabinetId: string;
  parts: Part[];
  openings: OpeningCell[];
  joints: Joint[];
  fronts: FrontSummary[];
  /** Nominal slide length for each drawer (one pair per drawer). */
  slides: Mm[];
  adjustableShelves: number;
  hardware: HardwareLine[];
  warnings: string[];
}

export interface HardwareLine {
  kind: HardwareKind;
  /** Library item, or null when the library has none of this kind. */
  itemId: string | null;
  name: string;
  qty: number;
  /** Slides only: nominal length. */
  length?: Mm;
}
