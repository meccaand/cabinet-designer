import type { CutList } from '../../core/cutlist';
import type { Project } from '../../core/model';
import { bandingText, formatThickness, grainText, rowNotes } from '../../core/report';
import { formatLength } from '../../core/units';
import styles from './Outputs.module.css';

/** The cut list, by material: what to cut, how many, and where each goes. */
export function CutListView({ project, cutList }: { project: Project; cutList: CutList }) {
  const f = (v: number) => formatLength(v, project.units);
  if (cutList.groups.length === 0) {
    return <p className={styles.empty}>Add cabinets to build a cut list.</p>;
  }
  return (
    <div className={styles.scroll} tabIndex={0} aria-label="Cut list" role="region">
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
                    <td>{grainText(r)}</td>
                    <td>{bandingText(r, project.materials)}</td>
                    <td className={styles.notes}>{rowNotes(r, project.units)}</td>
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
