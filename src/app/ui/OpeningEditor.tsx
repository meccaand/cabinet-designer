import { useMemo } from 'react';
import { frontElevation } from '../../core/drawing';
import {
  getNode,
  removeOpening,
  cabinetConstruction,
  setDivider,
  setFill,
  setHinge,
  setShelves,
  setSize,
  sizeOf,
  splitOpening,
  type Cabinet,
  type OpeningFill,
  type OpeningNode,
  type Project,
} from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import { DrawingSvg, flipY } from './DrawingSvg';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';
import svg from './OpeningEditor.module.css';

const FILLS: { id: OpeningFill; label: string }[] = [
  { id: 'door', label: 'Door' },
  { id: 'doorPair', label: 'Pair' },
  { id: 'drawer', label: 'Drawer' },
  { id: 'falseFront', label: 'False front' },
  { id: 'open', label: 'Open' },
];
/** L-shaped cabinets: one face around the corner, with a bi-fold pair or open (ADR-037). */
const CORNER_FILLS: { id: OpeningFill; label: string }[] = [
  { id: 'door', label: 'Bi-fold doors' },
  { id: 'open', label: 'Open' },
];
const FILL_NAME: Record<OpeningFill, string> = {
  door: 'Door',
  doorPair: 'Pair of doors',
  drawer: 'Drawer',
  falseFront: 'False front',
  open: 'Open',
};

/**
 * The cabinet's front elevation, where each opening can be clicked and edited: what fills it,
 * shelves behind it, its size, and splitting it into rows or columns.
 */
export function OpeningEditor({
  project,
  cabinet,
  model,
}: {
  project: Project;
  cabinet: Cabinet;
  model: CabinetModel;
}) {
  const update = useProjectStore((s) => s.updateCabinet);
  const selected = useViewerStore((s) => s.opening);
  const selectOpening = useViewerStore((s) => s.selectOpening);
  const drawing = useMemo(
    () => frontElevation(cabinet, model, project.units),
    [cabinet, model, project.units],
  );
  const editFace = (fn: (face: OpeningNode) => OpeningNode) =>
    update(cabinet.id, (c) => {
      c.face = fn(c.face as OpeningNode);
    });

  const cell = model.openings.find((o) => o.path === selected) ?? null;
  const index = cell ? model.openings.indexOf(cell) + 1 : 0;
  const root = cabinet.face;

  return (
    <div>
      <DrawingSvg drawing={drawing} label={`Front elevation of ${cabinet.name}`}>
        {model.openings.map((o, i) => (
          <rect
            key={o.path}
            x={o.rect.x0}
            y={flipY(o.rect.y1)}
            width={o.rect.x1 - o.rect.x0}
            height={o.rect.y1 - o.rect.y0}
            className={o.path === selected ? svg.selected : svg.opening}
            role="button"
            tabIndex={0}
            aria-pressed={o.path === selected}
            aria-label={`Opening ${i + 1}: ${FILL_NAME[o.fill]}`}
            onClick={() => selectOpening(o.path === selected ? null : o.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectOpening(o.path === selected ? null : o.path);
              }
            }}
          />
        ))}
      </DrawingSvg>

      {root.kind === 'split' && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={root.divider === true}
            onChange={(e) => editFace((f) => setDivider(f, e.target.checked))}
          />
          {root.dir === 'rows'
            ? 'Fixed shelf between the top-level rows'
            : 'Divider panel between the top-level columns'}
        </label>
      )}

      {cell ? (
        <OpeningControls
          key={cell.path}
          project={project}
          cabinet={cabinet}
          path={cell.path}
          title={`Opening ${index} of ${model.openings.length}`}
          measured={cell.rect}
          editFace={editFace}
          onRemoved={() => selectOpening(null)}
        />
      ) : (
        <p className={styles.hint}>Click an opening in the drawing to change it.</p>
      )}
    </div>
  );
}

