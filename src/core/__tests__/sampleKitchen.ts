/** Test fixtures shared by output tests: the app's sample kitchen, built from core only. */
import { createBaseCabinet, createCabinet, generateCabinet } from '../generate';
import { createProject, type Cabinet, type Project } from '../model';
import type { CabinetModel } from '../parts';
import { inch } from '../units';

export function modelsOf(p: Project): Map<string, CabinetModel | null> {
  return new Map(
    p.cabinets.map((c) => {
      const r = generateCabinet(c, p);
      return [c.id, r.ok ? r.model : null];
    }),
  );
}

/** The app's sample kitchen. */
export function sample(): Project {
  const p = createProject('s', 'Sample');
  const at = (c: Cabinet, offset: number): Cabinet => ({
    ...c,
    placement: { ...c.placement, wallId: 'wall-1', offset: inch(offset) },
  });
  p.cabinets = [
    at(createBaseCabinet(p, { id: 'sink', name: 'Sink', width: inch(30) }), 0),
    at(
      createBaseCabinet(p, {
        id: 'shaker',
        name: 'Shaker',
        width: inch(24),
        construction: {
          carcass: { style: 'faceFrame', joinery: 'pocket', back: 'applied', baseTop: 'full' },
          fronts: { style: 'shaker' },
        },
      }),
      30,
    ),
    at(
      createBaseCabinet(p, {
        id: 'drawers',
        name: 'Drawers',
        width: inch(18),
        layout: 'drawers',
        construction: { carcass: { joinery: 'butt', back: 'dado' } },
      }),
      54,
    ),
    at(createCabinet(p, 'wall', { id: 'upper', name: 'Upper' }), 0),
  ];
  return p;
}
