import { useEffect, useRef } from 'react';
import { SHORTCUT_GROUPS } from '../shortcuts';
import { useViewerStore } from '../store/viewerStore';
import form from './Form.module.css';
import dialogStyles from './ProjectsDialog.module.css';
import styles from './ShortcutsDialog.module.css';

/** Every keyboard shortcut, from the same table that handles the keys. */
export function ShortcutsDialog() {
  const open = useViewerStore((s) => s.help);
  const setHelp = useViewerStore((s) => s.setHelp);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={dialogStyles.dialog}
      aria-label="Keyboard shortcuts"
      onClose={() => setHelp(false)}
    >
      <div className={dialogStyles.head}>
        <h2>Keyboard shortcuts</h2>
        <button type="button" className={form.button} onClick={() => setHelp(false)}>
          Close
        </button>
      </div>
      <div className={styles.groups}>
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl className={styles.list}>
              {g.items.map((s) => (
                <div key={s.label} className={styles.row}>
                  <dt>
                    {s.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && ' '}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className={styles.note}>Shortcuts pause while you type in a field.</p>
    </dialog>
  );
}
