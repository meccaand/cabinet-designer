import {
  resolveConstruction,
  STYLE_TEMPLATES,
  type Cabinet,
  type ConstructionDefaults,
  type ConstructionOverrides,
  type Finish,
  type Project,
  type StylePreset,
  type StyleTemplateId,
} from '../../core/model';
import type { Mm } from '../../core/units';
import { useProjectStore } from '../store/projectStore';
import styles from './Form.module.css';
import { Choice, ColorField, TextField } from './Fields';
import { LengthInput } from './LengthInput';

type Group = Exclude<keyof ConstructionDefaults, 'materials'>;

const NEW_PREFIX = 'new:';

/**
 * The cabinet's style preset (ADR-039): pick one, start one from a template, and edit the
 * preset itself. Edits to a preset restyle every cabinet that follows it.
 */
export function StyleSection({ project, cabinet }: { project: Project; cabinet: Cabinet }) {
  const setCabinetStyle = useProjectStore((s) => s.setCabinetStyle);
  const addStyle = useProjectStore((s) => s.addStyle);
  const update = useProjectStore((s) => s.updateCabinet);
  const style = project.stylePresets.find((s) => s.id === cabinet.styleId);
  const sharedBy = style ? project.cabinets.filter((c) => c.styleId === style.id).length : 0;
  const ownOverrides = countOverrides(cabinet.construction);

  const onPick = (value: string) => {
    if (value.startsWith(NEW_PREFIX)) {
      const id = addStyle(value.slice(NEW_PREFIX.length) as StyleTemplateId);
      setCabinetStyle(cabinet.id, id);
    } else {
      setCabinetStyle(cabinet.id, value === '' ? null : value);
    }
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Style preset</h3>
      <Choice
        label="Follows"
        value={style?.id ?? ''}
        options={[
          ['', 'None (project defaults)'],
          ...project.stylePresets.map((s): [string, string] => [s.id, s.name]),
          ...STYLE_TEMPLATES.map((t): [string, string] => [
            `${NEW_PREFIX}${t.id}`,
            `New style: ${t.name}…`,
          ]),
        ]}
        onChange={onPick}
      />
      {style && ownOverrides > 0 && (
        <p className={styles.hint}>
          This cabinet overrides {ownOverrides} of its style's settings.{' '}
          <button
            type="button"
            className={styles.link}
            onClick={() => update(cabinet.id, (cab) => void (cab.construction = {}))}
          >
            Use the style's settings
          </button>
        </p>
      )}
      {style && (
        <details className={styles.styleDetails}>
          <summary>
            Edit “{style.name}”{sharedBy > 1 ? ` (shared by ${sharedBy} cabinets)` : ''}
          </summary>
          <StyleEditor project={project} style={style} />
        </details>
      )}
    </section>
  );
}

/** Number of individually overridden settings. */
function countOverrides(o: ConstructionOverrides): number {
  return Object.values(o).reduce(
    (n, group) => n + Object.values(group ?? {}).filter((v: unknown) => v !== undefined).length,
    0,
  );
}

