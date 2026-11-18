import { useEffect, useRef } from 'react';
import {
  cornerAt,
  hingeTowardsEnd,
  RUN_LAYOUTS,
  setRunEnd,
  strayPartner,
  setRunOffset,
  type CornerSettings,
  type ExpandedProject,
  type RunLayout,
} from '../../core/builtin';
import { wallFrames } from '../../core/layout';
import {
  MODULE_TEMPLATES,
  resolveConstruction,
  type BuiltIn,
  type ModuleTemplate,
  type Project,
  type Run,
  type RunModule,
  type SectionModule,
} from '../../core/model';
import { formatLength, type Mm } from '../../core/units';
import { cabinetResult } from '../models';
import { useProjectStore } from '../store/projectStore';
import { useViewerStore } from '../store/viewerStore';
import { Choice, TextField } from './Fields';
import styles from './Form.module.css';
import { LengthInput } from './LengthInput';
import { NumberInput } from './NumberInput';
import { StyleEditor } from './StyleSection';

const END_OPTIONS: [Run['ends']['left'], string][] = [
  ['wall', 'A wall'],
  ['open', 'The room'],
  ['corner', 'The run round the corner'],
];

const KIND_NAMES: Record<RunModule['kind'], string> = {
  section: 'Section',
  stile: 'Stile',
  pilaster: 'Pilaster',
  obstruction: 'Opening',
};

/**
 * A built-in (ADR-040): its style and top line, then each run's datums and modules. Its boxes,
 * countertop and trim are compiled from these; they aren't edited one by one.
 */
