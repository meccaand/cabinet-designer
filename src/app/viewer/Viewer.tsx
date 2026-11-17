import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Box } from '../../core/geometry';
import { fillerPart, placedOffset, placementTransform, wallFrames } from '../../core/layout';
import type { ExpandedProject } from '../../core/builtin';
import { cabinetStyle, type Project } from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { formatLength } from '../../core/units';
import { useViewerStore } from '../store/viewerStore';
import { CabinetObject, PartMesh } from './CabinetObject';
import { CameraRig, FOV } from './CameraRig';
import { Dimensions } from './Dimensions';
import { DIMENSION_OFFSET, explodeOffset, unionBounds, type DimensionLine } from './scene';
import styles from './Viewer.module.css';
import { ViewToolbar } from './ViewToolbar';
import { TrimMeshes } from './TrimMeshes';

interface ViewerProps {
  project: Project;
  /** Built-ins as built: their countertops and obstructions are drawn in the room (ADR-040). */
  built?: ExpandedProject;
  models: ReadonlyMap<string, CabinetModel | null>;
  activeId: string | null;
  onActivate: (cabinetId: string) => void;
  /** Just the room, without the view toolbar: setting up a room and placing a first cabinet.
   * It reframes whenever the walls change. */
  roomOnly?: boolean;
}

/** Room for dimension lines and their labels beyond the cabinet (mm). */
const DIMENSION_ROOM = DIMENSION_OFFSET + 60;
const WALL_THICKNESS = 100;

/**
 * SketchUp-lite viewport: one cabinet on its own (with dimensions), or the whole room with every
 * cabinet in place. Orbit/pan/zoom, standard views, click to select.
 */
