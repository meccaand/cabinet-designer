import { lazy, Suspense, useEffect, useRef } from 'react';
import styles from './App.module.css';
import { useProjectStore } from './store/projectStore';
import { useViewerStore } from './store/viewerStore';
import { AddCabinet } from './ui/AddCabinet';
import { CabinetEditor } from './ui/CabinetEditor';
import { CabinetList } from './ui/CabinetList';
import { Inspector } from './ui/Inspector';
import { UnitsSelect } from './ui/UnitsSelect';
import { useCabinetModel } from './useCabinetModel';

// three.js is most of the bundle; load it after the shell so the app appears immediately.
const Viewer = lazy(() => import('./viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Application shell: cabinet list, 3D view, cabinet editor / parts, and shop outputs. */
export function App() {
  const project = useProjectStore((s) => s.project);
  const activeId = useProjectStore((s) => s.activeCabinetId);
  const setActive = useProjectStore((s) => s.setActiveCabinet);
  const addCabinet = useProjectStore((s) => s.addCabinet);
  const setUnits = useProjectStore((s) => s.setUnits);
  const select = useViewerStore((s) => s.select);
  const selectOpening = useViewerStore((s) => s.selectOpening);
  const panel = useViewerStore((s) => s.panel);
  const setPanel = useViewerStore((s) => s.setPanel);
  const cabinet = project.cabinets.find((c) => c.id === activeId);
  const result = useCabinetModel(cabinet, project);
  const inspector = useRef<HTMLElement>(null);
  // A different cabinet starts at the top of its settings.
  useEffect(() => {
    inspector.current?.scrollTo(0, 0);
  }, [activeId]);

  const show = (id: string) => {
    setActive(id);
    select(null);
    selectOpening(null);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Cabinet Designer</span>
        <span className={styles.project}>{project.name}</span>
        <span className={styles.spacer} />
        <UnitsSelect units={project.units} onChange={setUnits} />
      </header>

      <aside className={styles.sidebar} aria-label="Cabinets">
        <h2 className={styles.heading}>Cabinets</h2>
        <CabinetList project={project} activeId={activeId} onSelect={show} />
        <AddCabinet onAdd={(type) => show(addCabinet(type))} />
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

      <aside ref={inspector} className={styles.inspector} aria-label="Properties">
        {cabinet && result ? (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Panel">
              {(
                [
                  ['edit', 'Cabinet'],
                  ['parts', 'Parts'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panel === id}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {panel === 'edit' ? (
              <CabinetEditor
                key={cabinet.id}
                project={project}
                cabinet={cabinet}
                model={result.ok ? result.model : null}
                errors={result.ok ? [] : result.errors}
              />
            ) : result.ok ? (
              <Inspector project={project} cabinet={cabinet} model={result.model} />
            ) : (
              <p className={styles.empty}>Fix the cabinet's settings to see its parts.</p>
            )}
          </>
        ) : (
          <p className={styles.empty}>Add a cabinet to edit it.</p>
        )}
      </aside>

      <section className={styles.outputs} aria-label="Shop outputs">
        <h2 className={styles.heading}>Cut list &amp; sheets</h2>
        <p className={styles.empty}>The cut list and sheet layouts will appear here.</p>
      </section>
    </div>
  );
}
