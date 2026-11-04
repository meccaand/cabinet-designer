import type { CutList, CutListRow } from '../../core/cutlist';
import type { Project } from '../../core/model';
import { formatLength } from '../../core/units';
import { formatThickness } from '../outputs';
import styles from './Outputs.module.css';

/** Banded edges in words: "2 long, 1 end, PVC 2 mm". */
function banding(row: CutListRow, project: Project): string {
  const e = row.edges;
  const long = [e.long1, e.long2].filter(Boolean).length;
  const ends = [e.end1, e.end2].filter(Boolean).length;
  if (long + ends === 0) return '—';
  const id = e.long1 ?? e.long2 ?? e.end1 ?? e.end2;
  const name = project.materials.banding.find((b) => b.id === id)?.name ?? '';
  const parts = [long && `${long} long`, ends && `${ends} end${ends > 1 ? 's' : ''}`].filter(
    Boolean,
  );
  return `${parts.join(', ')} · ${name}`;
}

/** The cut list, by material: what to cut, how many, and where each goes. */
export function CutListView({ project, cutList }: { project: Project; cutList: CutList }) {
  const f = (v: number) => formatLength(v, project.units);
  if (cutList.groups.length === 0) {
    return <p className={styles.empty}>Add cabinets to build a cut list.</p>;
  }
  return (
    <div className={styles.scroll} aria-label="Cut list" role="region">
      <p className={styles.note}>
        Sizes are cut sizes: banding marked "subtract" is already taken off. Length runs with the
        grain.
      </p>
      {cutList.groups.map((g) => {
        const count = g.rows.reduce((n, r) => n + r.qty, 0);
        return (
          <section key={g.materialId} className={styles.group}>
            <h3>
              {g.materialName} <small>{count} parts</small>
            </h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Part</th>
                  <th>Cabinet</th>
                  <th className={styles.num}>Qty</th>
                  <th className={styles.num}>Length</th>
                  <th className={styles.num}>Width</th>
                  <th className={styles.num}>Thick</th>
                  <th>Grain</th>
                  <th>Edge banding</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.number}>
                    <td>{r.number}</td>
                    <td>{r.name}</td>
                    <td>{r.cabinets.join(', ')}</td>
                    <td className={styles.num}>{r.qty}</td>
                    <td className={styles.num}>{f(r.length)}</td>
                    <td className={styles.num}>{f(r.width)}</td>
                    <td className={styles.num}>{formatThickness(r.thickness, project.units)}</td>
                    <td>{r.grain ? 'Along length' : 'Any'}</td>
                    <td>{banding(r, project)}</td>
                    <td className={styles.notes}>
                      {[
                        ...(r.notch
                          ? [
                              `Notch ${f(r.notch.height)} × ${f(r.notch.depth)} at the bottom front for the toe kick.`,
                            ]
                          : []),
                        ...r.notes,
                      ].join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
