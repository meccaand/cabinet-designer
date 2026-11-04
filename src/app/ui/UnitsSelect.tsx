import type { UnitSettings } from '../../core/model';
import styles from './Form.module.css';

const CHOICES: [string, string, UnitSettings][] = [
  ['in16', 'Inches, 1/16"', { system: 'imperial', fractionDenom: 16, mmDecimals: 1 }],
  ['in32', 'Inches, 1/32"', { system: 'imperial', fractionDenom: 32, mmDecimals: 1 }],
  ['mm0', 'Millimetres', { system: 'metric', fractionDenom: 16, mmDecimals: 0 }],
  ['mm1', 'Millimetres, 0.1', { system: 'metric', fractionDenom: 16, mmDecimals: 1 }],
];

const keyOf = (u: UnitSettings) =>
  u.system === 'imperial' ? `in${u.fractionDenom}` : `mm${u.mmDecimals >= 1 ? 1 : 0}`;

/** Project units. Only display changes; everything is stored in mm. */
export function UnitsSelect({
  units,
  onChange,
}: {
  units: UnitSettings;
  onChange: (u: UnitSettings) => void;
}) {
  return (
    <select
      aria-label="Units"
      className={styles.select}
      style={{ width: 'auto' }}
      value={keyOf(units)}
      onChange={(e) => {
        const choice = CHOICES.find(([k]) => k === e.target.value);
        if (choice) onChange(choice[2]);
      }}
    >
      {CHOICES.map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}
