import type { Project } from '../../core/model';
import { formatLength } from '../../core/units';
import styles from './Panels.module.css';

export function CabinetList({
  project,
  activeId,
  onSelect,
}: {
  project: Project;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (project.cabinets.length === 0) {
    return <p className={styles.empty}>No cabinets yet. Add one below.</p>;
  }
  const f = (v: number) => formatLength(v, project.units);
  return (
    <ul className={styles.list} style={{ marginBottom: 12 }}>
      {project.cabinets.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={styles.item}
            aria-current={c.id === activeId}
            onClick={() => onSelect(c.id)}
          >
            <span className={styles.itemName}>{c.name}</span>
            <span className={styles.itemMeta}>
              {f(c.width)} × {f(c.height)} × {f(c.depth)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
