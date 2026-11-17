import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { produce } from 'immer';
import { wallElevation } from '../../core/drawing';
import type { Assembly, Obstruction } from '../../core/builtin';
import type { LayoutItem } from '../../core/layout';
import type { Project } from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { DrawingSvg, flipY } from '../ui/DrawingSvg';
import formStyles from '../ui/Form.module.css';
import styles from './LayoutViews.module.css';
import { useWallDrag } from './useWallDrag';

/**
 * One wall seen from the room, with every cabinet and filler on it and chained widths and gaps.
 * Drag items sideways to move them along the wall.
 */
export function ElevationView({
  project,
  models,
  items,
  wallId,
  onWall,
  selectedId,
  onSelect,
  onMove,
  extras,
}: {
  project: Project;
  models: ReadonlyMap<string, CabinetModel | null>;
  items: LayoutItem[];
  wallId: string;
  onWall: (id: string) => void;
  selectedId: string | null;
  onSelect: (item: LayoutItem | null) => void;
  onMove: (id: string, offset: number) => void;
  /** Built-ins' countertops and obstructions (ADR-040). */
  extras?: { assemblies: readonly Assembly[]; obstructions: readonly Obstruction[] };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const onWallItems = items.filter((i) => i.wallId === wallId);
  const svgOf = () => wrap.current?.querySelector('svg') ?? null;
  const drag = useWallDrag({
    project,
    items,
    along: (e: ReactPointerEvent) => {
      const m = svgOf()?.getScreenCTM();
      return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x : 0;
    },
    mmPerPx: () => {
      const s = svgOf();
      return s ? s.viewBox.baseVal.width / (s.clientWidth || 1) : 1;
    },
    onCommit: onMove,
    onSelect,
  });

  // While dragging, draw the item where it would land.
  const shown = useMemo(() => {
    const id = drag.dragging;
    const item = items.find((i) => i.id === id);
    if (!id || !item) return project;
    const offset = drag.offsetOf(item);
    return produce(project, (p) => {
      const c = p.cabinets.find((x) => x.id === id);
      if (c) c.placement.offset = offset;
      const f = p.fillers.find((x) => x.id === id);
      if (f) f.offset = offset;
    });
  }, [project, items, drag]);
  const drawing = useMemo(
    () => wallElevation(shown, wallId, models, extras),
    [shown, wallId, models, extras],
  );

  return (
    <div className={styles.view} ref={wrap}>
      <div className={styles.bar}>
        <label className={formStyles.label} htmlFor="elevation-wall">
          Wall
        </label>
        <select
          id="elevation-wall"
          className={formStyles.select}
          style={{ width: 'auto' }}
          value={wallId}
          onChange={(e) => onWall(e.target.value)}
        >
          {project.room.walls.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <DrawingSvg
        drawing={drawing}
        label={`Elevation of ${project.room.walls.find((w) => w.id === wallId)?.name ?? 'wall'}`}
        tall
      >
        {onWallItems.map((item) => {
          const offset = drag.offsetOf(item);
          return (
            <rect
              key={item.isReturn ? `${item.id}:return` : item.id}
              x={offset + item.x0}
              y={flipY(item.elevation + item.height)}
              width={item.x1 - item.x0}
              height={item.height}
              className={item.id === selectedId ? styles.hitSelected : styles.hit}
              role="button"
              aria-label={`${item.name}${item.isReturn ? ' (return)' : ''} on elevation`}
              aria-pressed={item.id === selectedId}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                onSelect(item);
              }}
              onPointerDown={(e) => drag.start(e, item)}
              onPointerMove={(e) => drag.move(e, item)}
              onPointerUp={(e) => drag.end(e, item)}
            />
          );
        })}
      </DrawingSvg>
    </div>
  );
}
