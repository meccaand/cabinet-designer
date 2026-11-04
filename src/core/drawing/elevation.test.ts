import { describe, expect, it } from 'vitest';
import { createCabinet, generateCabinet } from '../generate';
import { createProject } from '../model';
import { inch } from '../units';
import { frontElevation } from './index';

const project = createProject('p', 'Drawing');

function draw(type: Parameters<typeof createCabinet>[1], construction = {}) {
  const cabinet = createCabinet(project, type, { id: 'c', construction });
  const r = generateCabinet(cabinet, project);
  if (!r.ok) throw new Error(r.errors.join());
  return { cabinet, model: r.model, drawing: frontElevation(cabinet, r.model, project.units) };
}
const texts = (d: ReturnType<typeof draw>['drawing']) =>
  d.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []));

describe('frontElevation', () => {
  it('draws every part, fronts last, with overall dimensions', () => {
    const { model, drawing } = draw('base');
    const rects = drawing.primitives.filter((p) => p.kind === 'rect');
    expect(rects).toHaveLength(model.parts.length);
    expect(rects.at(-1)).toMatchObject({ fill: 'front' });
    expect(rects.some((r) => r.kind === 'rect' && r.fill === 'kick')).toBe(true);
    expect(texts(drawing).slice(0, 2)).toEqual(['24"', '34 1/2"']);
  });

  it('chains the opening heights down the right-hand side', () => {
    // 24" base: 6" drawer front over doors 30 1/2 − 1/8 − 6 − 1/8 = 24 1/4".
    expect(texts(draw('base').drawing).slice(2)).toEqual(['6"', '24 1/4"']);
    // Face frame: openings, 5" over 21".
    expect(texts(draw('base', { carcass: { style: 'faceFrame' } }).drawing).slice(2)).toEqual([
      '5"',
      '21"',
    ]);
  });

  it('includes face-frame members, panels, blind panels and fillers', () => {
    const fills = (d: ReturnType<typeof draw>['drawing']) =>
      new Set(d.primitives.flatMap((p) => (p.kind === 'rect' ? [p.fill] : [])));
    expect(
      fills(draw('base', { carcass: { style: 'faceFrame' }, fronts: { style: 'shaker' } }).drawing),
    ).toEqual(new Set(['kick', 'carcass', 'frame', 'front', 'panel']));
    expect(fills(draw('blindBase').drawing).has('frame')).toBe(true); // the pull filler
  });

  it('bounds contain everything drawn, including face-frame overhang', () => {
    const { drawing } = draw('wall', {
      carcass: { style: 'faceFrame' },
      faceFrame: { sideOverhang: inch(0.25) },
    });
    const { x0, x1, y0, y1 } = drawing.bounds;
    for (const p of drawing.primitives) {
      const pts =
        p.kind === 'rect'
          ? [
              [p.x, p.y],
              [p.x + p.w, p.y + p.h],
            ]
          : p.kind === 'line'
            ? [
                [p.x1, p.y1],
                [p.x2, p.y2],
              ]
            : [[p.x, p.y]];
      for (const [x, y] of pts) {
        expect(x!).toBeGreaterThanOrEqual(x0);
        expect(x!).toBeLessThanOrEqual(x1);
        expect(y!).toBeGreaterThanOrEqual(y0);
        expect(y!).toBeLessThanOrEqual(y1);
      }
    }
    expect(x0).toBeLessThan(-inch(0.25));
  });
});
