import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import type { Cabinet, UnitSettings } from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { formatLength } from '../../core/units';
import { useViewerStore } from '../store/viewerStore';
import { CabinetObject } from './CabinetObject';
import { CameraRig, FOV } from './CameraRig';
import { Dimensions } from './Dimensions';
import type { DimensionLine } from './scene';
import styles from './Viewer.module.css';
import { ViewToolbar } from './ViewToolbar';

interface ViewerProps {
  cabinet: Cabinet;
  model: CabinetModel;
  units: UnitSettings;
}

/** SketchUp-lite viewport for one cabinet: orbit/pan/zoom, standard views, selection. */
export function Viewer({ cabinet, model, units }: ViewerProps) {
  const orthographic = useViewerStore((s) => s.view !== 'iso');
  // Overall dimensions describe the assembled cabinet, so they're hidden while exploded.
  const showDimensions = useViewerStore((s) => s.dimensions && !s.exploded);
  const select = useViewerStore((s) => s.select);
  const labels = useRef<Partial<Record<DimensionLine['label'], HTMLElement | null>>>({});
  const dims = { width: cabinet.width, height: cabinet.height, depth: cabinet.depth };

  return (
    <div className={styles.viewer}>
      <ViewToolbar />
      <Canvas
        className={styles.canvas}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => select(null)}
        aria-label={`3D model of ${cabinet.name}`}
      >
        {orthographic ? (
          <OrthographicCamera makeDefault near={1} far={50_000} />
        ) : (
          <PerspectiveCamera makeDefault fov={FOV} near={10} far={50_000} />
        )}
        <OrbitControls makeDefault enableDamping={false} />
        <CameraRig model={model} cabinetWidth={cabinet.width} cabinetDepth={cabinet.depth} />

        <hemisphereLight args={['#ffffff', '#8a7b66', 1.6]} />
        <directionalLight position={[1500, 3000, 2500]} intensity={1.8} />
        <directionalLight position={[-2000, 1200, -1000]} intensity={0.5} />

        {/* The cabinet is centred on the origin in plan; it stands on the floor (y = 0). */}
        <group position={[-cabinet.width / 2, 0, -cabinet.depth / 2]}>
          <CabinetObject cabinet={cabinet} model={model} />
          {showDimensions && <Dimensions {...dims} labels={labels} />}
        </group>
        <Grid
          position={[0, -0.5, 0]}
          infiniteGrid
          cellSize={100}
          sectionSize={1000}
          cellColor="#b8b2a7"
          sectionColor="#9a9389"
          fadeDistance={9000}
        />
      </Canvas>
      {showDimensions && (
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
              {formatLength(dims[d], units)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
