import { useShallow } from 'zustand/react/shallow';
import { useViewerStore } from '../store/viewerStore';
import type { View } from './scene';
import styles from './ViewToolbar.module.css';

const VIEWS: { id: View; label: string }[] = [
  { id: 'iso', label: 'Iso' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
];

const TOGGLES = [
  { id: 'exploded', label: 'Exploded' },
  { id: 'xray', label: 'X-ray' },
  { id: 'dimensions', label: 'Dimensions' },
] as const;

export function ViewToolbar() {
  const view = useViewerStore((s) => s.view);
  const setView = useViewerStore((s) => s.setView);
  const toggle = useViewerStore((s) => s.toggle);
  const flags = useViewerStore(
    useShallow((s) => ({ exploded: s.exploded, xray: s.xray, dimensions: s.dimensions })),
  );

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="View">
      <div className={styles.group} role="group" aria-label="Camera">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={styles.group} role="group" aria-label="Display">
        {TOGGLES.map((t) => (
          <button key={t.id} type="button" aria-pressed={flags[t.id]} onClick={() => toggle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
