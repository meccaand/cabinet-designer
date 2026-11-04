import { useId, useState } from 'react';
import type { UnitSettings } from '../../core/model';
import { formatLength, parseLength, type Mm } from '../../core/units';
import styles from './Form.module.css';

interface LengthInputProps {
  label: string;
  value: Mm;
  units: UnitSettings;
  onCommit: (value: Mm) => void;
  /** Smallest allowed value; defaults to "greater than zero". */
  min?: Mm;
  allowZero?: boolean;
}

/**
 * A length field that speaks woodworker: type `23 1/4`, `23-1/4"`, `1' 11 1/4"`, `590mm`, or a
 * bare number in the project's unit. Commits on Enter or leaving the field; Escape reverts.
 * Leaving the field without typing never commits, so an off-grid value shown rounded (≈) is
 * not silently replaced by its rounding.
 */
export function LengthInput({
  label,
  value,
  units,
  onCommit,
  min,
  allowZero = false,
}: LengthInputProps) {
  const id = useId();
  const shown = formatLength(value, units);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (draft === null || draft === shown) {
      setDraft(null);
      setError(null);
      return;
    }
    const parsed = parseLength(draft, units.system === 'imperial' ? 'in' : 'mm');
    if (!parsed.ok) return setError(parsed.error);
    const v = parsed.value;
    if (v < 0 || (!allowZero && v === 0)) return setError('Must be more than zero.');
    if (min !== undefined && v < min) return setError(`At least ${formatLength(min, units)}.`);
    setDraft(null);
    setError(null);
    if (v !== value) onCommit(v);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={draft ?? shown}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
            e.currentTarget.blur();
          }
        }}
      />
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
