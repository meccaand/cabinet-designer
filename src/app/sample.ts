import { createBaseCabinet, createCabinet } from '../core/generate';
import { createProject, type Cabinet, type Project } from '../core/model';
import { inch } from '../core/units';

/**
 * A ready-made project so the app has something to show before you build your own: the three
 * golden base cabinets from docs/CONSTRUCTION.md in a row, with a wall cabinet above.
 */
export function createSampleProject(): Project {
  const project = createProject('sample', 'Sample kitchen');
  const at = (cabinet: Cabinet, offset: number): Cabinet => ({
    ...cabinet,
    placement: { ...cabinet.placement, wallId: 'wall-1', offset: inch(offset) },
  });
  project.cabinets = [
    at(
      createBaseCabinet(project, { id: 'sink-base', name: 'Frameless 30" base', width: inch(30) }),
      0,
    ),
    at(
      createBaseCabinet(project, {
        id: 'shaker-base',
        name: 'Face-frame 24" shaker base',
        width: inch(24),
        construction: {
          carcass: { style: 'faceFrame', joinery: 'pocket', back: 'applied', baseTop: 'full' },
          fronts: { style: 'shaker' },
        },
      }),
      30,
    ),
    at(
      createBaseCabinet(project, {
        id: 'drawer-base',
        name: '18" drawer base',
        width: inch(18),
        layout: 'drawers',
        construction: { carcass: { joinery: 'butt', back: 'dado' } },
      }),
      54,
    ),
    at(createCabinet(project, 'wall', { id: 'upper', name: '30" wall cabinet' }), 0),
  ];
  return project;
}
