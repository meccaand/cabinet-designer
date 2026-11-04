import type { Filler, Project } from '../../core/model';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';

/** A filler strip: size and position on its wall. */
export function FillerEditor({ project, filler }: { project: Project; filler: Filler }) {
  const update = useProjectStore((s) => s.updateFiller);
  const remove = useProjectStore((s) => s.deleteFiller);
  const select = useViewerStore((s) => s.select);
  const len = (
    label: string,
    value: number,
    set: (f: Filler, v: number) => void,
    allowZero = false,
  ) => (
    <LengthInput
      label={label}
      value={value}
      units={project.units}
      allowZero={allowZero}
      onCommit={(v) => update(filler.id, (f) => set(f, v))}
    />
  );
  const wall = project.room.walls.find((w) => w.id === filler.wallId);
  return (
    <section role="region" aria-label="Edit filler">
      <h3 className={styles.sectionTitle}>Filler on {wall?.name ?? 'a wall'}</h3>
      <div className={styles.grid}>
        {len('Filler width', filler.width, (f, v) => void (f.width = v))}
        {len('Filler height', filler.height, (f, v) => void (f.height = v))}
        {len('Front from wall', filler.depth, (f, v) => void (f.depth = v))}
        {len('From wall start', filler.offset, (f, v) => void (f.offset = v), true)}
        {len('Off the floor', filler.elevation, (f, v) => void (f.elevation = v), true)}
      </div>
      <p className={styles.hint}>
        Cut from door material (frameless) or face-frame stock; scribe to fit.
      </p>
      <button
        type="button"
        className={`${styles.button} ${styles.danger}`}
        onClick={() => {
          remove(filler.id);
          select(null);
        }}
      >
        Delete filler
      </button>
    </section>
  );
}
