/** Starting points for each cabinet type. Everything here is editable afterwards. */
import {
  resolveConstruction,
  type Cabinet,
  type CabinetType,
  type OpeningNode,
  type Project,
} from '../model';
import { inch, type Mm } from '../units';

export interface CabinetOptions {
  id: string;
  name?: string;
  width?: Mm;
  height?: Mm;
  depth?: Mm;
  /** Base cabinets only. */
  layout?: 'drawerOverDoors' | 'doors' | 'drawers';
  construction?: Cabinet['construction'];
}

/** Standard sizes, W × H × D in inches. */
const SIZES: Record<CabinetType, [number, number, number]> = {
  base: [24, 34.5, 24],
  drawerBank: [18, 34.5, 24],
  blindBase: [42, 34.5, 24],
  tall: [24, 84, 24],
  openShelf: [36, 84, 12],
  wall: [30, 30, 12],
  blindWall: [36, 30, 12],
  lBase: [36, 34.5, 24],
  lShelf: [30, 84, 12],
};

/** L-shaped cabinets' return (width, depth) in inches: the same as the run by default. */
const RETURNS: Partial<Record<CabinetType, [number, number]>> = {
  lBase: [36, 24],
  lShelf: [30, 12],
};

export const CABINET_TYPE_NAMES: Record<CabinetType, string> = {
  base: 'Base cabinet',
  drawerBank: 'Drawer base',
  blindBase: 'Blind corner base',
  tall: 'Tall cabinet',
  openShelf: 'Open shelving',
  wall: 'Wall cabinet',
  blindWall: 'Blind corner wall',
  lBase: 'L-shaped base',
  lShelf: 'L-shaped open shelving',
};

/** Doors wider than this become a pair. */
const PAIR_ABOVE = inch(21);

/**
 * A new cabinet of `type` at standard size. Drawer and false-front sizes are 6" fronts:
 * frameless sizes are front sizes, face-frame sizes are openings (6" − 2 × overlay).
 * Blind corners default to the blind end on the left: blind width = the meeting run's depth
 * + 1", with a 3" pull filler.
 */
export function createCabinet(project: Project, type: CabinetType, opts: CabinetOptions): Cabinet {
  const [w, h, d] = SIZES[type];
  const construction = opts.construction ?? {};
  const c = resolveConstruction(project.construction, construction);
  const width = opts.width ?? inch(w);
  const sixInchFront =
    c.carcass.style === 'frameless' ? inch(6) : inch(6) - 2 * c.fronts.faceFrameOverlay;

  const blind =
    type === 'blindBase'
      ? { side: 'left' as const, blindWidth: inch(25), pullFillerWidth: inch(3) }
      : type === 'blindWall'
        ? { side: 'left' as const, blindWidth: inch(13), pullFillerWidth: inch(3) }
        : undefined;
  const doorWidth = width - (blind?.blindWidth ?? 0);
  const doors = (shelves: number): OpeningNode => ({
    kind: 'leaf',
    fill: doorWidth > PAIR_ABOVE ? 'doorPair' : 'door',
    shelves: { count: shelves, adjustable: true },
  });
  const drawer: OpeningNode = { kind: 'leaf', fill: 'drawer' };
  const rows = (...children: [number | 'auto', OpeningNode][]): OpeningNode => ({
    kind: 'split',
    dir: 'rows',
    children: children.map(([size, node]) => ({ size, node })),
  });

  let face: OpeningNode;
  switch (type) {
    case 'base': {
      const layout = opts.layout ?? 'drawerOverDoors';
      face =
        layout === 'doors'
          ? doors(1)
          : layout === 'drawers'
            ? rows([sixInchFront, drawer], ['auto', drawer], ['auto', drawer])
            : rows([sixInchFront, drawer], ['auto', doors(1)]);
      break;
    }
    case 'drawerBank':
      face = rows([sixInchFront, drawer], ['auto', drawer], ['auto', drawer]);
      break;
    case 'blindBase':
      face = rows([sixInchFront, { kind: 'leaf', fill: 'falseFront' }], ['auto', doors(1)]);
      break;
    case 'tall':
      face = { ...rows(['auto', doors(3)], ['auto', doors(2)]), divider: true } as OpeningNode;
      break;
    case 'openShelf':
      face = { kind: 'leaf', fill: 'open', shelves: { count: 4, adjustable: true } };
      break;
    case 'wall':
    case 'blindWall':
      face = doors(2);
      break;
    // L-shaped: one face around the corner. 'door' is the bi-fold pair (ADR-037).
    case 'lBase':
      face = { kind: 'leaf', fill: 'door', shelves: { count: 1, adjustable: false } };
      break;
    case 'lShelf':
      face = { kind: 'leaf', fill: 'open', shelves: { count: 4, adjustable: false } };
      break;
  }
  const ret = RETURNS[type];

  return {
    id: opts.id,
    name: opts.name ?? CABINET_TYPE_NAMES[type],
    type,
    width,
    height: opts.height ?? inch(h),
    depth: opts.depth ?? inch(d),
    placement: {
      wallId: null,
      offset: 0,
      elevation: type === 'wall' || type === 'blindWall' ? inch(54) : 0,
    },
    construction,
    face,
    endPanels: { left: false, right: false },
    ...(blind && { blind }),
    ...(ret && { corner: { returnWidth: inch(ret[0]), returnDepth: inch(ret[1]) } }),
  };
}

export interface BaseCabinetOptions extends CabinetOptions {
  width: Mm;
}

/** A standard base cabinet (34 1/2" × 24" by default). */
export function createBaseCabinet(project: Project, opts: BaseCabinetOptions): Cabinet {
  return createCabinet(project, 'base', opts);
}
