import { useMemo } from 'react';
import { gapsBeside } from '../../core/layout';
import type { Cabinet, Project } from '../../core/model';
import { formatLength } from '../../core/units';
import { projectLayout } from '../models';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';

/** Where a cabinet sits: wall, distance along it, height off the floor, end panels, gaps. */
export function PositionSection({ project, cabinet }: { project: Project; cabinet: Cabinet }) {
  const moveItem = useProjectStore((s) => s.moveItem);
  const update = useProjectStore((s) => s.updateCabinet);
  const fillGap = useProjectStore((s) => s.fillGap);
  const duplicate = useProjectStore((s) => s.duplicateCabinet);
  const select = useViewerStore((s) => s.select);
  const items = useMemo(() => projectLayout(project), [project]);
  const item = items.find((i) => i.id === cabinet.id);
  const gaps = item ? gapsBeside(item, project, items) : null;
  const f = (v: number) => formatLength(v, project.units);

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Position</h3>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="cabinet-wall">Wall</label>
          <select
            id="cabinet-wall"
            className={styles.select}
            value={cabinet.placement.wallId ?? ''}
            onChange={(e) => moveItem(cabinet.id, { wallId: e.target.value })}
          >
            {cabinet.placement.wallId === null && <option value="">Not placed</option>}
            {project.room.walls.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <LengthInput
          label="From wall start"
          value={cabinet.placement.offset}
          units={project.units}
          allowZero
          onCommit={(offset) => moveItem(cabinet.id, { offset })}
        />
        <LengthInput
          label="Off the floor"
          value={cabinet.placement.elevation}
          units={project.units}
          allowZero
          onCommit={(elevation) => moveItem(cabinet.id, { elevation })}
        />
      </div>
      <div className={styles.row}>
        {(['left', 'right'] as const).map((side) => (
          <label key={side} className={styles.check}>
            <input
              type="checkbox"
              checked={cabinet.endPanels[side]}
              onChange={(e) =>
                update(cabinet.id, (c) => void (c.endPanels[side] = e.target.checked))
              }
            />
            {side === 'left' ? 'Left' : 'Right'} end panel
          </label>
        ))}
      </div>
      {gaps && (gaps.left > 0 || gaps.right > 0) && (
        <div className={styles.row}>
          {(['left', 'right'] as const)
            .filter((side) => gaps[side] > 0)
            .map((side) => (
              <button
                key={side}
                type="button"
                className={styles.button}
                onClick={() => {
                  const id = fillGap(cabinet.id, side);
                  if (id) select({ kind: 'filler', id });
                }}
              >
                Fill {f(gaps[side])} gap on the {side}
              </button>
            ))}
        </div>
      )}
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={() => duplicate(cabinet.id)}>
          Duplicate cabinet
        </button>
      </div>
    </section>
  );
}
