import { useId } from 'react';
import type { CutList } from '../../core/cutlist';
import type { Project } from '../../core/model';
import type { Cut, MaterialNest, SheetLayout } from '../../core/nesting';
import { formatLength } from '../../core/units';
import { useProjectStore } from '../store/projectStore';
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
    <div className={styles.scroll} role="region" aria-label="Sheet layouts">
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
                <SheetDiagram
                  layout={s}
                  length={sheet.length}
                  width={sheet.width}
                  trim={project.shop.sheetEdgeTrim}
                  label={`${n.materialName}, sheet ${i + 1} of ${sheets.length}`}
                />
                <div>
                  <strong>
                    Sheet {i + 1} · {Math.round(s.yield * 100)}% used
                  </strong>
                  <ol className={styles.steps} aria-label={`Cuts for sheet ${i + 1}`}>
                    {s.cuts.map((c) => (
                      <li key={c.n}>{step(c, s, f)}</li>
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

/** A cut in shop language. */
function step(c: Cut, s: SheetLayout, f: (v: number) => string): string {
  const verb = c.kind === 'rip' ? 'Rip' : 'Crosscut';
  const label = s.placements.find((p) => p.partId === c.partId)?.label;
  switch (c.stage) {
    case 0:
      return `Trim ${f(c.size)} off a factory edge (${c.kind}).`;
    case 1:
      return `${verb} a strip ${f(c.size)} wide off the sheet.`;
    case 2:
      return `${verb} a ${f(c.size)} section off the strip.`;
    case 3:
      return `${verb} part #${label} off the section at ${f(c.size)}.`;
    case 4:
      return `Trim part #${label} to ${f(c.size)} (${c.kind}).`;
  }
}

function SheetDiagram({
  layout,
  length,
  width,
  trim,
  label,
}: {
  layout: SheetLayout;
  length: number;
  width: number;
  trim: number;
  label: string;
}) {
  const text = width * 0.04;
  const badge = width * 0.022;
  const hatch = useId();
  return (
    <svg
      className={styles.sheetSvg}
      viewBox={`0 0 ${length} ${width}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern
          id={hatch}
          width={width * 0.03}
          height={width * 0.03}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={width * 0.03}
            stroke="#c9bda5"
            strokeWidth={width * 0.006}
          />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={length}
        height={width}
        className={trim > 0 ? styles.trim : styles.sheet}
        strokeWidth={width * 0.002}
      />
      {trim > 0 && (
        <rect
          x={trim}
          y={trim}
          width={length - 2 * trim}
          height={width - 2 * trim}
          className={styles.sheet}
          strokeWidth={width * 0.002}
        />
      )}
      {layout.offcut && (
        <rect
          x={layout.offcut.x}
          y={layout.offcut.y}
          width={layout.offcut.w}
          height={layout.offcut.h}
          className={styles.offcut}
          fill={`url(#${CSS.escape(hatch)})`}
        />
      )}
      {layout.placements.map((p) => (
        <g key={p.partId}>
          <rect
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            className={styles.part}
            strokeWidth={width * 0.003}
          />
          <text
            x={p.x + p.w / 2}
            y={p.y + p.h / 2}
            fontSize={Math.min(text, p.h * 0.6, p.w * 0.4)}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            #{p.label}
          </text>
        </g>
      ))}
      {layout.cuts.map((c) => (
        <g key={c.n}>
          <line
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            className={styles.cutLine}
            strokeWidth={width * 0.003}
          />
          <circle
            cx={(c.x1 + c.x2) / 2}
            cy={(c.y1 + c.y2) / 2}
            r={badge}
            className={styles.cutBadge}
          />
          <text
            x={(c.x1 + c.x2) / 2}
            y={(c.y1 + c.y2) / 2}
            fontSize={badge * 1.2}
            textAnchor="middle"
            dominantBaseline="central"
            className={styles.cutBadgeText}
          >
            {c.n}
          </text>
        </g>
      ))}
    </svg>
  );
}