export function BuiltInEditor({
  project,
  built,
  builtIn,
  moduleId,
}: {
  project: Project;
  built: ExpandedProject;
  builtIn: BuiltIn;
  moduleId: string | undefined;
}) {
  const { updateBuiltIn, deleteBuiltIn, addRun, addStyle } = useProjectStore.getState();
  const select = useViewerStore((s) => s.select);
  const units = project.units;
  const faceFrameStyles = project.stylePresets.filter(
    (st) =>
      resolveConstruction(project.construction, st.construction).carcass.style === 'faceFrame',
  );
  const errors = [
    ...(built.errors.get(builtIn.id) ?? []),
    ...built.project.cabinets
      .filter((c) => built.sources.get(c.id)?.builtInId === builtIn.id)
      .flatMap((c) => {
        const r = cabinetResult(c, built.project);
        return r.ok ? [] : r.errors.map((e) => `${c.name}: ${e}`);
      }),
  ];
  const freeWalls = project.room.walls;
  const style = project.stylePresets.find((st) => st.id === builtIn.styleId);

  return (
    <div aria-label="Edit built-in" role="region">
      <section className={styles.section}>
        <TextField
          label="Built-in name"
          value={builtIn.name}
          onCommit={(name) => updateBuiltIn(builtIn.id, (b) => void (b.name = name))}
        />
        <div className={styles.grid} style={{ marginTop: 8 }}>
          <Choice
            label="Style"
            value={builtIn.styleId ?? ''}
            options={[
              ...faceFrameStyles.map((st): [string, string] => [st.id, st.name]),
              ...(builtIn.styleId === null ? [['', 'Project defaults'] as [string, string]] : []),
              ['new', 'New: Traditional painted built-in…'],
            ]}
            onChange={(v) => {
              const styleId = v === 'new' ? addStyle('traditionalPainted') : v || null;
              updateBuiltIn(builtIn.id, (b) => void (b.styleId = styleId));
            }}
          />
          <LengthInput
            label="Ceiling to top of uppers"
            value={builtIn.topGap}
            units={units}
            allowZero
            onCommit={(topGap) => updateBuiltIn(builtIn.id, (b) => void (b.topGap = topGap))}
          />
        </div>
        <div className={styles.grid} style={{ marginTop: 8 }}>
          <LengthInput
            label="Crown height"
            value={builtIn.trim.crownHeight}
            units={units}
            allowZero
            onCommit={(v) => updateBuiltIn(builtIn.id, (b) => void (b.trim.crownHeight = v))}
          />
          <LengthInput
            label="Crown projection"
            value={builtIn.trim.crownProjection}
            units={units}
            allowZero
            onCommit={(v) => updateBuiltIn(builtIn.id, (b) => void (b.trim.crownProjection = v))}
          />
          <LengthInput
            label="Base moulding height"
            value={builtIn.trim.baseMouldingHeight}
            units={units}
            allowZero
            onCommit={(v) => updateBuiltIn(builtIn.id, (b) => void (b.trim.baseMouldingHeight = v))}
          />
          <LengthInput
            label="Picture light width"
            value={builtIn.trim.pictureLightWidth}
            units={units}
            onCommit={(v) => updateBuiltIn(builtIn.id, (b) => void (b.trim.pictureLightWidth = v))}
          />
        </div>
        <p className={styles.hint}>
          One line round the room above the upper bays: a frieze{' '}
          {formatLength(Math.max(0, builtIn.topGap - builtIn.trim.crownHeight), units)} tall under
          the crown. Crown and base moulding are bought by length; they run round corners and return
          at open ends.
        </p>
        {style && (
          <details className={styles.styleDetails}>
            <summary>Edit “{style.name}”</summary>
            <StyleEditor project={project} style={style} />
          </details>
        )}
        {(built.warnings.get(builtIn.id) ?? []).map((w) => (
          <p key={w} className={styles.hint} role="status">
            ⚠ {w}
          </p>
        ))}
        {errors.length > 0 && (
          <div role="alert" className={styles.error} style={{ marginTop: 8 }}>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
      </section>

      {builtIn.runs.map((run) => (
        <RunEditor
          key={run.id}
          project={project}
          built={built}
          builtIn={builtIn}
          run={run}
          moduleId={moduleId}
          onPick={(id) => select({ kind: 'builtIn', id: builtIn.id, moduleId: id })}
        />
      ))}

      <section className={styles.section}>
        <Choice
          label="Add a run"
          value=""
          options={[
            ['', 'Choose a wall…'],
            ...freeWalls.map((w): [string, string] => [w.id, w.name]),
          ]}
          onChange={(wallId) => wallId && addRun(builtIn.id, wallId)}
        />
      </section>

      <button
        type="button"
        className={`${styles.button} ${styles.danger}`}
        onClick={() => {
          deleteBuiltIn(builtIn.id);
          select(null);
        }}
      >
        Delete built-in
      </button>
    </div>
  );
}

/**
 * How a run's end meets the run round the corner (ADR-044). Both runs show the same corner;
 * a change refits them.
 */
function CornerFields({
  project,
  builtIn,
  run,
  side,
}: {
  project: Project;
  builtIn: BuiltIn;
  run: Run;
  side: 'left' | 'right';
}) {
  const frames = wallFrames(project.room);
  const i = frames.findIndex((fr) => fr.wall.id === run.wallId);
  const other = frames[side === 'left' ? i - 1 : i + 1];
  const wallId = side === 'left' ? run.wallId : other?.wall.id;
  if (!wallId || !other) return null;
  const facing = side === 'left' ? 'right' : 'left';
  const paired = builtIn.runs.some(
    (r) => r.wallId === other.wall.id && r.ends[facing] === 'corner',
  );
  const stray = paired ? null : strayPartner(project, builtIn, run, side);
  if (stray) {
    return (
      <div className={`${styles.field} ${styles.wide}`}>
        <button
          type="button"
          className={styles.button}
          onClick={() => useProjectStore.getState().joinBuiltIn(builtIn.id, stray.builtIn.id)}
        >
          Join “{stray.builtIn.name}” into this built-in
        </button>
        <p className={styles.hint}>
          The run on {other.wall.name} is in “{stray.builtIn.name}”. Runs meet round a corner only
          within one built-in; joined, its runs take this built-in's style and trim.
        </p>
      </div>
    );
  }
  const corner = cornerAt(builtIn, wallId);
  const set = (patch: Partial<CornerSettings>) =>
    useProjectStore.getState().setCorner(builtIn.id, wallId, patch);
  const Side = side === 'left' ? 'Left' : 'Right';
  const mine = side === 'right' ? 'earlier' : 'later';
  return (
    <>
      <Choice
        label={`${Side} corner base`}
        value={corner.base}
        options={[
          ['dead', 'Dead corner, fillers'],
          ['blind', 'Blind corner box'],
        ]}
        onChange={(base) => set({ base })}
      />
      <Choice
        label={`${Side} corner uppers`}
        value={corner.upper}
        options={[
          ['dead', 'Corner stile'],
          ['wrap', 'Wrap-around shelves'],
        ]}
        onChange={(upper) => set({ upper })}
      />
      {corner.base === 'blind' && (
        <Choice
          label={`${Side} corner blind box in`}
          value={corner.owner === mine ? 'mine' : 'theirs'}
          options={[
            ['mine', 'This run'],
            ['theirs', `The run on ${other.wall.name}`],
          ]}
          onChange={(v) =>
            set({ owner: v === 'mine' ? mine : mine === 'earlier' ? 'later' : 'earlier' })
          }
        />
      )}
    </>
  );
}

function RunEditor({
  project,
  built,
  builtIn,
  run,
  moduleId,
  onPick,
}: {
  project: Project;
  built: ExpandedProject;
  builtIn: BuiltIn;
  run: Run;
  moduleId: string | undefined;
  onPick: (id: string | undefined) => void;
}) {
  const { updateRun, deleteRun, addModule, layOutRun } = useProjectStore.getState();
  const units = project.units;
  const f = (v: Mm) => formatLength(v, units);
  const wall = project.room.walls.find((w) => w.id === run.wallId);
  const set = (recipe: (r: Run) => void) => updateRun(run.id, recipe);
  const length = (label: string, value: Mm, onCommit: (v: Mm) => void, allowZero = false) => (
    <LengthInput
      label={label}
      value={value}
      units={units}
      onCommit={onCommit}
      allowZero={allowZero}
    />
  );
  const end = Math.max(0, ...run.modules.map((m) => built.modules.get(m.id)?.x1 ?? 0));

  return (
    <section className={styles.section} aria-label={`Run on ${wall?.name ?? 'a wall'}`}>
      <h3 className={styles.sectionTitle}>Run on {wall?.name ?? 'a missing wall'}</h3>
      <div className={styles.grid}>
        <Choice
          label="Wall"
          value={run.wallId}
          options={project.room.walls.map((w): [string, string] => [w.id, w.name])}
          onChange={(wallId) => set((r) => void (r.wallId = wallId))}
        />
        {length(
          'From wall start',
          run.offset,
          (offset) => set((r) => setRunOffset(r, wall?.length ?? Infinity, offset)),
          true,
        )}
        {length('Run length', run.length, (v) => set((r) => void (r.length = v)))}
        {length('Countertop height', run.countertopHeight, (v) =>
          set((r) => void (r.countertopHeight = v)),
        )}
        {length('Base depth', run.baseDepth, (v) => set((r) => void (r.baseDepth = v)))}
        {length('Upper depth', run.upperDepth, (v) => set((r) => void (r.upperDepth = v)))}
        {length(
          'Countertop overhang',
          run.countertopOverhang,
          (v) => set((r) => void (r.countertopOverhang = v)),
          true,
        )}
        {length('Countertop thickness', run.countertopEdge, (v) =>
          set((r) => void (r.countertopEdge = v)),
        )}
        <NumberInput
          label="Shelves per bay"
          value={run.shelves}
          step={1}
          onCommit={(v) => set((r) => void (r.shelves = Math.min(20, Math.round(v))))}
        />
        <Choice
          label="Left end meets"
          value={run.ends.left}
          options={END_OPTIONS}
          onChange={(v) => set((r) => setRunEnd(r, 'left', v))}
        />
        <Choice
          label="Right end meets"
          value={run.ends.right}
          options={END_OPTIONS}
          onChange={(v) => set((r) => setRunEnd(r, 'right', v))}
        />
        {(['left', 'right'] as const).map(
          (side) =>
            run.ends[side] === 'corner' && (
              <CornerFields key={side} project={project} builtIn={builtIn} run={run} side={side} />
            ),
        )}
      </div>
      <p className={styles.hint}>
        Modules take {f(end)} of the run's {f(run.length)}; auto-width sections share the rest.
        Every upper bay that follows the run gets {run.shelves} shelves on the same lines.
      </p>

      <Choice
        label={run.modules.length === 0 ? 'Lay out the wall' : 'Replace the modules with a layout'}
        value=""
        options={[
          ['', 'Choose a layout…'],
          ...RUN_LAYOUTS.map((l): [string, string] => [l.id, l.name]),
        ]}
        onChange={(l) => {
          if (!l) return;
          layOutRun(run.id, l as RunLayout);
          onPick(undefined);
        }}
      />

      <h4 className={styles.subTitle}>Modules, left to right</h4>
      <ol className={styles.moduleList} aria-label="Modules">
        {run.modules.map((m, i) => (
          <ModuleRow
            key={m.id}
            project={project}
            built={built}
            run={run}
            module={m}
            index={i}
            open={m.id === moduleId}
            onToggle={() => onPick(m.id === moduleId ? undefined : m.id)}
          />
        ))}
      </ol>
      <Choice
        label="Add a module"
        value=""
        options={[
          ['', 'Choose…'],
          ...MODULE_TEMPLATES.map((t): [string, string] => [t.id, t.name]),
        ]}
        onChange={(t) => {
          if (!t) return;
          const id = addModule(run.id, t as ModuleTemplate);
          if (id) onPick(id);
        }}
      />
      {builtIn.runs.length > 1 && (
        <button
          type="button"
          className={`${styles.button} ${styles.danger}`}
          style={{ marginTop: 8 }}
          onClick={() => deleteRun(run.id)}
        >
          Delete this run
        </button>
      )}
    </section>
  );
}

function ModuleRow({
  project,
  built,
  run,
  module: m,
  index,
  open,
  onToggle,
}: {
  project: Project;
  built: ExpandedProject;
  run: Run;
  module: RunModule;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { moveModule, deleteModule } = useProjectStore.getState();
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) row.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  const units = project.units;
  const width = built.modules.get(m.id)?.width;
  const title =
    m.kind === 'section'
      ? m.name || 'Section'
      : m.kind === 'obstruction'
        ? m.label || 'Opening'
        : KIND_NAMES[m.kind];
  const label = `${title}${width !== undefined ? ` · ${formatLength(width, units)}` : ''}${
    m.kind === 'section' && m.width === 'auto' ? ' (auto)' : ''
  }`;

  return (
    <li ref={row} className={open ? styles.moduleRowOpen : styles.moduleRow}>
      <div className={styles.moduleHead}>
        <button type="button" className={styles.moduleName} aria-expanded={open} onClick={onToggle}>
          {label}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move ${title} left`}
          disabled={index === 0}
          onClick={() => moveModule(m.id, -1)}
        >
          ←
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move ${title} right`}
          disabled={index === run.modules.length - 1}
          onClick={() => moveModule(m.id, 1)}
        >
          →
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Remove ${title}`}
          onClick={() => deleteModule(m.id)}
        >
          ✕
        </button>
      </div>
      {open && (
        <ModuleFields
          project={project}
          run={run}
          module={m}
          width={width}
          niche={built.niches.get(m.id)}
          placed={built.modules.get(m.id)}
          runEnd={Math.max(0, ...run.modules.map((x) => built.modules.get(x.id)?.x1 ?? 0))}
        />
      )}
    </li>
  );
}

function ModuleFields({
  project,
  run,
  module: m,
  width,
  niche,
  placed,
  runEnd,
}: {
  project: Project;
  run: Run;
  module: RunModule;
  /** As laid out (auto sections' share). */
  width: Mm | undefined;
  niche?: { width: Mm; height: Mm } | undefined;
  /** Where it was laid out along the run, and where the run's modules end. */
  placed: { x0: Mm; x1: Mm } | undefined;
  runEnd: Mm;
}) {
  const updateModule = useProjectStore((s) => s.updateModule);
  const units = project.units;
  const set = (recipe: (x: RunModule) => void) => updateModule(m.id, recipe);
  const length = (label: string, value: Mm, onCommit: (v: Mm) => void) => (
    <LengthInput label={label} value={value} units={units} onCommit={onCommit} />
  );

  if (m.kind === 'stile') {
    return (
      <div className={styles.grid}>
        {length('Stile width', m.width, (v) =>
          set((x) => void (x.kind === 'stile' && (x.width = v))),
        )}
        <p className={styles.hint} style={{ gridColumn: '1 / -1' }}>
          Between two sections each box carries half; at an end, that box carries all of it.
        </p>
      </div>
    );
  }
  if (m.kind === 'pilaster') {
    return (
      <div className={styles.grid}>
        {length('Pilaster width', m.width, (v) =>
          set((x) => void (x.kind === 'pilaster' && (x.width = v))),
        )}
        {length('Pilaster depth', m.depth, (v) =>
          set((x) => void (x.kind === 'pilaster' && (x.depth = v))),
        )}
      </div>
    );
  }
  if (m.kind === 'obstruction') {
    return (
      <div className={styles.grid}>
        <TextField
          label="Label"
          value={m.label}
          onCommit={(label) => set((x) => void (x.kind === 'obstruction' && (x.label = label)))}
        />
        {length('Opening width', m.width, (v) =>
          set((x) => void (x.kind === 'obstruction' && (x.width = v))),
        )}
        {length('Opening height', m.height, (v) =>
          set((x) => void (x.kind === 'obstruction' && (x.height = v))),
        )}
        <Choice
          label="Crown and frieze"
          value={m.crown}
          options={[
            ['continue', 'Run across it'],
            ['stop', 'Stop either side'],
          ]}
          onChange={(v) => set((x) => void (x.kind === 'obstruction' && (x.crown = v)))}
        />
        <p className={styles.hint} style={{ gridColumn: '1 / -1' }}>
          Kept clear and drawn; the countertop and base moulding stop at it.
        </p>
      </div>
    );
  }
  return (
    <SectionFields
      project={project}
      run={run}
      module={m}
      width={width}
      niche={niche}
      placed={placed}
      runEnd={runEnd}
    />
  );
}

function SectionFields({
  project,
  run,
  module: m,
  width,
  niche,
  placed,
  runEnd,
}: {
  project: Project;
  run: Run;
  module: SectionModule;
  width: Mm | undefined;
  niche: { width: Mm; height: Mm } | undefined;
  placed: { x0: Mm; x1: Mm } | undefined;
  runEnd: Mm;
}) {
  const updateModule = useProjectStore((s) => s.updateModule);
  const units = project.units;
  const set = (recipe: (x: SectionModule) => void) =>
    updateModule(m.id, (x) => void (x.kind === 'section' && recipe(x)));
  const auto = m.width === 'auto';

  return (
    <div>
      <div className={styles.grid}>
        <TextField
          label="Section name"
          value={m.name}
          onCommit={(name) => set((x) => void (x.name = name))}
        />
        {/* While auto it shows the share it was given; typing a width fixes it. */}
        <LengthInput
          label="Opening width"
          value={auto ? (width ?? 762) : (m.width as Mm)}
          units={units}
          onCommit={(v) => set((x) => void (x.width = v))}
        />
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) =>
            set(
              (x) =>
                void (x.width = e.target.checked
                  ? 'auto'
                  : x.width === 'auto'
                    ? (width ?? 762) // keep the width it had as laid out
                    : x.width),
            )
          }
        />
        Auto width (share the run's length with other auto sections)
      </label>

      <h4 className={styles.subTitle}>Base doors</h4>
      {m.base.groups.map((g, i) => (
        <div key={i} className={styles.grid}>
          <Choice
            label={`Group ${i + 1}`}
            value={String(g.doors)}
            options={[
              ['2', 'Pair of doors'],
              ['1', 'Single door'],
            ]}
            onChange={(v) =>
              set((x) => {
                const grp = x.base.groups[i];
                if (!grp) return;
                grp.doors = v === '1' ? 1 : 2;
                if (grp.doors === 2) delete grp.hinge;
                // A single door hinges on the side nearer the run's end, opening towards the
                // wall or corner.
                else if (placed) grp.hinge = hingeTowardsEnd(placed.x0, placed.x1, runEnd);
              })
            }
          />
          {g.doors === 1 ? (
            <Choice
              label={`Group ${i + 1} hinged`}
              value={g.hinge ?? 'left'}
              options={[
                ['left', 'Left'],
                ['right', 'Right'],
              ]}
              onChange={(hinge) =>
                set((x) => void (x.base.groups[i] && (x.base.groups[i].hinge = hinge)))
              }
            />
          ) : (
            <div />
          )}
        </div>
      ))}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.button}
          onClick={() => set((x) => void x.base.groups.push({ doors: 2 }))}
        >
          Add a door group
        </button>
        {m.base.groups.length > 1 && (
          <button
            type="button"
            className={styles.button}
            onClick={() => set((x) => void x.base.groups.pop())}
          >
            Remove the last group
          </button>
        )}
      </div>
      <div className={styles.grid} style={{ marginTop: 8 }}>
        <NumberInput
          label="Shelves behind the doors"
          value={m.base.shelves}
          step={1}
          onCommit={(v) => set((x) => void (x.base.shelves = Math.min(10, Math.round(v))))}
        />
      </div>

      <h4 className={styles.subTitle}>Above the countertop</h4>
      <Choice
        label="Upper"
        value={m.upper?.kind ?? 'none'}
        options={[
          ['openBay', 'Open shelves'],
          ['mediaNiche', 'TV niche with a bridge above'],
          ['none', 'Nothing (base only)'],
        ]}
        onChange={(v) =>
          set(
            (x) =>
              void (x.upper =
                v === 'none'
                  ? null
                  : v === 'mediaNiche'
                    ? { kind: 'mediaNiche', cubbies: 2, bridgeLine: 1, tvSize: null }
                    : { kind: 'openBay', shelves: null }),
          )
        }
      />
      {m.upper?.kind === 'openBay' && (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={m.upper.shelves === null}
              onChange={(e) =>
                set((x) => {
                  if (x.upper?.kind === 'openBay')
                    x.upper.shelves = e.target.checked ? null : run.shelves;
                })
              }
            />
            Shelves follow the run's lines ({run.shelves})
          </label>
          {m.upper.shelves !== null && (
            <div className={styles.grid}>
              <NumberInput
                label="Shelves in this bay"
                value={m.upper.shelves}
                step={1}
                onCommit={(v) =>
                  set((x) => {
                    if (x.upper?.kind === 'openBay') x.upper.shelves = Math.min(20, Math.round(v));
                  })
                }
              />
            </div>
          )}
        </>
      )}
      {m.upper?.kind === 'mediaNiche' && (
        <>
          <div className={styles.grid}>
            <NumberInput
              label="Cubbies in the bridge"
              value={m.upper.cubbies}
              min={1}
              step={1}
              onCommit={(v) =>
                set((x) => {
                  if (x.upper?.kind === 'mediaNiche')
                    x.upper.cubbies = Math.max(1, Math.min(6, Math.round(v)));
                })
              }
            />
            <Choice
              label="Bridge lines up with"
              value={String(m.upper.bridgeLine)}
              options={Array.from(
                { length: Math.max(1, run.shelves) },
                (_, i): [string, string] => [
                  String(i + 1),
                  i === 0 ? 'The top shelf line' : `Shelf line ${i + 1} from the top`,
                ],
              )}
              onChange={(v) =>
                set((x) => {
                  if (x.upper?.kind === 'mediaNiche') x.upper.bridgeLine = Number(v);
                })
              }
            />
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={m.upper.tvSize !== null}
              onChange={(e) =>
                set((x) => {
                  if (x.upper?.kind === 'mediaNiche')
                    x.upper.tvSize = e.target.checked ? 1651 : null;
                })
              }
            />
            Check that a TV fits
          </label>
          {m.upper.tvSize !== null && (
            <div className={styles.grid}>
              <LengthInput
                label="TV size (diagonal)"
                value={m.upper.tvSize}
                units={units}
                onCommit={(v) =>
                  set((x) => {
                    if (x.upper?.kind === 'mediaNiche') x.upper.tvSize = v;
                  })
                }
              />
            </div>
          )}
          {niche && (
            <p className={styles.hint}>
              The niche opening is {formatLength(niche.width, units)} wide ×{' '}
              {formatLength(niche.height, units)} high.
            </p>
          )}
        </>
      )}

      {m.upper && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={m.pictureLight}
            onChange={(e) => set((x) => void (x.pictureLight = e.target.checked))}
          />
          Picture light on the frieze above
        </label>
      )}

      <h4 className={styles.subTitle}>Finished ends</h4>
      <div className={styles.row}>
        {(['left', 'right'] as const).map((side) => (
          <label key={side} className={styles.check}>
            <input
              type="checkbox"
              checked={m.endPanels[side]}
              onChange={(e) => set((x) => void (x.endPanels[side] = e.target.checked))}
            />
            {side === 'left' ? 'Left' : 'Right'} end panel
          </label>
        ))}
      </div>
    </div>
  );
}
