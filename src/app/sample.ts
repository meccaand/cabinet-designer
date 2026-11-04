import { createBaseCabinet } from '../core/generate';
import { createProject, type Project } from '../core/model';
import { inch } from '../core/units';

/**
 * A ready-made project so the app has something to show before you build your own: the three
 * golden reference cabinets from docs/CONSTRUCTION.md.
 */
export function createSampleProject(): Project {
  const project = createProject('sample', 'Sample kitchen');
  project.cabinets = [
    createBaseCabinet(project, { id: 'sink-base', name: 'Frameless 30" base', width: inch(30) }),
    createBaseCabinet(project, {
      id: 'shaker-base',
      name: 'Face-frame 24" shaker base',
      width: inch(24),
      construction: {
        carcass: { style: 'faceFrame', joinery: 'pocket', back: 'applied', baseTop: 'full' },
        fronts: { style: 'shaker' },
      },
    }),
    createBaseCabinet(project, {
      id: 'drawer-base',
      name: '18" drawer base',
      width: inch(18),
      layout: 'drawers',
      construction: { carcass: { joinery: 'butt', back: 'dado' } },
    }),
  ];
  return project;
}
