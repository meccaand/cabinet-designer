import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { OrthographicCamera, type Vector3 } from 'three';
import type { CabinetModel } from '../../core/parts';
import { useViewerStore } from '../store/viewerStore';
import { DIMENSION_OFFSET, fitCamera, unionBounds } from './scene';

/** Height of the view toolbar overlay, kept clear when framing. */
const TOOLBAR_PX = 48;
/** Room for dimension lines and their labels beyond the cabinet (mm). */
const DIMENSION_ROOM = DIMENSION_OFFSET + 60;

export const FOV = 35;

/** Frames the cabinet whenever a view is requested or a different cabinet is shown. */
export function CameraRig({
  model,
  cabinetWidth,
  cabinetDepth,
}: {
  model: CabinetModel;
  cabinetWidth: number;
  cabinetDepth: number;
}) {
  // Subscribed so a projection switch re-frames; mutated through get() as R3F intends.
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  // OrbitControls registered by drei's `makeDefault`.
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    update(): void;
  } | null;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const view = useViewerStore((s) => s.view);
  const request = useViewerStore((s) => s.viewRequest);
  const dimensions = useViewerStore((s) => s.dimensions && !s.exploded);
  const cabinetId = model.cabinetId;

  useEffect(() => {
    if (!controls || width === 0 || height === 0) return;
    const b = unionBounds(model.parts.map((p) => p.bounds));
    // Parts are in cabinet coordinates; the scene centres the cabinet on the origin.
    const dx = -cabinetWidth / 2;
    const dz = -cabinetDepth / 2;
    const room = dimensions ? DIMENSION_ROOM : 0;
    const bounds = {
      min: { x: b.min.x + dx, y: b.min.y, z: b.min.z + dz },
      max: { x: b.max.x + dx + room, y: b.max.y + room, z: b.max.z + dz },
    };
    const fit = fitCamera(bounds, view, { width, height }, FOV, TOOLBAR_PX);
    const cam = get().camera;
    cam.position.set(...fit.position);
    if (cam instanceof OrthographicCamera) cam.zoom = fit.zoom;
    cam.updateProjectionMatrix();
    controls.target.set(...fit.target);
    controls.update();
    // Re-frame on a new view request or a different cabinet, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, view, cabinetId, camera, controls, width, height, get, dimensions]);

  return null;
}
