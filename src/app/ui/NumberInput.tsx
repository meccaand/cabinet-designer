import { useId, useState } from 'react';
import styles from './Form.module.css';

/** A plain number field (prices, percentages) that commits on Enter or leaving the field. */
export function NumberInput({
  label,
  value,
  onCommit,
  min = 0,
  step = 0.01,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  step?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(v) && v >= min && v !== value) onCommit(v);
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        type="number"
        min={min}
        step={step}
        value={draft ?? String(Math.round(value * 100) / 100)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  );
}
