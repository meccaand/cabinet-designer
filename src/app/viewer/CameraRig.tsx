import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrthographicCamera, type Vector3 } from 'three';
import type { Box } from '../../core/geometry';
import { useViewerStore } from '../store/viewerStore';
import { fitCamera } from './scene';

export const FOV = 35;

/** Height of the view tabs and toolbar overlays, kept clear when framing. */
const TOOLBAR_PX = 90;

/**
 * Frames `bounds` (world coordinates) when a view is requested or `frameKey` changes (a
 * different cabinet, or switching to the room), not on every edit.
 */
export function CameraRig({
  bounds,
  frameKey,
  fromLeft = false,
  isoDirection,
}: {
  bounds: Box;
  frameKey: string;
  /** See fitCamera: for L-shaped cabinets. */
  fromLeft?: boolean;
  /** See fitCamera: for a room. Reframes only when its value changes. */
  isoDirection?: readonly [number, number, number] | undefined;
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
  const latest = useRef(bounds);
  const latestDir = useRef(isoDirection);
  useEffect(() => {
    latest.current = bounds;
    latestDir.current = isoDirection;
  });
  const dirKey = isoDirection?.map((v) => v.toFixed(3)).join() ?? '';

  useEffect(() => {
    if (!controls || width === 0 || height === 0) return;
    const fit = fitCamera(
      latest.current,
      view,
      { width, height },
      FOV,
      TOOLBAR_PX,
      fromLeft,
      latestDir.current,
    );
    const cam = get().camera;
    cam.position.set(...fit.position);
    if (cam instanceof OrthographicCamera) cam.zoom = fit.zoom;
    cam.updateProjectionMatrix();
    controls.target.set(...fit.target);
    controls.update();
    get().invalidate();
  }, [request, view, frameKey, camera, controls, width, height, get, fromLeft, dirKey]);

  return null;
}
