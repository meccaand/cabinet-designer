/**
 * Style preset templates (ADR-039). A template is a starting point: the project gets its own
 * copy, which the user edits freely.
 */
import { inch } from '../units';
import type { StylePreset } from './schema';

export type StyleTemplateId = 'traditionalPainted' | 'blank';

export const STYLE_TEMPLATES: { id: StyleTemplateId; name: string; description: string }[] = [
  {
    id: 'traditionalPainted',
    name: 'Traditional painted built-in',
    description:
      'Face frame, inset Shaker doors, round brass knobs, 1 1/2" shelf nosing, flush plinth, painted gray-green.',
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'The project defaults with a clear finish, to build your own.',
  },
];

/** A new preset from a template. The caller supplies the id (core has no randomness, ADR-001). */
export function createStylePreset(id: string, template: StyleTemplateId): StylePreset {
  if (template === 'blank') {
    return {
      id,
      name: 'New style',
      construction: {},
      finish: { kind: 'clear', color: '#d9c3a0', sheen: 'satin', hardwareColor: '#3a3a3a' },
    };
  }
  return {
    id,
    name: 'Traditional painted built-in',
    construction: {
      carcass: { style: 'faceFrame' },
      // A flush plinth: the ladder base with no toe-kick recess (ADR-038).
      platform: { enabled: true, height: inch(4.5), setback: 0 },
      fronts: { style: 'shaker', mount: 'inset' },
      // Wide stiles; the mullion between door groups a little wider still.
      faceFrame: { stileWidth: inch(2.25), railWidth: inch(2.25), mullionWidth: inch(2.5) },
      shaker: { stileWidth: inch(2.25), railWidth: inch(2.25) },
      shelves: { nosingHeight: inch(1.5) },
      hardware: { handle: 'knob', knobDiameter: inch(1.125), handleFromEnd: inch(2.75) },
      // Recessed-panel ends: a 1/4" frame applied over the end panel (ADR-041).
      endPanel: { style: 'framed' },
    },
    finish: { kind: 'paint', color: '#8a9a97', sheen: 'satin', hardwareColor: '#9c7a3c' },
  };
}
