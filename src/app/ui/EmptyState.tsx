import type { ReactNode } from 'react';
import { CABINET_TYPE_NAMES } from '../../core/generate';
import type { CabinetType } from '../../core/model';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import styles from './EmptyState.module.css';

/** A friendly placeholder where content will appear, with a way to get started. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty} role="note">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

const STARTERS: CabinetType[] = ['base', 'wall', 'tall'];

/** Buttons that add a first cabinet of a common type and show it. */
export function StartButtons() {
  const add = (type: CabinetType) => {
    useProjectStore.getState().addCabinet(type);
    useViewerStore.getState().select(null);
    useViewerStore.getState().setMain('3d');
  };
  return (
    <div className={styles.actions}>
      {STARTERS.map((t) => (
        <button key={t} type="button" onClick={() => add(t)}>
          Add a {CABINET_TYPE_NAMES[t].toLowerCase()}
        </button>
      ))}
    </div>
  );
}
