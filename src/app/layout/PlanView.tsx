import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  footprint,
  layoutIssues,
  roomBounds,
  wallFrames,
  type LayoutItem,
  type Vec2,
} from '../../core/layout';
import type { Project } from '../../core/model';
import { formatLength } from '../../core/units';
import styles from './LayoutViews.module.css';
import { useWallDrag } from './useWallDrag';

const WALL_T = 100;

/**
 * Top-down room plan. Walls are drawn behind their line; cabinets and fillers show their
 * footprint with the front edge marked. Drag an item along its wall; it snaps to wall ends,
 * corner runs and neighbours.
 */
export function PlanView({
  project,
  items,
  selectedId,
  onSelect,
  onMove,
}: {
  project: Project;
  items: LayoutItem[];
  selectedId: string | null;
  onSelect: (item: LayoutItem | null) => void;
  onMove: (id: string, offset: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const frames = useMemo(() => wallFrames(project.room), [project.room]);
  const issues = useMemo(() => layoutIssues(project, items), [project, items]);
  const flagged = new Set(issues.flatMap((i) => i.ids));
  const b = roomBounds(project.room);
  const size = Math.max(b.x1 - b.x0, b.z1 - b.z0, 1000);
  const pad = size * 0.12;
  const text = size * 0.022;
  const view = { x: b.x0 - pad, y: b.z0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.z1 - b.z0 + 2 * pad };

  const toPlan = (e: ReactPointerEvent): Vec2 => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const drag = useWallDrag({
    project,
    items,
    along: (e, wallId) => {
      const f = frames.find((w) => w.wall.id === wallId);
      if (!f) return 0;
      const [x, z] = toPlan(e);
      return (x - f.start[0]) * f.dir[0] + (z - f.start[1]) * f.dir[1];
    },
    mmPerPx: () => view.w / (svg.current?.clientWidth || 1),
    onCommit: onMove,
    onSelect,
  });

  return (
    <div className={styles.view}>
      <svg
        ref={svg}
        className={styles.svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="group"
        aria-label={`Plan of ${project.name}`}
        style={{ ['--stroke' as string]: `${size * 0.0016}` }}
        onPointerDown={() => onSelect(null)}
      >
        {frames.map((f) => {
          const [nx, nz] = f.normal;
          const pts = [
            f.start,
            f.end,
            [f.end[0] - nx * WALL_T, f.end[1] - nz * WALL_T],
            [f.start[0] - nx * WALL_T, f.start[1] - nz * WALL_T],
          ];
          const mid: Vec2 = [
            (f.start[0] + f.end[0]) / 2 - nx * WALL_T * 3,
            (f.start[1] + f.end[1]) / 2 - nz * WALL_T * 3,
          ];
          const vertical = f.dir[0] === 0;
          return (
            <g key={f.wall.id}>
              <polygon points={pts.map((p) => p.join(',')).join(' ')} className={styles.wall} />
              <text
                x={mid[0]}
                y={mid[1]}
                fontSize={text}
                textAnchor="middle"
                dominantBaseline="middle"
                className={styles.label}
                transform={vertical ? `rotate(-90 ${mid[0]} ${mid[1]})` : undefined}
              >
                {f.wall.name} · {formatLength(f.wall.length, project.units)}
              </text>
            </g>
          );
        })}
        {[...items]
          .sort((a, c) => a.elevation - c.elevation)
          .map((item) => {
            const shown = { ...item, offset: drag.offsetOf(item) };
            const r = footprint(shown, frames);
            const f = frames.find((w) => w.wall.id === item.wallId);
            const raised = item.elevation >= 1;
            const cls = [
              item.kind === 'filler' ? styles.filler : raised ? styles.upper : styles.cabinet,
              item.id === selectedId ? styles.selected : '',
              flagged.has(item.id) ? styles.problem : '',
            ].join(' ');
            // Front edge: local z = depth along the item's width.
            const front = f
              ? ([shown.x0, shown.x1].map((x) => [
                  f.start[0] + f.dir[0] * (shown.offset + x) + f.normal[0] * shown.depth,
                  f.start[1] + f.dir[1] * (shown.offset + x) + f.normal[1] * shown.depth,
                ]) as [Vec2, Vec2])
              : null;
            const cx = (r.x0 + r.x1) / 2;
            const cz = (r.z0 + r.z1) / 2;
            const vertical = f ? f.dir[0] === 0 : false;
            return (
              <g
                key={item.id}
                role="button"
                aria-label={`${item.name} on plan`}
                aria-pressed={item.id === selectedId}
                className={styles.item}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelect(item);
                }}
                onPointerDown={(e) => drag.start(e, item)}
                onPointerMove={(e) => drag.move(e, item)}
                onPointerUp={(e) => drag.end(e, item)}
              >
                <rect x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} className={cls} />
                {front && (
                  <line
                    x1={front[0][0]}
                    y1={front[0][1]}
                    x2={front[1][0]}
                    y2={front[1][1]}
                    className={styles.front}
                  />
                )}
                {item.kind === 'cabinet' && !raised && (
                  <text
                    x={cx}
                    y={cz}
                    fontSize={text * 0.8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.itemLabel}
                    transform={vertical ? `rotate(-90 ${cx} ${cz})` : undefined}
                  >
                    {formatLength(item.x1 - item.x0, project.units)}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      <ul className={styles.issues} aria-label="Layout problems">
        {issues.map((i) => (
          <li key={i.message}>{i.message}</li>
        ))}
      </ul>
      <p className={styles.legend}>
        Drag cabinets along their wall. Solid: floor cabinets · dashed: wall cabinets · dark:
        fillers.
      </p>
    </div>
  );
}
