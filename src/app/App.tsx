import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutItem } from '../core/layout';
import styles from './App.module.css';
import { ElevationView } from './layout/ElevationView';
import { PlanView } from './layout/PlanView';
import { projectLayout, projectModels } from './models';
import { useSaveStatus } from './persistence/session';
import { useProjectStore } from './store/projectStore';
import { useViewerStore, type MainView } from './store/viewerStore';
import { AddCabinet } from './ui/AddCabinet';
import { CabinetEditor } from './ui/CabinetEditor';
import { CabinetList } from './ui/CabinetList';
import { FillerEditor } from './ui/FillerEditor';
import { Inspector } from './ui/Inspector';
import { ProjectsDialog } from './ui/ProjectsDialog';
import { RoomPanel } from './ui/RoomPanel';
import { UnitsSelect } from './ui/UnitsSelect';
import { useCabinetModel } from './useCabinetModel';
import { CutListView } from './outputs/CutListView';
import { MaterialsView } from './outputs/MaterialsView';
import { SheetsView } from './outputs/SheetsView';
import { useOutputs } from './outputs';
import { useShortcuts } from './shortcuts';
import { EmptyState, StartButtons } from './ui/EmptyState';
import { ExportMenu } from './ui/ExportMenu';
import { ShortcutsDialog } from './ui/ShortcutsDialog';
import { formatMoney } from '../core/report';
import { formatLength } from '../core/units';

// three.js is most of the bundle; load it after the shell so the app appears immediately.
const Viewer = lazy(() => import('./viewer/Viewer').then((m) => ({ default: m.Viewer })));

const MAIN_VIEWS: [MainView, string][] = [
  ['3d', '3D'],
  ['plan', 'Plan'],
  ['elevation', 'Elevation'],
  ['cutlist', 'Cut list'],
  ['sheets', 'Sheets'],
  ['materials', 'Materials & cost'],
];

