import type { CutList } from '../../core/cutlist';
import { sheetDrawing } from '../../core/drawing';
import type { Project } from '../../core/model';
import type { MaterialNest } from '../../core/nesting';
import { cutStep } from '../../core/report';
import { formatLength } from '../../core/units';
import { useProjectStore } from '../store/projectStore';
import { DrawingSvg } from '../ui/DrawingSvg';
import { LengthInput } from '../ui/LengthInput';
import styles from './Outputs.module.css';

/** Every sheet of every sheet material, with its parts, numbered cuts and cutting steps. */
export function SheetsView({
  project,
  cutList,
  nests,
}: {
  project: Project;
  cutList: CutList;
  nests: MaterialNest[];
}) {
  const updateShop = useProjectStore((s) => s.updateShop);
  const f = (v: number) => formatLength(v, project.units);
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Sheet layouts">
      <div className={styles.settings}>
        <LengthInput
          label="Saw kerf"
          value={project.shop.kerf}
          units={project.units}
          allowZero
          onCommit={(v) => updateShop((s) => void (s.kerf = v))}
        />
        <LengthInput
          label="Trim factory edges"
          value={project.shop.sheetEdgeTrim}
          units={project.units}
          allowZero
          onCommit={(v) => updateShop((s) => void (s.sheetEdgeTrim = v))}
        />
      </div>
      {nests.length === 0 && <p className={styles.empty}>No sheet goods in this project yet.</p>}
      {nests.map((n) => {
        const { sheets, unplaced, sheet } = n.result;
        const avg = sheets.length ? sheets.reduce((s, x) => s + x.yield, 0) / sheets.length : 0;
        return (
          <section
            key={n.materialId}
            className={styles.group}
            aria-label={`${n.materialName} sheets`}
          >
            <h3>
              {n.materialName}{' '}
              <small>
                {sheets.length} sheet{sheets.length === 1 ? '' : 's'} of {f(sheet.width)} ×{' '}
                {f(sheet.length)} · {Math.round(avg * 100)}% used
              </small>
            </h3>
            {unplaced.length > 0 && (
              <p className={styles.warn} role="alert">
                Too big for a {f(sheet.width)} × {f(sheet.length)} sheet:{' '}
                {unplaced.map((u) => `#${u.label} (${f(u.length)} × ${f(u.width)})`).join(', ')}.
                Choose a larger sheet size for this material or split the part.
              </p>
            )}
            {sheets.map((s, i) => (
              <div key={i} className={styles.sheetRow}>
                <DrawingSvg
                  drawing={sheetDrawing(s, sheet, project.shop.sheetEdgeTrim)}
                  label={`${n.materialName}, sheet ${i + 1} of ${sheets.length}`}
                  className={styles.sheetSvg}
                />
                <div>
                  <strong>
                    Sheet {i + 1} · {Math.round(s.yield * 100)}% used
                  </strong>
                  <ol className={styles.steps} aria-label={`Cuts for sheet ${i + 1}`}>
                    {s.cuts.map((c) => (
                      <li key={c.n}>{cutStep(c, s, project.units)}</li>
                    ))}
                    {s.cuts.length === 0 && <li>No cuts: the part is the whole sheet.</li>}
                  </ol>
                  {s.offcut && (
                    <p className={styles.note}>
                      Offcut: {f(Math.min(s.offcut.w, s.offcut.h))} ×{' '}
                      {f(Math.max(s.offcut.w, s.offcut.h))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <p className={styles.note}>
        Numbers on parts are cut list rows ({cutList.groups.reduce((n, g) => n + g.rows.length, 0)}{' '}
        rows). Red numbers are the cut order.
      </p>
    </div>
  );
}
