import { CABINET_TYPE_NAMES } from '../../core/generate';
import type { CabinetType } from '../../core/model';
import styles from './Form.module.css';

const ORDER: CabinetType[] = [
  'base',
  'drawerBank',
  'blindBase',
  'wall',
  'blindWall',
  'tall',
  'openShelf',
];

/**
 * "Add cabinet" picker: choosing a type adds a standard-size cabinet of that type. Disabled
 * until the project has a wall to put it on.
 */
export function AddCabinet({
  onAdd,
  disabled = false,
}: {
  onAdd: (type: CabinetType) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor="add-cabinet" className={styles.label}>
        Add a cabinet
      </label>
      <select
        id="add-cabinet"
        className={styles.select}
        value=""
        disabled={disabled}
        aria-describedby={disabled ? 'add-cabinet-hint' : undefined}
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value as CabinetType);
        }}
      >
        <option value="">Choose a type…</option>
        {ORDER.map((t) => (
          <option key={t} value={t}>
            {CABINET_TYPE_NAMES[t]}
          </option>
        ))}
      </select>
      {disabled && (
        <p id="add-cabinet-hint" className={styles.hint}>
          Set up the room first.
        </p>
      )}
    </div>
  );
}
