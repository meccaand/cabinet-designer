/**
 * A large project for performance tests: a square room of four 15' walls, each with eight 16"
 * lower cabinets (bases and drawer banks, some face frame and shaker) and eight 16" uppers,
 * 64 cabinets in all.
 */
import { createCabinet } from '../generate';
import { createProject, type Cabinet, type CabinetType, type Project } from '../model';
import { inch } from '../units';

export function bigKitchen(): Project {
  const p = createProject('big', 'Big kitchen');
  p.room.walls = [1, 2, 3, 4].map((n) => ({
    id: `wall-${n}`,
    name: `Wall ${n}`,
    length: inch(180),
    height: inch(96),
    turn: 'right' as const,
  }));
  const cabinets: Cabinet[] = [];
  for (const wall of p.room.walls) {
    for (let i = 0; i < 8; i++) {
      const lower: CabinetType = i % 3 === 2 ? 'drawerBank' : 'base';
      const faceFrame = i % 4 === 1;
      for (const type of [lower, 'wall'] as const) {
        const c = createCabinet(p, type, {
          id: `${wall.id}-${type}-${i}`,
          name: `${wall.name} ${type} ${i + 1}`,
          width: inch(16),
          ...(faceFrame
            ? {
                construction: {
                  carcass: { style: 'faceFrame' as const },
                  fronts: { style: 'shaker' as const },
                },
              }
            : {}),
        });
        cabinets.push({
          ...c,
          placement: { ...c.placement, wallId: wall.id, offset: inch(24 + 16 * i) },
        });
      }
    }
  }
  p.cabinets = cabinets;
  return p;
}
