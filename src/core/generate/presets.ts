import type { Cabinet, OpeningNode, Project } from '../model';
import { resolveConstruction } from '../model';
import { inch, type Mm } from '../units';

export interface BaseCabinetOptions {
  id: string;
  name?: string;
  width: Mm;
  height?: Mm;
  depth?: Mm;
  layout?: 'drawerOverDoors' | 'doors' | 'drawers';
  construction?: Cabinet['construction'];
}

/** Doors wider than this become a pair. */
const PAIR_ABOVE = inch(21);

/**
 * A standard base cabinet (34 1/2" × 24" by default). The top drawer is a 6" front: frameless
 * sizes are front sizes, face-frame sizes are openings (6" front − 2 × 1/2" overlay = 5").
 */
export function createBaseCabinet(project: Project, opts: BaseCabinetOptions): Cabinet {
  const construction = opts.construction ?? {};
  const c = resolveConstruction(project.construction, construction);
  const frameless = c.carcass.style === 'frameless';
  const topDrawer = frameless ? inch(6) : inch(6) - 2 * c.fronts.faceFrameOverlay;
  const doors: OpeningNode = {
    kind: 'leaf',
    fill: opts.width > PAIR_ABOVE ? 'doorPair' : 'door',
    shelves: { count: 1, adjustable: true },
  };
  const drawer: OpeningNode = { kind: 'leaf', fill: 'drawer' };

  let face: OpeningNode;
  switch (opts.layout ?? 'drawerOverDoors') {
    case 'doors':
      face = doors;
      break;
    case 'drawers':
      face = {
        kind: 'split',
        dir: 'rows',
        children: [
          { size: topDrawer, node: drawer },
          { size: 'auto', node: drawer },
          { size: 'auto', node: drawer },
        ],
      };
      break;
    case 'drawerOverDoors':
      face = {
        kind: 'split',
        dir: 'rows',
        children: [
          { size: topDrawer, node: drawer },
          { size: 'auto', node: doors },
        ],
      };
  }

  return {
    id: opts.id,
    name: opts.name ?? 'Base cabinet',
    type: 'base',
    width: opts.width,
    height: opts.height ?? inch(34.5),
    depth: opts.depth ?? inch(24),
    placement: { wallId: null, offset: 0, elevation: 0 },
    construction,
    face,
    endPanels: { left: false, right: false },
  };
}