function OpeningControls({
  project,
  cabinet,
  path,
  title,
  measured,
  editFace,
  onRemoved,
}: {
  project: Project;
  cabinet: Cabinet;
  path: string;
  title: string;
  measured: { x0: number; x1: number; y0: number; y1: number };
  editFace: (fn: (face: OpeningNode) => OpeningNode) => void;
  onRemoved: () => void;
}) {
  const node = getNode(cabinet.face, path);
  if (!node || node.kind !== 'leaf') return null;
  const c = cabinetConstruction(project, cabinet);
  const frameless = c.carcass.style === 'frameless';
  const parentPath = path.includes('.')
    ? path.slice(0, path.lastIndexOf('.'))
    : path === ''
      ? null
      : '';
  const parent = parentPath === null ? null : getNode(cabinet.face, parentPath);
  const size = sizeOf(cabinet.face, path);
  const along = parent?.kind === 'split' && parent.dir === 'columns' ? 'width' : 'height';
  // The size the tree stores: frameless inset cells include the gap around the front.
  const pad = frameless && c.fronts.mount === 'inset' ? 2 * c.fronts.insetGap : 0;
  const current = (along === 'width' ? measured.x1 - measured.x0 : measured.y1 - measured.y0) - pad;
  const sizeLabel = `${frameless ? 'Front' : 'Opening'} ${along}`;
  const shelvable = node.fill === 'door' || node.fill === 'doorPair' || node.fill === 'open';
  // L-shaped cabinets' shelves are fixed: two pieces joined at the corner.
  const corner = cabinet.corner !== undefined;
  const shelves = node.shelves ?? { count: 0, adjustable: !corner };

  return (
    <section className={styles.section} aria-label="Selected opening">
      <h4 className={styles.sectionTitle}>{title}</h4>
      <div className={styles.segmented} role="group" aria-label="Fill">
        {(corner ? CORNER_FILLS : FILLS).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={node.fill === f.id}
            onClick={() => editFace((face) => setFill(face, path, f.id))}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.grid} style={{ marginTop: 10 }}>
        {node.fill === 'door' && !corner && (
          <div className={styles.field}>
            <span className={styles.label}>Hinged on</span>
            <div className={styles.segmented} role="group" aria-label="Hinge side">
              {(['left', 'right'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={(node.hinge ?? 'left') === h}
                  onClick={() => editFace((face) => setHinge(face, path, h))}
                >
                  {h === 'left' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
          </div>
        )}
        {shelvable && (
          <>
            <div className={styles.field}>
              <label htmlFor={`shelves-${path}`}>Shelves</label>
              <input
                id={`shelves-${path}`}
                className={styles.input}
                type="number"
                min={0}
                max={20}
                value={shelves.count}
                onChange={(e) => {
                  const count = Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0)));
                  editFace((face) => setShelves(face, path, { ...shelves, count }));
                }}
              />
            </div>
            {!corner && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={shelves.adjustable}
                  disabled={shelves.count === 0}
                  onChange={(e) =>
                    editFace((face) =>
                      setShelves(face, path, { ...shelves, adjustable: e.target.checked }),
                    )
                  }
                />
                Adjustable
              </label>
            )}
          </>
        )}
      </div>

      {corner && <p className={styles.hint}>Fixed shelves, each in two pieces.</p>}

      {size !== null && (
        <div className={styles.grid} style={{ marginTop: 8 }}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={size === 'auto'}
              onChange={(e) =>
                editFace((face) =>
                  setSize(face, path, e.target.checked ? 'auto' : Math.max(1, current)),
                )
              }
            />
            Auto {along}
          </label>
          {size !== 'auto' && (
            <LengthInput
              label={sizeLabel}
              value={size}
              units={project.units}
              onCommit={(v) => editFace((face) => setSize(face, path, v))}
            />
          )}
        </div>
      )}

      {!corner && (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            onClick={() => editFace((f) => splitOpening(f, path, 'rows'))}
          >
            Split into rows
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => editFace((f) => splitOpening(f, path, 'columns'))}
          >
            Split into columns
          </button>
          {path !== '' && (
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={() => {
                editFace((f) => removeOpening(f, path));
                onRemoved();
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </section>
  );
}
