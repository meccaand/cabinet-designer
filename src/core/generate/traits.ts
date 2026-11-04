import type { CabinetType } from '../model';

/** How a cabinet type is built, beyond what its face tree and conventions say. */
export interface TypeTraits {
  /** Stands on a toe-kick platform (floor cabinets). */
  platform: boolean;
  /** Under a countertop: top is stretchers or a full panel per `baseTop`, and frameless
   * fronts stop `revealTopBase` below the box top. Otherwise the top is always a full panel. */
  counter: boolean;
  /** Hung on the wall from a rail under the top. */
  hangingRail: boolean;
  /** One end of the face is a blind panel hidden by the run that meets it at a corner. */
  blind: boolean;
}

export const TYPE_TRAITS: Record<CabinetType, TypeTraits> = {
  base: { platform: true, counter: true, hangingRail: false, blind: false },
  drawerBank: { platform: true, counter: true, hangingRail: false, blind: false },
  blindBase: { platform: true, counter: true, hangingRail: false, blind: true },
  tall: { platform: true, counter: false, hangingRail: false, blind: false },
  openShelf: { platform: true, counter: false, hangingRail: false, blind: false },
  wall: { platform: false, counter: false, hangingRail: true, blind: false },
  blindWall: { platform: false, counter: false, hangingRail: true, blind: true },
};