/** Application shell: cabinets and room, the main view, the editor / parts, shop outputs. */
export function App() {
  const project = useProjectStore((s) => s.project);
  const activeId = useProjectStore((s) => s.activeCabinetId);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const { setActiveCabinet, addCabinet, setUnits, moveItem, undo, redo } =
    useProjectStore.getState();
  const selection = useViewerStore((s) => s.selection);
  const panel = useViewerStore((s) => s.panel);
  const main = useViewerStore((s) => s.main);
  const elevationWall = useViewerStore((s) => s.elevationWall);
  const drawer = useViewerStore((s) => s.drawer);
  const { select, selectOpening, setPanel, setMain, setElevationWall, setDrawer, setHelp } =
    useViewerStore.getState();
  const save = useSaveStatus();
  const [projectsOpen, setProjectsOpen] = useState(false);

  const cabinet = project.cabinets.find((c) => c.id === activeId);
  const result = useCabinetModel(cabinet, project);
  const models = useMemo(() => projectModels(project), [project]);
  const items = useMemo(() => projectLayout(project), [project]);
  const outputs = useOutputs(project);
  const partCount = outputs.cutList.parts.length;
  const filler =
    selection?.kind === 'filler' ? project.fillers.find((f) => f.id === selection.id) : undefined;
  const wallId =
    project.room.walls.find((w) => w.id === elevationWall)?.id ??
    cabinet?.placement.wallId ??
    project.room.walls[0]?.id ??
    null;

  const inspector = useRef<HTMLElement>(null);
  // A different cabinet starts at the top of its settings.
  useEffect(() => {
    inspector.current?.scrollTo(0, 0);
  }, [activeId]);

  useShortcuts();

  // An opened side panel (narrow screens) takes the focus, so keyboard users land in it.
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (drawer) shell.current?.querySelector<HTMLElement>(`[data-close="${drawer}"]`)?.focus();
  }, [drawer]);

  const show = (id: string) => {
    setActiveCabinet(id);
    select(null);
    selectOpening(null);
    setDrawer(null);
  };
  const pickItem = (item: LayoutItem | null) => {
    if (!item) return select(null);
    if (item.kind === 'filler') return select({ kind: 'filler', id: item.id });
    if (item.id !== activeId) selectOpening(null);
    setActiveCabinet(item.id);
    select({ kind: 'cabinet', id: item.id });
  };

  return (
    <div ref={shell} className={styles.shell} data-drawer={drawer ?? undefined}>
      <header className={styles.header}>
        <button
          type="button"
          className={`${styles.toggle} ${styles.cabinetsToggle}`}
          aria-expanded={drawer === 'cabinets'}
          onClick={() => setDrawer(drawer === 'cabinets' ? null : 'cabinets')}
        >
          ☰ Cabinets
        </button>
        <span className={styles.brand}>Cabinet Designer</span>
        <button
          type="button"
          className={styles.projectButton}
          onClick={() => setProjectsOpen(true)}
        >
          {project.name} ▾
        </button>
        <span className={styles.status} role="status" title={save.message ?? undefined}>
          {save.status === 'saving'
            ? 'Saving…'
            : save.status === 'saved'
              ? 'Saved'
              : save.status === 'error'
                ? 'Not saved'
                : ''}
        </span>
        <span className={styles.spacer} />
        <div className={styles.history}>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (⌘Z / Ctrl+Z)"
          >
            ↶<span className={styles.label}> Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (⇧⌘Z / Ctrl+Y)"
          >
            ↷<span className={styles.label}> Redo</span>
          </button>
        </div>
        <ExportMenu project={project} outputs={outputs} />
        <UnitsSelect units={project.units} onChange={setUnits} />
        <button
          type="button"
          className={styles.toggle}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setHelp(true)}
        >
          ?
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${styles.propertiesToggle}`}
          aria-expanded={drawer === 'properties'}
          onClick={() => setDrawer(drawer === 'properties' ? null : 'properties')}
        >
          Properties
        </button>
      </header>
      {save.status === 'error' && save.message && (
        <p className={styles.banner} role="alert">
          {save.message}
        </p>
      )}

      {drawer && (
        <div className={styles.backdrop} aria-hidden="true" onClick={() => setDrawer(null)} />
      )}

      <aside className={styles.sidebar} aria-label="Cabinets">
        <div className={styles.drawerHead}>
          <h2 className={styles.heading}>Cabinets</h2>
          <button type="button" data-close="cabinets" onClick={() => setDrawer(null)}>
            Close
          </button>
        </div>
        <CabinetList project={project} activeId={activeId} onSelect={show} />
        <AddCabinet onAdd={(type) => show(addCabinet(type))} />
        {project.fillers.length > 0 && (
          <>
            <h2 className={styles.heading} style={{ marginTop: 16 }}>
              Fillers
            </h2>
            <ul className={styles.fillers}>
              {project.fillers.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-current={selection?.kind === 'filler' && selection.id === f.id}
                    onClick={() => {
                      select({ kind: 'filler', id: f.id });
                      setDrawer(null);
                    }}
                  >
                    Filler {formatLength(f.width, project.units)} ·{' '}
                    {project.room.walls.find((w) => w.id === f.wallId)?.name ?? '—'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <details className={styles.room}>
          <summary className={styles.heading}>Room &amp; walls</summary>
          <RoomPanel project={project} />
        </details>
      </aside>

      <main className={styles.viewport} aria-label="Main view">
        <div className={styles.mainTabs} role="tablist" aria-label="View">
          {MAIN_VIEWS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={main === id}
              onClick={() => setMain(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {project.cabinets.length === 0 &&
        (main === '3d' || main === 'cutlist' || main === 'sheets') ? (
          <EmptyState title="No cabinets yet">
            <p>
              Add a cabinet to start. Each new cabinet goes on the wall after the last one; set up
              your walls under Room &amp; walls.
            </p>
            <p>The cut list, sheet layouts and shop packet build themselves as you go.</p>
            <StartButtons />
          </EmptyState>
        ) : main === 'cutlist' ? (
          <CutListView project={project} cutList={outputs.cutList} />
        ) : main === 'sheets' ? (
          <SheetsView project={project} cutList={outputs.cutList} nests={outputs.nests} />
        ) : main === 'materials' ? (
          <MaterialsView project={project} estimate={outputs.estimate} />
        ) : main === 'plan' ? (
          <PlanView
            project={project}
            items={items}
            selectedId={selection?.kind === 'filler' ? selection.id : activeId}
            onSelect={pickItem}
            onMove={(id, offset) => moveItem(id, { offset })}
          />
        ) : main === 'elevation' && wallId ? (
          <ElevationView
            project={project}
            models={models}
            items={items}
            wallId={wallId}
            onWall={setElevationWall}
            selectedId={selection?.kind === 'filler' ? selection.id : activeId}
            onSelect={pickItem}
            onMove={(id, offset) => moveItem(id, { offset })}
          />
        ) : !cabinet || !result ? (
          <EmptyState title="No cabinet selected">
            <p>Pick a cabinet from the list to see it here in 3D.</p>
          </EmptyState>
        ) : result.ok ? (
          <Suspense fallback={<p className={styles.empty}>Loading 3D view…</p>}>
            <Viewer
              project={project}
              models={models}
              activeId={activeId}
              onActivate={setActiveCabinet}
            />
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
        <div className={styles.drawerHead}>
          <h2 className={styles.heading}>Properties</h2>
          <button type="button" data-close="properties" onClick={() => setDrawer(null)}>
            Close
          </button>
        </div>
        {filler ? (
          <FillerEditor project={project} filler={filler} />
        ) : cabinet && result ? (
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
          <p className={styles.empty}>
            {project.cabinets.length
              ? 'Pick a cabinet to edit its size, construction and fronts.'
              : 'Once you add a cabinet, its size, construction and fronts are edited here.'}
          </p>
        )}
      </aside>

      <section className={styles.outputs} aria-label="Shop outputs">
        <span>
          <strong>{partCount}</strong> parts
        </span>
        {outputs.estimate.sheets.map((sh) => (
          <span key={sh.materialId}>
            {sh.name}: <strong>{sh.count}</strong> sheet{sh.count === 1 ? '' : 's'}
          </span>
        ))}
        <span>
          Estimate{' '}
          <strong data-testid="summary-total">{formatMoney(outputs.estimate.total)}</strong>
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.linkButton} onClick={() => setMain('cutlist')}>
          Cut list
        </button>
        <button type="button" className={styles.linkButton} onClick={() => setMain('sheets')}>
          Sheets
        </button>
        <button type="button" className={styles.linkButton} onClick={() => setMain('materials')}>
          Materials &amp; cost
        </button>
      </section>

      <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <ShortcutsDialog />
    </div>
  );
}
