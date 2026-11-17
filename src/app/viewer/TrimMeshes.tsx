import { memo, useMemo } from 'react';
import { BoxGeometry, EdgesGeometry, LineBasicMaterial } from 'three';
import { mouldingBoxes, type MouldingSegment } from '../../core/builtin';
import type { Box } from '../../core/geometry';
import { DEFAULT_HARDWARE_COLOR } from './scene';

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);
const EDGE_LINE = new LineBasicMaterial({ color: '#4a4136' });
/** Drawn, never picked. */
const noRaycast = () => undefined;

/**
 * A run's bought trim (ADR-042): crown and base moulding as plain boxes along the faces (with
 * returns at open ends), and picture lights. In run coordinates; the caller places the run.
 */
export const TrimMeshes = memo(function TrimMeshes({
  mouldings,
  lights,
  color,
  lightColor,
}: {
  mouldings: readonly MouldingSegment[];
  lights: readonly Box[];
  color: string | undefined;
  lightColor: string | undefined;
}) {
  const boxes = useMemo(() => mouldings.flatMap((m) => mouldingBoxes(m)), [mouldings]);
  const mesh = (b: Box, key: string, fill: string, metal: boolean) => (
    <mesh
      key={key}
      geometry={UNIT_BOX}
      position={[(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]}
      scale={[b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]}
      raycast={noRaycast}
    >
      <meshStandardMaterial
        color={fill}
        metalness={metal ? 0.35 : 0}
        roughness={metal ? 0.4 : 0.7}
      />
      {!metal && <lineSegments geometry={UNIT_EDGES} material={EDGE_LINE} raycast={noRaycast} />}
    </mesh>
  );
  return (
    <>
      {boxes.map((b, i) => mesh(b, `m${i}`, color ?? '#e8dcc3', false))}
      {lights.map((b, i) => mesh(b, `l${i}`, lightColor ?? DEFAULT_HARDWARE_COLOR, true))}
    </>
  );
});
