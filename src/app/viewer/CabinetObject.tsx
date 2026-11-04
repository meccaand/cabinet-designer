import { Edges } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { BoxGeometry, Vector3, type Mesh } from 'three';
import { extent } from '../../core/geometry';
import type { Cabinet } from '../../core/model';
import type { CabinetModel, Part } from '../../core/parts';
import { useViewerStore } from '../store/viewerStore';
import { explodeOffset, partColor, visibleParts } from './scene';

/** One shared unit cube; each part scales it to its size. */
const UNIT_BOX = new BoxGeometry(1, 1, 1);
const ACCENT = '#c76a1c';
const EDGE = '#4a4136';

export function CabinetObject({
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
}

/** One part. `cabinetId`/`onActivate` make it selectable; fillers in the room view are not. */
export function PartMesh({
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
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);

  const partSelected = selection?.kind === 'part' && selection.id === part.id;
  const cabinetSelected =
    cabinetId !== undefined &&
    ((selection?.kind === 'cabinet' && selection.id === cabinetId) ||
      (selection?.kind === 'part' && selection.id.startsWith(`${cabinetId}/`)));

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
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh || mesh.position.distanceToSquared(target) < 0.01) return;
    mesh.position.lerp(target, 1 - Math.exp(-dt * 10));
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (cabinetId === undefined) return;
    // First click selects the cabinet; clicking again inside it picks the part (like
    // entering a group in SketchUp).
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
      <Edges color={cabinetSelected ? ACCENT : EDGE} threshold={15} />
    </mesh>
  );
}
