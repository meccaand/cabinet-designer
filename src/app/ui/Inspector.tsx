import { resolveConstruction, type Cabinet, type Project } from '../../core/model';
import type { CabinetModel, Part } from '../../core/parts';
import { formatLength } from '../../core/units';
import { useViewerStore } from '../store/viewerStore';
import { PART_GROUPS, partGroup } from '../viewer/scene';
import styles from './Panels.module.css';

const LABELS = {
  style: { frameless: 'Frameless', faceFrame: 'Face frame' },
  joinery: { dado: 'Dado & rabbet', rabbet: 'Rabbet', butt: 'Butt', pocket: 'Pocket screw' },
  back: { inset: 'Inset (rabbeted)', applied: 'Applied', dado: 'In grooves' },
  baseTop: { stretchers: 'Stretchers', full: 'Full top' },
  frontStyle: { slab: 'Slab', shaker: 'Shaker' },
  mount: { overlay: 'overlay', inset: 'inset' },
} as const;

/** Right-hand panel: details of the selection, then every part with visibility toggles. */
export function Inspector({
  project,
  cabinet,
  model,
}: {
  project: Project;
  cabinet: Cabinet;
  model: CabinetModel;
}) {
  const selection = useViewerStore((s) => s.selection);
  const part =
    selection?.kind === 'part' ? model.parts.find((p) => p.id === selection.id) : undefined;
  const cabinetSelected = selection?.kind === 'cabinet' && selection.id === cabinet.id;

  return (
    <>
      {part ? (
        <PartDetails part={part} project={project} />
      ) : cabinetSelected ? (
        <CabinetDetails cabinet={cabinet} model={model} project={project} />
      ) : (
        <p className={styles.empty}>
          Click the cabinet to select it, then click again to pick a part.
        </p>
      )}
      <PartList project={project} model={model} />
    </>
  );
}

function CabinetDetails({
  cabinet,
  model,
  project,
}: {
  cabinet: Cabinet;
  model: CabinetModel;
  project: Project;
}) {
  const f = (v: number) => formatLength(v, project.units);
  const c = resolveConstruction(project.construction, cabinet.construction);
  return (
    <section aria-label="Selected cabinet" className={styles.details}>
      <h3 className={styles.title}>{cabinet.name}</h3>
      <dl className={styles.props}>
        <dt>Size</dt>
        <dd>
          {f(cabinet.width)} W × {f(cabinet.height)} H × {f(cabinet.depth)} D
        </dd>
        <dt>Construction</dt>
        <dd>
          {LABELS.style[c.carcass.style]}, {LABELS.joinery[c.carcass.joinery].toLowerCase()}
        </dd>
        <dt>Back</dt>
        <dd>{LABELS.back[c.carcass.back]}</dd>
        <dt>Top</dt>
        <dd>{LABELS.baseTop[c.carcass.baseTop]}</dd>
        <dt>Fronts</dt>
        <dd>
          {LABELS.frontStyle[c.fronts.style]}, {LABELS.mount[c.fronts.mount]}
        </dd>
        <dt>Parts</dt>
        <dd>{model.parts.length}</dd>
      </dl>
      {model.hardware.length > 0 && (
        <>
          <h4 className={styles.subhead}>Hardware</h4>
          <ul className={styles.plain}>
            {model.hardware.map((h) => (
              <li key={`${h.kind}-${h.length ?? ''}`}>
                {h.qty} × {h.name}
                {h.length !== undefined && `, ${f(h.length)}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {model.warnings.map((w) => (
        <p key={w} className={styles.warning}>
          {w}
        </p>
      ))}
    </section>
  );
}

function PartDetails({ part, project }: { part: Part; project: Project }) {
  const f = (v: number) => formatLength(v, project.units);
  const size = (s: Part['cut']) => `${f(s.length)} × ${f(s.width)} × ${f(s.thickness)}`;
  const m = project.materials;
  const material = [...m.sheets, ...m.solids].find((x) => x.id === part.materialId);
  const bandIds = Object.values(part.edges).filter((e): e is string => e !== null);
  const banding = m.banding.find((b) => b.id === bandIds[0]);
  const differs = size(part.cut) !== size(part.finished);
  return (
    <section aria-label="Selected part" className={styles.details}>
      <h3 className={styles.title}>{part.name}</h3>
      <dl className={styles.props}>
        <dt>Cut size</dt>
        <dd data-testid="cut-size">{size(part.cut)}</dd>
        {differs && (
          <>
            <dt>Finished</dt>
            <dd>{size(part.finished)}</dd>
          </>
        )}
        <dt>Material</dt>
        <dd>{material?.name ?? part.materialId}</dd>
        <dt>Grain</dt>
        <dd>{part.grain ? 'Along the length' : 'None'}</dd>
        {part.notch && (
          <>
            <dt>Notch</dt>
            <dd>
              {f(part.notch.height)} × {f(part.notch.depth)} at the bottom front (toe kick)
            </dd>
          </>
        )}
        <dt>Edge banding</dt>
        <dd>
          {bandIds.length === 0
            ? 'None'
            : `${bandIds.length} edge${bandIds.length > 1 ? 's' : ''}, ${banding?.name ?? ''}`}
        </dd>
      </dl>
      {part.notes.map((n) => (
        <p key={n} className={styles.note}>
          {n}
        </p>
      ))}
    </section>
  );
}

function PartList({ project, model }: { project: Project; model: CabinetModel }) {
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const hiddenParts = useViewerStore((s) => s.hiddenParts);
  const hiddenGroups = useViewerStore((s) => s.hiddenGroups);
  const togglePart = useViewerStore((s) => s.togglePart);
  const toggleGroup = useViewerStore((s) => s.toggleGroup);
  const showAll = useViewerStore((s) => s.showAll);
  const f = (v: number) => formatLength(v, project.units, { unit: false });
  const anyHidden = Object.keys(hiddenParts).length > 0 || Object.keys(hiddenGroups).length > 0;

  return (
    <section aria-label="Parts" className={styles.parts}>
      <div className={styles.partsHeader}>
        <h3 className={styles.heading}>Parts</h3>
        {anyHidden && (
          <button type="button" className={styles.link} onClick={showAll}>
            Show all
          </button>
        )}
      </div>
      {PART_GROUPS.map((g) => {
        const parts = model.parts.filter((p) => partGroup(p.role) === g.id);
        if (parts.length === 0) return null;
        const groupHidden = !!hiddenGroups[g.id];
        return (
          <div key={g.id} className={styles.group}>
            <label className={styles.groupRow}>
              <input type="checkbox" checked={!groupHidden} onChange={() => toggleGroup(g.id)} />
              <span>{g.label}</span>
              <span className={styles.count}>{parts.length}</span>
            </label>
            <ul className={styles.plain}>
              {parts.map((p) => (
                <li key={p.id} className={styles.partRow} aria-current={selection?.id === p.id}>
                  <input
                    type="checkbox"
                    aria-label={`Show ${p.name}`}
                    checked={!hiddenParts[p.id] && !groupHidden}
                    disabled={groupHidden}
                    onChange={() => togglePart(p.id)}
                  />
                  <button
                    type="button"
                    className={styles.partButton}
                    onClick={() => select({ kind: 'part', id: p.id })}
                  >
                    <span>{p.name}</span>
                    <span className={styles.itemMeta}>
                      {f(p.cut.length)} × {f(p.cut.width)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
