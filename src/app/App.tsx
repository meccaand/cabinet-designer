import styles from './App.module.css';

/**
 * Application shell: the four work areas a woodworker moves between. Each region shows an
 * empty state until its milestone fills it in (see docs/PLAN.md).
 */
export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Cabinet Designer</span>
        <span className={styles.project}>Untitled project</span>
      </header>

      <aside className={styles.sidebar} aria-label="Cabinets">
        <h2 className={styles.heading}>Cabinets</h2>
        <p className={styles.empty}>No cabinets yet.</p>
      </aside>

      <main className={styles.viewport} aria-label="3D view">
        <p className={styles.empty}>Your cabinets will appear here in 3D.</p>
      </main>

      <aside className={styles.inspector} aria-label="Properties">
        <h2 className={styles.heading}>Properties</h2>
        <p className={styles.empty}>Select a cabinet to edit its size and construction.</p>
      </aside>

      <section className={styles.outputs} aria-label="Shop outputs">
        <h2 className={styles.heading}>Cut list &amp; sheets</h2>
        <p className={styles.empty}>Add a cabinet to generate a cut list.</p>
      </section>
    </div>
  );
}
