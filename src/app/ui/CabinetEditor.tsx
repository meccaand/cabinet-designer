import { useState } from 'react';
import { CABINET_TYPE_NAMES, TYPE_TRAITS } from '../../core/generate';
import {
  resolveConstruction,
  type Cabinet,
  type ConstructionDefaults,
  type ConstructionOverrides,
  type MaterialRole,
  type Project,
} from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import type { Mm } from '../../core/units';
import { useProjectStore } from '../store/projectStore';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';
import { OpeningEditor } from './OpeningEditor';
import { PositionSection } from './PositionSection';

type Group = Exclude<keyof ConstructionDefaults, 'materials'>;

/**
 * Everything about one cabinet: name, size, construction, toe kick, gaps, blind corner,
 * materials and openings. Changes apply immediately; the 3D view and parts follow.
 */
export function CabinetEditor({
  project,
  cabinet,
  model,
  errors,
}: {
  project: Project;
  cabinet: Cabinet;
  model: CabinetModel | null;
  errors: string[];
}) {
  const update = useProjectStore((s) => s.updateCabinet);
  const remove = useProjectStore((s) => s.deleteCabinet);
  const c = resolveConstruction(project.construction, cabinet.construction);
  const traits = TYPE_TRAITS[cabinet.type];
  const frameless = c.carcass.style === 'frameless';
  const inset = c.fronts.mount === 'inset';
  const units = project.units;

  /** Override some fields of one convention group for this cabinet. */
  function set<G extends Group>(group: G, values: Partial<ConstructionDefaults[G]>) {
    update(cabinet.id, (cab) => {
      const overrides = cab.construction as ConstructionOverrides;
      (overrides as Record<string, unknown>)[group] = { ...overrides[group], ...values };
    });
  }
  const setMaterial = (role: MaterialRole, id: string) =>
    update(cabinet.id, (cab) => {
      cab.construction.materials = { ...cab.construction.materials, [role]: id };
    });
  const length = (label: string, value: Mm, onCommit: (v: Mm) => void, allowZero = false) => (
    <LengthInput
      label={label}
      value={value}
      units={units}
      onCommit={onCommit}
      allowZero={allowZero}
    />
  );

  return (
    <div aria-label="Edit cabinet" role="region">
      <section className={styles.section}>
        <NameField
          key={cabinet.id}
          name={cabinet.name}
          onCommit={(name) => update(cabinet.id, (cab) => void (cab.name = name))}
        />
        <p className={styles.hint}>{CABINET_TYPE_NAMES[cabinet.type]}</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.grid}>
          {length('Width', cabinet.width, (v) => update(cabinet.id, (cab) => void (cab.width = v)))}
          {length('Height', cabinet.height, (v) =>
            update(cabinet.id, (cab) => void (cab.height = v)),
          )}
          {length('Depth', cabinet.depth, (v) => update(cabinet.id, (cab) => void (cab.depth = v)))}
        </div>
        <p className={styles.hint}>
          Depth includes the back{frameless ? '' : ' and face frame'} but not the doors.
          {traits.platform &&
            (c.platform.enabled ? ' Height includes the toe kick.' : ' There is no toe kick.')}
        </p>
      </section>

      <PositionSection project={project} cabinet={cabinet} />

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Construction</h3>
        <div className={styles.grid}>
          <Select
            label="Style"
            value={c.carcass.style}
            options={[
              ['frameless', 'Frameless'],
              ['faceFrame', 'Face frame'],
            ]}
            onChange={(style) => set('carcass', { style })}
          />
          <Select
            label="Joinery"
            value={c.carcass.joinery}
            options={[
              ['dado', 'Dado & rabbet'],
              ['rabbet', 'Rabbet'],
              ['butt', 'Butt'],
              ['pocket', 'Pocket screw'],
            ]}
            onChange={(joinery) => set('carcass', { joinery })}
          />
          <Select
            label="Back"
            value={c.carcass.back}
            options={[
              ['inset', 'Inset (rabbeted)'],
              ['applied', 'Applied'],
              ['dado', 'In grooves'],
            ]}
            onChange={(back) => set('carcass', { back })}
          />
          {traits.counter && (
            <Select
              label="Top"
              value={c.carcass.baseTop}
              options={[
                ['stretchers', 'Stretchers'],
                ['full', 'Full top'],
              ]}
              onChange={(baseTop) => set('carcass', { baseTop })}
            />
          )}
          <Select
            label="Doors & fronts"
            value={c.fronts.style}
            options={[
              ['slab', 'Slab'],
              ['shaker', 'Shaker'],
            ]}
            onChange={(style) => set('fronts', { style })}
          />
          <Select
            label="Mounting"
            value={c.fronts.mount}
            options={[
              ['overlay', 'Overlay'],
              ['inset', 'Inset'],
            ]}
            onChange={(mount) => set('fronts', { mount })}
          />
        </div>
      </section>

      {traits.platform && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Toe kick</h3>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={c.platform.enabled}
              onChange={(e) => set('platform', { enabled: e.target.checked })}
            />
            Stands on a toe kick
          </label>
          {c.platform.enabled ? (
            <div className={styles.grid} style={{ marginTop: 8 }}>
              {length('Toe kick height', c.platform.height, (height) =>
                set('platform', { height }),
              )}
              {length(
                'Toe kick depth',
                c.platform.setback,
                (setback) => set('platform', { setback }),
                true,
              )}
            </div>
          ) : (
            <p className={styles.hint}>The box runs to the floor and fills the cabinet's height.</p>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Gaps &amp; reveals</h3>
        <div className={styles.grid}>
          {inset ? (
            length(
              'Gap around fronts',
              c.fronts.insetGap,
              (insetGap) => set('fronts', { insetGap }),
              true,
            )
          ) : frameless ? (
            <>
              {length(
                'Edge reveal',
                c.fronts.revealEdge,
                (revealEdge) => set('fronts', { revealEdge }),
                true,
              )}
              {length(
                'Gap between',
                c.fronts.revealBetween,
                (revealBetween) => set('fronts', { revealBetween }),
                true,
              )}
              {traits.counter &&
                length(
                  'Below the top',
                  c.fronts.revealTopBase,
                  (revealTopBase) => set('fronts', { revealTopBase }),
                  true,
                )}
            </>
          ) : (
            <>
              {length(
                'Overlay',
                c.fronts.faceFrameOverlay,
                (faceFrameOverlay) => set('fronts', { faceFrameOverlay }),
                true,
              )}
              {length(
                'Gap between doors',
                c.fronts.revealBetween,
                (revealBetween) => set('fronts', { revealBetween }),
                true,
              )}
            </>
          )}
          {!frameless && (
            <>
              {length('Stile width', c.faceFrame.stileWidth, (stileWidth) =>
                set('faceFrame', { stileWidth }),
              )}
              {length('Rail width', c.faceFrame.railWidth, (railWidth) =>
                set('faceFrame', { railWidth }),
              )}
              {length('Mullion width', c.faceFrame.mullionWidth, (mullionWidth) =>
                set('faceFrame', { mullionWidth }),
              )}
            </>
          )}
        </div>
      </section>

      {traits.blind && cabinet.blind && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Blind corner</h3>
          <div className={styles.grid}>
            <Select
              label="Blind end"
              value={cabinet.blind.side}
              options={[
                ['left', 'Left'],
                ['right', 'Right'],
              ]}
              onChange={(side) =>
                update(cabinet.id, (cab) => void (cab.blind && (cab.blind.side = side)))
              }
            />
            {length('Blind width', cabinet.blind.blindWidth, (v) =>
              update(cabinet.id, (cab) => void (cab.blind && (cab.blind.blindWidth = v))),
            )}
            {length(
              'Pull filler',
              cabinet.blind.pullFillerWidth,
              (v) =>
                update(cabinet.id, (cab) => void (cab.blind && (cab.blind.pullFillerWidth = v))),
              true,
            )}
          </div>
          <p className={styles.hint}>
            Blind width is the part of the face hidden by the run that meets this cabinet.
          </p>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Materials</h3>
        <div className={styles.grid}>
          <MaterialSelect label="Carcass" role="carcass" {...{ project, c, setMaterial }} />
          <MaterialSelect label="Back" role="back" {...{ project, c, setMaterial }} />
          <MaterialSelect label="Shelves" role="shelf" {...{ project, c, setMaterial }} />
          <MaterialSelect
            label={c.fronts.style === 'shaker' ? 'Slab fronts' : 'Doors & fronts'}
            role="door"
            {...{ project, c, setMaterial }}
          />
          {c.fronts.style === 'shaker' && (
            <>
              <MaterialSelect
                label="Door frames"
                role="frontFrame"
                {...{ project, c, setMaterial }}
              />
              <MaterialSelect
                label="Door panels"
                role="frontPanel"
                {...{ project, c, setMaterial }}
              />
            </>
          )}
          {!frameless && (
            <MaterialSelect label="Face frame" role="faceFrame" {...{ project, c, setMaterial }} />
          )}
          <MaterialSelect label="Drawer boxes" role="drawerBox" {...{ project, c, setMaterial }} />
          <MaterialSelect
            label="Drawer bottoms"
            role="drawerBottom"
            {...{ project, c, setMaterial }}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Doors, drawers &amp; openings</h3>
        {model ? (
          <OpeningEditor project={project} cabinet={cabinet} model={model} />
        ) : (
          <div role="alert" className={styles.error}>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        className={`${styles.button} ${styles.danger}`}
        onClick={() => remove(cabinet.id)}
      >
        Delete cabinet
      </button>
    </div>
  );
}

function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onCommit(trimmed);
    else setDraft(name);
  };
  return (
    <div className={styles.field}>
      <label htmlFor="cabinet-name">Name</label>
      <input
        id="cabinet-name"
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  const id = `select-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function MaterialSelect({
  label,
  role,
  project,
  c,
  setMaterial,
}: {
  label: string;
  role: MaterialRole;
  project: Project;
  c: ConstructionDefaults;
  setMaterial: (role: MaterialRole, id: string) => void;
}) {
  const stock = [...project.materials.sheets, ...project.materials.solids];
  return (
    <Select
      label={label}
      value={c.materials[role]}
      options={stock.map((m) => [m.id, m.name])}
      onChange={(id) => setMaterial(role, id)}
    />
  );
}