export function Viewer({
  project,
  built,
  models,
  activeId,
  onActivate,
  roomOnly = false,
}: ViewerProps) {
  const orthographic = useViewerStore((s) => s.view !== 'iso');
  const cabinet = project.cabinets.find((c) => c.id === activeId);
  // With no cabinet picked there is only the room to show.
  const room = useViewerStore((s) => s.scope === 'room') || roomOnly || !cabinet;
  const exploded = useViewerStore((s) => s.exploded);
  const select = useViewerStore((s) => s.select);
  const labels = useRef<Partial<Record<DimensionLine['label'], HTMLElement | null>>>({});

  const model = cabinet ? models.get(cabinet.id) : null;
  // Overall dimensions describe one assembled cabinet.
  const showDimensions = useViewerStore((s) => s.dimensions) && !exploded && !room && !!cabinet;
  const frames = useMemo(() => wallFrames(project.room), [project.room]);

  const bounds: Box = useMemo(() => {
    if (room) {
      const pts = frames.flatMap((f) => [f.start, f.end]);
      const top = Math.max(1000, ...project.room.walls.map((w) => w.height));
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      const pad = 300;
      return {
        min: { x: Math.min(0, ...xs) - pad, y: 0, z: Math.min(0, ...zs) - pad },
        max: { x: Math.max(1000, ...xs) + pad, y: top, z: Math.max(1000, ...zs) + pad },
      };
    }
    if (!cabinet || !model)
      return { min: { x: -500, y: 0, z: -500 }, max: { x: 500, y: 900, z: 500 } };
    // Exploded, the parts' resting places are framed so nothing flies out of view.
    const b = unionBounds(
      model.parts.map((p) => {
        if (!exploded) return p.bounds;
        const [x, y, z] = explodeOffset(p, cabinet.width);
        return {
          min: { x: p.bounds.min.x + x, y: p.bounds.min.y + y, z: p.bounds.min.z + z },
          max: { x: p.bounds.max.x + x, y: p.bounds.max.y + y, z: p.bounds.max.z + z },
        };
      }),
    );
    const extra = showDimensions ? DIMENSION_ROOM : 0;
    const dx = -cabinet.width / 2;
    const dz = -cabinet.depth / 2;
    return {
      min: { x: b.min.x + dx, y: b.min.y, z: b.min.z + dz },
      max: { x: b.max.x + dx + extra, y: b.max.y + extra, z: b.max.z + dz },
    };
  }, [room, frames, project.room.walls, cabinet, model, showDimensions, exploded]);

  const dims = cabinet
    ? { width: cabinet.width, height: cabinet.height, depth: cabinet.depth }
    : null;

  return (
    <div className={styles.viewer}>
      {!roomOnly && <ViewToolbar />}
      <Canvas
        className={styles.canvas}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        // Draw only when something changes (camera, props, an animation step), not 60 times a
        // second: an idle room costs no CPU or battery (ADR-033).
        frameloop="demand"
        onPointerMissed={() => select(null)}
        role="img"
        aria-label={
          room ? `3D model of ${project.name}` : `3D model of ${cabinet?.name ?? 'cabinet'}`
        }
      >
        {orthographic ? (
          <OrthographicCamera makeDefault near={1} far={100_000} />
        ) : (
          <PerspectiveCamera makeDefault fov={FOV} near={10} far={100_000} />
        )}
        <OrbitControls makeDefault enableDamping={false} />
        <CameraRig
          bounds={bounds}
          fromLeft={!room && cabinet?.corner !== undefined}
          frameKey={
            roomOnly
              ? `room:${project.room.walls.map((w) => `${w.length}x${w.height}`).join()}`
              : room
                ? 'room'
                : `${activeId ?? ''}${exploded ? ':exploded' : ''}`
          }
        />

        <hemisphereLight args={['#ffffff', '#8a7b66', 1.6]} />
        <directionalLight position={[1500, 3000, 2500]} intensity={1.8} />
        <directionalLight position={[-2000, 1200, -1000]} intensity={0.5} />

        {room ? (
          <>
            {project.cabinets.map((c) => {
              const m = models.get(c.id);
              if (!m) return null;
              const t = placementTransform(
                frames.find((f) => f.wall.id === c.placement.wallId),
                placedOffset(c, frames),
                c.placement.elevation,
              );
              return (
                <group key={c.id} position={t.position} rotation-y={t.rotationY}>
                  <CabinetObject
                    cabinet={c}
                    model={m}
                    finish={cabinetStyle(project, c)?.finish}
                    onActivate={onActivate}
                  />
                </group>
              );
            })}
            {project.fillers.map((f) => {
              const t = placementTransform(
                frames.find((w) => w.wall.id === f.wallId),
                f.offset,
                f.elevation,
              );
              return (
                <group key={f.id} position={t.position} rotation-y={t.rotationY}>
                  <PartMesh part={fillerPart(f, project)} ownerWidth={f.width} />
                </group>
              );
            })}
            {built?.assemblies.map((a) => {
              const t = placementTransform(
                frames.find((w) => w.wall.id === a.wallId),
                a.offset,
                0,
              );
              const owner = project.builtIns.find((b) => b.id === a.builtInId);
              const finish = owner?.styleId
                ? project.stylePresets.find((st) => st.id === owner.styleId)?.finish
                : undefined;
              return (
                <group key={a.id} position={t.position} rotation-y={t.rotationY}>
                  {a.model.parts.map((p) => (
                    <PartMesh key={p.id} part={p} ownerWidth={0} finish={finish} />
                  ))}
                  <TrimMeshes
                    mouldings={a.mouldings}
                    lights={a.lights}
                    color={finish?.kind === 'clear' ? undefined : finish?.color}
                    lightColor={finish?.hardwareColor}
                  />
                </group>
              );
            })}
            {built?.obstructions.map((o) => {
              const t = placementTransform(
                frames.find((w) => w.wall.id === o.wallId),
                o.offset,
                0,
              );
              return (
                <group key={o.id} position={t.position} rotation-y={t.rotationY}>
                  <mesh
                    position={[o.width / 2, o.height / 2, o.depth / 2]}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <boxGeometry args={[o.width, o.height, o.depth]} />
                    <meshStandardMaterial
                      color="#b9b2a6"
                      transparent
                      opacity={0.3}
                      depthWrite={false}
                    />
                  </mesh>
                </group>
              );
            })}
            {frames.map((f) => (
              <mesh
                key={f.wall.id}
                position={[
                  (f.start[0] + f.end[0]) / 2 - (f.normal[0] * WALL_THICKNESS) / 2,
                  f.wall.height / 2,
                  (f.start[1] + f.end[1]) / 2 - (f.normal[1] * WALL_THICKNESS) / 2,
                ]}
                rotation-y={Math.atan2(-f.dir[1], f.dir[0])}
                onClick={(e) => e.stopPropagation()}
              >
                <boxGeometry args={[f.wall.length, f.wall.height, WALL_THICKNESS]} />
                <meshStandardMaterial
                  color="#e9e4da"
                  transparent
                  opacity={0.35}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </>
        ) : (
          cabinet &&
          model && (
            // The cabinet is centred on the origin in plan; it stands on the floor (y = 0).
            <group position={[-cabinet.width / 2, 0, -cabinet.depth / 2]}>
              <CabinetObject
                cabinet={cabinet}
                model={model}
                finish={cabinetStyle(project, cabinet)?.finish}
                onActivate={onActivate}
              />
              {showDimensions && dims && <Dimensions {...dims} labels={labels} />}
            </group>
          )
        )}
        <Grid
          position={[0, -0.5, 0]}
          infiniteGrid
          cellSize={100}
          sectionSize={1000}
          cellColor="#b8b2a7"
          sectionColor="#9a9389"
          fadeDistance={room ? 20000 : 9000}
        />
      </Canvas>
      {showDimensions && dims && (
        <div className={styles.labels} aria-hidden="true">
          {(Object.keys(dims) as DimensionLine['label'][]).map((d) => (
            <span
              key={d}
              ref={(el) => {
                labels.current[d] = el;
              }}
              className={styles.dimension}
              data-dimension={d}
            >
              {formatLength(dims[d], project.units)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
