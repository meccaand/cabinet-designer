import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Box } from '../../core/geometry';
import { fillerPart, placementTransform, wallFrames } from '../../core/layout';
import type { Project } from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { formatLength } from '../../core/units';
import { useViewerStore } from '../store/viewerStore';
import { CabinetObject, PartMesh } from './CabinetObject';
import { CameraRig, FOV } from './CameraRig';
import { Dimensions } from './Dimensions';
import { DIMENSION_OFFSET, unionBounds, type DimensionLine } from './scene';
import styles from './Viewer.module.css';
import { ViewToolbar } from './ViewToolbar';

interface ViewerProps {
  project: Project;
  models: ReadonlyMap<string, CabinetModel | null>;
  activeId: string | null;
  onActivate: (cabinetId: string) => void;
}

/** Room for dimension lines and their labels beyond the cabinet (mm). */
const DIMENSION_ROOM = DIMENSION_OFFSET + 60;
const WALL_THICKNESS = 100;

/**
 * SketchUp-lite viewport: one cabinet on its own (with dimensions), or the whole room with every
 * cabinet in place. Orbit/pan/zoom, standard views, click to select.
 */
export function Viewer({ project, models, activeId, onActivate }: ViewerProps) {
  const orthographic = useViewerStore((s) => s.view !== 'iso');
  const room = useViewerStore((s) => s.scope === 'room');
  const exploded = useViewerStore((s) => s.exploded);
  const select = useViewerStore((s) => s.select);
  const labels = useRef<Partial<Record<DimensionLine['label'], HTMLElement | null>>>({});

  const cabinet = project.cabinets.find((c) => c.id === activeId);
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
    const b = unionBounds(model.parts.map((p) => p.bounds));
    const extra = showDimensions ? DIMENSION_ROOM : 0;
    const dx = -cabinet.width / 2;
    const dz = -cabinet.depth / 2;
    return {
      min: { x: b.min.x + dx, y: b.min.y, z: b.min.z + dz },
      max: { x: b.max.x + dx + extra, y: b.max.y + extra, z: b.max.z + dz },
    };
  }, [room, frames, project.room.walls, cabinet, model, showDimensions]);

  const dims = cabinet
    ? { width: cabinet.width, height: cabinet.height, depth: cabinet.depth }
    : null;

  return (
    <div className={styles.viewer}>
      <ViewToolbar />
      <Canvas
        className={styles.canvas}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => select(null)}
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
        <CameraRig bounds={bounds} frameKey={room ? 'room' : (activeId ?? '')} />

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
                c.placement.offset,
                c.placement.elevation,
              );
              return (
                <group key={c.id} position={t.position} rotation-y={t.rotationY}>
                  <CabinetObject cabinet={c} model={m} onActivate={onActivate} />
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
              <CabinetObject cabinet={cabinet} model={model} onActivate={onActivate} />
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
