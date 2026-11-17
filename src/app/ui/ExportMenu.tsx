import { useId, useRef, useState } from 'react';
import { cutListCsv, shoppingListCsv } from '../../core/report';
import { csvBlob, download, downloadProjectJson, fileBase } from '../download';
import { projectModels } from '../models';
import type { Outputs } from '../outputs';
import styles from './ExportMenu.module.css';

/** Header menu: the shop packet PDF, the cut and shopping lists as CSV, the project as JSON. */
export function ExportMenu({ outputs }: { outputs: Outputs }) {
  // Export exactly what the outputs were derived from.
  const project = outputs.project;
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => void | Promise<void>) => {
    setError(null);
    try {
      await action();
      menu.current?.hidePopover();
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const packet = async () => {
    setBusy(true);
    try {
      // jsPDF is only needed here; load it on demand to keep it out of the main bundle.
      const { shopPacket, packetFileName } = await import('../pdf/shopPacket');
      // The packet shows the project as built: built-ins' boxes, countertops and obstructions.
      const built = outputs.built;
      const doc = shopPacket({
        ...outputs,
        project: built.project,
        models: projectModels(built.project),
        extras: built,
        date: new Date(),
      });
      download(packetFileName(project), doc.output('blob'));
    } finally {
      setBusy(false);
    }
  };

  const items: [string, string, () => void | Promise<void>][] = [
    ['Shop packet', 'PDF: cover, elevations, cut list, sheets, shopping list', packet],
    [
      'Cut list',
      'CSV for spreadsheets and cut optimizers',
      () =>
        download(
          `${fileBase(project)} cut list.csv`,
          csvBlob(cutListCsv(project, outputs.cutList)),
        ),
    ],
    [
      'Shopping list',
      'CSV: materials, hardware and costs',
      () =>
        download(
          `${fileBase(project)} shopping list.csv`,
          csvBlob(shoppingListCsv(project, outputs.estimate)),
        ),
    ],
    [
      'Project file',
      'JSON: open it again with Projects → Import',
      () => downloadProjectJson(project),
    ],
  ];

  return (
    <>
      <button type="button" className={styles.trigger} popoverTarget={id}>
        Export ▾
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className={styles.menu}
        role="group"
        aria-label="Export"
      >
        {items.map(([label, hint, action]) => (
          <button
            key={label}
            type="button"
            className={styles.item}
            disabled={busy}
            onClick={() => void run(action)}
          >
            <span className={styles.label}>{label}</span>
            <span className={styles.hint}>{hint}</span>
          </button>
        ))}
        {busy && (
          <p className={styles.status} role="status">
            Preparing the PDF…
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
