import { useState } from 'react';
import type { Project } from '../../core/model';
import { useProjectStore } from '../store/projectStore';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';

/**
 * The room as a chain of walls joined at 90°. Walking from one wall to the next, cabinets are on
 * the right, so a right turn is an inside corner (L and U kitchens).
 */
export function RoomPanel({ project }: { project: Project }) {
  const addWall = useProjectStore((s) => s.addWall);
  const updateWall = useProjectStore((s) => s.updateWall);
  const removeWall = useProjectStore((s) => s.removeWall);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section aria-label="Room" className={styles.section}>
      {project.room.walls.map((w, i) => (
        <fieldset key={w.id} className={styles.wall}>
          <legend>{w.name}</legend>
          <div className={styles.grid}>
            <LengthInput
              label={`${w.name} length`}
              value={w.length}
              units={project.units}
              onCommit={(v) => updateWall(w.id, (wall) => void (wall.length = v))}
            />
            {i > 0 && (
              <div className={styles.field}>
                <label htmlFor={`turn-${w.id}`}>Corner</label>
                <select
                  id={`turn-${w.id}`}
                  className={styles.select}
                  value={w.turn}
                  onChange={(e) =>
                    updateWall(
                      w.id,
                      (wall) => void (wall.turn = e.target.value as 'left' | 'right'),
                    )
                  }
                >
                  <option value="right">Inside (turn right)</option>
                  <option value="left">Outside (turn left)</option>
                </select>
              </div>
            )}
          </div>
          {project.room.walls.length > 1 && (
            <button
              type="button"
              className={`${styles.link} ${styles.danger}`}
              onClick={() =>
                setNotice(
                  removeWall(w.id)
                    ? null
                    : `Move or delete what's on ${w.name} before removing it.`,
                )
              }
            >
              Remove {w.name}
            </button>
          )}
        </fieldset>
      ))}
      {notice && (
        <p className={styles.error} role="alert">
          {notice}
        </p>
      )}
      <button type="button" className={styles.button} onClick={addWall}>
        Add wall
      </button>
    </section>
  );
}
