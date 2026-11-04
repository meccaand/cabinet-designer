import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import { overallDimensions, type DimensionLine } from './scene';

const LINE = '#5b5348';
const point = new Vector3();
/** Lines shorter than this on screen get no label. */
const MIN_LABELLED_PX = 40;

/**
 * Overall W × H × D dimension lines. Labels are plain DOM elements (rendered by the Viewer
 * above the canvas) that this component moves to each line's projected midpoint every frame.
 */
export function Dimensions({
  width,
  height,
  depth,
  labels,
}: {
  width: number;
  height: number;
  depth: number;
  labels: RefObject<Partial<Record<DimensionLine['label'], HTMLElement | null>>>;
}) {
  const group = useRef<Group>(null);
  const lines = overallDimensions(width, height, depth);

  // Per-frame DOM writes are the documented react-three-fiber pattern for overlays; going
  // through React state here would re-render 60 times a second.
  /* eslint-disable react-hooks/immutability */
  useFrame(({ camera, size }) => {
    const g = group.current;
    if (!g) return;
    for (const d of lines) {
      const el = labels.current[d.label];
      if (!el) continue;
      const toScreen = (p: readonly [number, number, number]) => {
        point.set(...p);
        g.localToWorld(point).project(camera);
        return {
          x: ((point.x + 1) / 2) * size.width,
          y: ((1 - point.y) / 2) * size.height,
          behind: point.z > 1,
        };
      };
      const a = toScreen(d.from);
      const b = toScreen(d.to);
      // A line seen end-on (e.g. height in the top view) shrinks to a dot; its label would only
      // clutter the drawing.
      const foreshortened = Math.hypot(a.x - b.x, a.y - b.y) < MIN_LABELLED_PX;
      el.style.visibility = a.behind || b.behind || foreshortened ? 'hidden' : 'visible';
      el.style.transform = `translate(${(a.x + b.x) / 2}px, ${(a.y + b.y) / 2}px) translate(-50%, -50%)`;
    }
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={group}>
      {lines.map((d) => (
        <group key={d.label}>
          <Line points={[d.from, d.to]} color={LINE} lineWidth={1.2} />
          {d.ticks.map((t, i) => (
            <Line key={i} points={t} color={LINE} lineWidth={1.2} />
          ))}
        </group>
      ))}
    </group>
  );
}
