/**
 * The spec's reference living room (docs/BUILTIN-SPEC.md §5): built-ins on a fireplace wall and
 * a media wall meeting at an inside corner, under a 108" ceiling, in the traditional painted
 * style. Used by unit, e2e and screenshot tests.
 *
 * - Fireplace wall (156"): open to the room on the left. A left tower (30" opening, finished
 *   left end), a 6" pilaster, a 60" fireplace and chimney breast, and a narrow right tower (18"
 *   opening, one door), stopping 21" short of the corner for the media wall's boxes and a 3"
 *   dead-corner filler. Stiles 2 1/4".
 * - Media wall (159"): starts 21" from the corner (the fireplace wall's 18" boxes and a 3"
 *   dead-corner filler, so doors on both walls clear), meeting it round the inside corner. 3" stiles, 30" bays either side of a 66" TV section: two door pairs below, a
 *   niche for a 65" TV and a bridge of two cubbies above, on the top shelf line.
 */
import {
  createBuiltIn,
  createModule,
  createProject,
  createRun,
  createStylePreset,
  type Project,
  type RunModule,
  type SectionModule,
} from '../model';
import { inch } from '../units';

const stile = (id: string, w: number): RunModule => ({ kind: 'stile', id, width: inch(w) });
const section = (
  id: string,
  name: string,
  width: number | 'auto',
  over: Partial<SectionModule> = {},
): SectionModule => ({
  ...(createModule(id, 'section', name) as SectionModule),
  width: width === 'auto' ? 'auto' : inch(width),
  ...over,
});

export function referenceRoom(): Project {
  const p = createProject('reference-room', 'Reference living room');
  p.room.walls = [
    {
      id: 'fireplace',
      name: 'Fireplace wall',
      length: inch(156),
      height: inch(108),
      turn: 'right',
    },
    { id: 'media', name: 'Media wall', length: inch(159), height: inch(108), turn: 'right' },
  ];
  p.stylePresets = [createStylePreset('traditional', 'traditionalPainted')];
  const [fireWall, mediaWall] = p.room.walls as [
    Project['room']['walls'][number],
    Project['room']['walls'][number],
  ];
  const builtIn = createBuiltIn('builtins', 'Living room built-ins', 'traditional');
  builtIn.runs = [
    {
      ...createRun('fireplace-run', fireWall, inch(12)),
      length: inch(123),
      ends: { left: 'open', right: 'corner' },
      modules: [
        stile('f-s1', 2.25),
        section('left-tower', 'Left tower', 30, {
          endPanels: { left: true, right: false },
          pictureLight: true,
        }),
        stile('f-s2', 2.25),
        { kind: 'pilaster', id: 'pilaster', width: inch(6), depth: inch(12) },
        {
          kind: 'obstruction',
          id: 'fireplace',
          label: 'Fireplace + chimney breast',
          width: inch(60),
          height: inch(54),
          crown: 'continue',
        },
        stile('f-s3', 2.25),
        section('right-tower', 'Right tower', 18, {
          base: { groups: [{ doors: 1, hinge: 'right' }], shelves: 1 },
          pictureLight: true,
        }),
        stile('f-s4', 2.25),
      ],
    },
    {
      ...createRun('media-run', mediaWall, inch(21)),
      length: inch(138),
      ends: { left: 'corner', right: 'wall' },
      modules: [
        stile('m-s1', 3),
        section('media-left', 'Left bay', 'auto', { pictureLight: true }),
        stile('m-s2', 3),
        section('media-centre', 'TV section', 66, {
          base: { groups: [{ doors: 2 }, { doors: 2 }], shelves: 1 },
          upper: { kind: 'mediaNiche', cubbies: 2, bridgeLine: 1, tvSize: inch(65) },
        }),
        stile('m-s3', 3),
        section('media-right', 'Right bay', 'auto', { pictureLight: true }),
        stile('m-s4', 3),
      ],
    },
  ];
  p.builtIns = [builtIn];
  return p;
}