export function StyleEditor({ project, style }: { project: Project; style: StylePreset }) {
  const updateStyle = useProjectStore((s) => s.updateStyle);
  const deleteStyle = useProjectStore((s) => s.deleteStyle);
  const c = resolveConstruction(project.construction, style.construction);
  const units = project.units;
  const faceFrame = c.carcass.style === 'faceFrame';
  const users =
    project.cabinets.filter((x) => x.styleId === style.id).length +
    project.builtIns.filter((b) => b.styleId === style.id).length;

  function set<G extends Group>(group: G, values: Partial<ConstructionDefaults[G]>) {
    updateStyle(style.id, (s) => {
      const o = s.construction as Record<string, unknown>;
      o[group] = { ...(o[group] as object | undefined), ...values };
    });
  }
  const setFinish = (values: Partial<Finish>, key?: string) =>
    updateStyle(style.id, (s) => void Object.assign(s.finish, values), key);
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
    <div className={styles.styleEditor} aria-label={`Style ${style.name}`} role="group">
      <TextField
        label="Style name"
        value={style.name}
        onCommit={(name) => updateStyle(style.id, (s) => void (s.name = name))}
      />

      <h4 className={styles.subTitle}>Finish</h4>
      <div className={styles.grid}>
        <Choice
          label="Type"
          value={style.finish.kind}
          options={[
            ['paint', 'Paint'],
            ['stain', 'Stain'],
            ['clear', 'Clear (natural wood)'],
          ]}
          onChange={(kind) => setFinish({ kind })}
        />
        <Choice
          label="Sheen"
          value={style.finish.sheen}
          options={[
            ['flat', 'Flat'],
            ['matte', 'Matte'],
            ['satin', 'Satin'],
            ['semiGloss', 'Semi-gloss'],
            ['gloss', 'Gloss'],
          ]}
          onChange={(sheen) => setFinish({ sheen })}
        />
        {style.finish.kind !== 'clear' && (
          <ColorField
            label="Colour"
            value={style.finish.color}
            onChange={(color) => setFinish({ color }, 'color')}
          />
        )}
        <ColorField
          label="Hardware colour"
          value={style.finish.hardwareColor}
          onChange={(hardwareColor) => setFinish({ hardwareColor }, 'hardwareColor')}
        />
      </div>

      <h4 className={styles.subTitle}>Construction</h4>
      <div className={styles.grid}>
        <Choice
          label="Box"
          value={c.carcass.style}
          options={[
            ['frameless', 'Frameless'],
            ['faceFrame', 'Face frame'],
          ]}
          onChange={(v) => set('carcass', { style: v })}
        />
        <Choice
          label="Doors & fronts"
          value={c.fronts.style}
          options={[
            ['slab', 'Slab'],
            ['shaker', 'Shaker'],
          ]}
          onChange={(v) => set('fronts', { style: v })}
        />
        <Choice
          label="Mounting"
          value={c.fronts.mount}
          options={[
            ['overlay', 'Overlay'],
            ['inset', 'Inset'],
          ]}
          onChange={(mount) => set('fronts', { mount })}
        />
        {c.fronts.mount === 'inset'
          ? length('Gap around fronts', c.fronts.insetGap, (insetGap) =>
              set('fronts', { insetGap }),
            )
          : faceFrame
            ? length('Overlay', c.fronts.faceFrameOverlay, (faceFrameOverlay) =>
                set('fronts', { faceFrameOverlay }),
              )
            : null}
        {faceFrame && (
          <>
            {length('Frame stiles', c.faceFrame.stileWidth, (stileWidth) =>
              set('faceFrame', { stileWidth }),
            )}
            {length('Frame rails', c.faceFrame.railWidth, (railWidth) =>
              set('faceFrame', { railWidth }),
            )}
            {length('Frame mullions', c.faceFrame.mullionWidth, (mullionWidth) =>
              set('faceFrame', { mullionWidth }),
            )}
          </>
        )}
        {c.fronts.style === 'shaker' && (
          <>
            {length('Door stiles', c.shaker.stileWidth, (stileWidth) =>
              set('shaker', { stileWidth }),
            )}
            {length('Door rails', c.shaker.railWidth, (railWidth) => set('shaker', { railWidth }))}
          </>
        )}
      </div>

      <h4 className={styles.subTitle}>Toe kick or plinth</h4>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={c.platform.enabled}
          onChange={(e) => set('platform', { enabled: e.target.checked })}
        />
        Floor cabinets stand on a base
      </label>
      {c.platform.enabled && (
        <div className={styles.grid} style={{ marginTop: 8 }}>
          {length('Base height', c.platform.height, (height) => set('platform', { height }))}
          {length('Recess', c.platform.setback, (setback) => set('platform', { setback }), true)}
        </div>
      )}
      <p className={styles.hint}>A recess of 0 makes a flush plinth instead of a toe kick.</p>

      <HandleFields c={c} units={units} set={set} />

      <div className={styles.grid}>
        {length(
          'Shelf nosing',
          c.shelves.nosingHeight,
          (nosingHeight) => set('shelves', { nosingHeight }),
          true,
        )}
      </div>
      <p className={styles.hint}>
        A solid strip this tall on the front of open shelves (0 for none).
      </p>

      <button
        type="button"
        className={`${styles.button} ${styles.danger}`}
        onClick={() => deleteStyle(style.id)}
      >
        Delete style
        {users > 0 ? ` (used by ${users}: they go back to the project defaults)` : ''}
      </button>
    </div>
  );
}

/** Knob or pull, its size and where it sits. Shared by the style and cabinet editors. */
export function HandleFields({
  c,
  units,
  set,
}: {
  c: ConstructionDefaults;
  units: Project['units'];
  set: (group: 'hardware', values: Partial<ConstructionDefaults['hardware']>) => void;
}) {
  const hw = c.hardware;
  const knob = hw.handle === 'knob';
  return (
    <>
      <h4 className={styles.subTitle}>Knobs &amp; pulls</h4>
      <div className={styles.grid}>
        <Choice
          label="Handle"
          value={hw.handle}
          options={[
            ['knob', 'Knob'],
            ['pull', 'Pull'],
          ]}
          onChange={(handle) => set('hardware', { handle })}
        />
        {knob ? (
          <LengthInput
            label="Knob diameter"
            value={hw.knobDiameter}
            units={units}
            onCommit={(knobDiameter) => set('hardware', { knobDiameter })}
          />
        ) : (
          <LengthInput
            label="Pull length"
            value={hw.pullLength}
            units={units}
            onCommit={(pullLength) => set('hardware', { pullLength })}
          />
        )}
        <LengthInput
          label="From door end"
          value={hw.handleFromEnd}
          units={units}
          allowZero
          onCommit={(handleFromEnd) => set('hardware', { handleFromEnd })}
        />
        {c.fronts.style === 'slab' && (
          <LengthInput
            label="From door edge"
            value={hw.handleFromEdge}
            units={units}
            allowZero
            onCommit={(handleFromEdge) => set('hardware', { handleFromEdge })}
          />
        )}
      </div>
      <p className={styles.hint}>
        One per door, on the side it opens from (a pair: both at the meeting stiles), measured down
        from the top, or up from the bottom on doors hung high.
        {c.fronts.style === 'shaker' ? ' On Shaker doors it is centred on the stile.' : ''} Drawers:
        centred, two when wide.
      </p>
    </>
  );
}
