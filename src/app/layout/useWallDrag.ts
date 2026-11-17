import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { snapOffset, type LayoutItem } from '../../core/layout';
import type { Project } from '../../core/model';
import type { Mm } from '../../core/units';

/** Pixels within which a dragged item snaps to a wall end or neighbour. */
const SNAP_PX = 14;

interface Drag {
  id: string;
  /** Pointer position along the wall at the start, and the item's offset then. */
  startAlong: Mm;
  startOffset: Mm;
  moved: boolean;
}

/**
 * Drag cabinets and fillers along their wall in a 2D view. `along` converts a pointer event to
 * a distance along a wall (mm); `mmPerPx` sets the snap distance. The move is previewed while
 * dragging and committed once on release (one undo step).
 */
export function useWallDrag(opts: {
  project: Project;
  items: LayoutItem[];
  along: (e: ReactPointerEvent, wallId: string) => Mm;
  mmPerPx: () => Mm;
  onCommit: (id: string, offset: Mm) => void;
  onSelect: (item: LayoutItem) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; offset: Mm } | null>(null);

  const start = (e: ReactPointerEvent<Element>, item: LayoutItem) => {
    if (e.button !== 0 || !item.wallId) return;
    e.stopPropagation();
    // L-shaped cabinets stay in their corner, and a built-in's boxes move with their run: a
    // press only selects them.
    if (item.inCorner || item.locked) return opts.onSelect(item);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = {
      id: item.id,
      startAlong: opts.along(e, item.wallId),
      startOffset: item.offset,
      moved: false,
    };
    opts.onSelect(item);
  };

  const move = (e: ReactPointerEvent<Element>, item: LayoutItem) => {
    const d = drag.current;
    if (!d || d.id !== item.id || !item.wallId) return;
    const proposed = d.startOffset + opts.along(e, item.wallId) - d.startAlong;
    const offset = snapOffset(
      item,
      item.wallId,
      proposed,
      opts.project,
      opts.items,
      SNAP_PX * opts.mmPerPx(),
    );
    if (Math.abs(offset - d.startOffset) > 0.5) d.moved = true;
    setPreview({ id: item.id, offset });
  };

  const end = (e: ReactPointerEvent<Element>, item: LayoutItem) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (d?.moved && preview && preview.id === item.id && preview.offset !== item.offset) {
      opts.onCommit(item.id, preview.offset);
    }
    setPreview(null);
  };

  /** The offset to draw an item at: its preview while dragged. */
  const offsetOf = (item: LayoutItem) => (preview?.id === item.id ? preview.offset : item.offset);
  return { start, move, end, offsetOf, dragging: preview?.id ?? null };
}
