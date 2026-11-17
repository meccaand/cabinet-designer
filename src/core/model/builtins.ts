/**
 * Starting points for built-ins, their runs and modules (ADR-040). Callers supply ids (core has
 * no randomness, ADR-001). Every value is editable afterwards.
 */
import { inch } from '../units';
import type { BuiltIn, Run, RunModule, SectionModule, Wall } from './schema';

/** Ceiling to the top of the upper boxes: a 5 1/2" frieze and a 4 1/2" crown (spec §3). */
export const DEFAULT_TOP_GAP = inch(10);

export function createBuiltIn(id: string, name: string, styleId: string | null): BuiltIn {
  return { id, name, styleId, topGap: DEFAULT_TOP_GAP, runs: [] };
}

/** A run along `wall` from `offset` to the wall's end, with the spec's datums and no modules. */
export function createRun(id: string, wall: Wall, offset = 0): Run {
  return {
    id,
    wallId: wall.id,
    offset,
    length: Math.max(inch(12), wall.length - offset),
    countertopHeight: inch(32),
    baseDepth: inch(18),
    upperDepth: inch(12),
    countertopOverhang: inch(3 / 4),
    countertopEdge: inch(1),
    shelves: 4,
    ends: { left: 'wall', right: 'wall' },
    modules: [],
  };
}

export type ModuleTemplate =
  'section' | 'tower' | 'baseOnly' | 'stile' | 'pilaster' | 'obstruction';

export const MODULE_TEMPLATES: { id: ModuleTemplate; name: string }[] = [
  { id: 'section', name: 'Section (doors below, open shelves above)' },
  { id: 'tower', name: 'Tower (with a finished end)' },
  { id: 'baseOnly', name: 'Base only' },
  { id: 'stile', name: 'Stile' },
  { id: 'pilaster', name: 'Pilaster' },
  { id: 'obstruction', name: 'Fireplace, window or other opening' },
];

export function createModule(id: string, template: ModuleTemplate, name = ''): RunModule {
  const section = (over: Partial<SectionModule>): SectionModule => ({
    kind: 'section',
    id,
    name: name || 'Section',
    width: 'auto',
    base: { groups: [{ doors: 2 }], shelves: 1 },
    upper: { kind: 'openBay', shelves: null },
    endPanels: { left: false, right: false },
    ...over,
  });
  switch (template) {
    case 'section':
      return section({});
    case 'tower':
      return section({ name: name || 'Tower', endPanels: { left: true, right: false } });
    case 'baseOnly':
      return section({ name: name || 'Base', upper: null });
    case 'stile':
      return { kind: 'stile', id, width: inch(3) };
    case 'pilaster':
      return { kind: 'pilaster', id, width: inch(6), depth: inch(12) };
    case 'obstruction':
      return {
        kind: 'obstruction',
        id,
        label: name || 'Fireplace',
        width: inch(60),
        height: inch(54),
      };
  }
}
