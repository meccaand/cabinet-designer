import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useMemo, useRef, useState } from 'react';
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, Vector3, type Mesh } from 'three';
import { extent } from '../../core/geometry';
import type { Cabinet } from '../../core/model';
import type { CabinetModel, Part } from '../../core/parts';
import { useViewerStore } from '../store/viewerStore';
import { explodeOffset, partColor, visibleParts } from './scene';

/**
 * One shared unit cube and its outline; each part scales them to its size. A room of 60
 * cabinets has ~1,400 parts, so nothing per part is built that can be shared (ADR-033).
 */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);
const ACCENT = '#c76a1c';
const EDGE_LINE = new LineBasicMaterial({ color: '#4a4136' });
const SELECTED_LINE = new LineBasicMaterial({ color: ACCENT });
/** Outlines are drawn, never picked: clicks go to the part's faces. */
const noRaycast = () => undefined;

export const CabinetObject = memo(function CabinetObject({
  cabinet,
  model,
  onActivate,
}: {
  cabinet: Cabinet;
  model: CabinetModel;
  onActivate: (cabinetId: string) => void;
}) {
  const hiddenParts = useViewerStore((s) => s.hiddenParts);
  const hiddenGroups = useViewerStore((s) => s.hiddenGroups);
  const visible = visibleParts(model.parts, hiddenParts, hiddenGroups);
  return (
    <group name={cabinet.id}>
      {visible.map((p) => (
        <PartMesh
          key={p.id}
          part={p}
          ownerWidth={cabinet.width}
          cabinetId={cabinet.id}
          onActivate={onActivate}
        />
      ))}
    </group>
  );
});

/** One part. `cabinetId`/`onActivate` make it selectable; fillers in the room view are not. */
export const PartMesh = memo(function PartMesh({
  part,
  ownerWidth,
  cabinetId,
  onActivate,
}: {
  part: Part;
  ownerWidth: number;
  cabinetId?: string;
  onActivate?: (cabinetId: string) => void;
}) {
  const ref = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const exploded = useViewerStore((s) => s.exploded);
  const xray = useViewerStore((s) => s.xray);
  // Booleans, so a new selection re-renders only the parts it changes.
  const partSelected = useViewerStore(
    (s) => s.selection?.kind === 'part' && s.selection.id === part.id,
  );
  const cabinetSelected = useViewerStore(
    (s) =>
      cabinetId !== undefined &&
      ((s.selection?.kind === 'cabinet' && s.selection.id === cabinetId) ||
        (s.selection?.kind === 'part' && s.selection.id.startsWith(`${cabinetId}/`))),
  );

  const { center, size } = useMemo(() => {
    const b = part.bounds;
    return {
      center: new Vector3(
        (b.min.x + b.max.x) / 2,
        (b.min.y + b.max.y) / 2,
        (b.min.z + b.max.z) / 2,
      ),
      size: [extent(b, 'x'), extent(b, 'y'), extent(b, 'z')] as const,
    };
  }, [part.bounds]);
  const target = useMemo(() => {
    const t = center.clone();
    if (exploded) t.add(new Vector3(...explodeOffset(part, ownerWidth)));
    return t;
  }, [center, exploded, part, ownerWidth]);

  // Glide between assembled and exploded positions.
  useFrame((state, dt) => {
    const mesh = ref.current;
    if (!mesh || mesh.position.distanceToSquared(target) < 0.01) return;
    mesh.position.lerp(target, 1 - Math.exp(-dt * 10));
    state.invalidate(); // on-demand rendering: ask for the next step
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (cabinetId === undefined) return;
    // First click selects the cabinet; clicking again inside it picks the part (like
    // entering a group in SketchUp).
    const { select } = useViewerStore.getState();
    if (cabinetSelected) select({ kind: 'part', id: part.id });
    else {
      onActivate?.(cabinetId);
      select({ kind: 'cabinet', id: cabinetId });
    }
  };

  return (
    <mesh
      ref={ref}
      name={part.id}
      geometry={UNIT_BOX}
      position={target}
      scale={size}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (cabinetId === undefined) return;
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      {/* Remounted on x-ray toggle: three.js must recompile a material whose transparency changes. */}
      <meshStandardMaterial
        key={xray ? 'xray' : 'solid'}
        color={partSelected ? ACCENT : partColor(part)}
        emissive={partSelected || hovered ? ACCENT : '#000000'}
        emissiveIntensity={partSelected ? 0.35 : hovered ? 0.12 : 0}
        transparent={xray}
        opacity={xray ? (partSelected ? 0.75 : 0.14) : 1}
        depthWrite={!xray}
      />
      <lineSegments
        geometry={UNIT_EDGES}
        material={cabinetSelected ? SELECTED_LINE : EDGE_LINE}
        raycast={noRaycast}
      />
    </mesh>
  );
});
