import { lazy, Suspense } from 'react';
import { useProjectStore } from './store/projectStore';
import { useViewerStore } from './store/viewerStore';
import styles from './App.module.css';
import { CabinetList } from './ui/CabinetList';
import { Inspector } from './ui/Inspector';
import { useCabinetModel } from './useCabinetModel';

// three.js is most of the bundle; load it after the shell so the app appears immediately.
const Viewer = lazy(() => import('./viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Application shell: cabinet list, 3D view, properties, and shop outputs. */
export function App() {
  const project = useProjectStore((s) => s.project);
  const activeId = useProjectStore((s) => s.activeCabinetId);
  const setActive = useProjectStore((s) => s.setActiveCabinet);
  const select = useViewerStore((s) => s.select);
  const cabinet = project.cabinets.find((c) => c.id === activeId);
  const result = useCabinetModel(cabinet, project);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Cabinet Designer</span>
        <span className={styles.project}>{project.name}</span>
      </header>

      <aside className={styles.sidebar} aria-label="Cabinets">
        <h2 className={styles.heading}>Cabinets</h2>
        <CabinetList
          project={project}
          activeId={activeId}
          onSelect={(id) => {
            setActive(id);
            select(null);
          }}
        />
      </aside>

      <main className={styles.viewport} aria-label="3D view">
        {!cabinet || !result ? (
          <p className={styles.empty}>Add a cabinet to see it here in 3D.</p>
        ) : result.ok ? (
          <Suspense fallback={<p className={styles.empty}>Loading 3D view…</p>}>
            <Viewer cabinet={cabinet} model={result.model} units={project.units} />
          </Suspense>
        ) : (
          <div className={styles.error} role="alert">
            <strong>This cabinet can't be built as specified.</strong>
            {result.errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
      </main>

      <aside className={styles.inspector} aria-label="Properties">
        <h2 className={styles.heading}>Properties</h2>
        {cabinet && result?.ok ? (
          <Inspector project={project} cabinet={cabinet} model={result.model} />
        ) : (
          <p className={styles.empty}>Select a cabinet to see its parts.</p>
        )}
      </aside>

      <section className={styles.outputs} aria-label="Shop outputs">
        <h2 className={styles.heading}>Cut list &amp; sheets</h2>
        <p className={styles.empty}>The cut list and sheet layouts will appear here.</p>
      </section>
    </div>
  );
}
