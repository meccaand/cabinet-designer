import { Suspense, useMemo, useState } from 'react';
import type { Project } from '../../core/model';
import type { CabinetModel } from '../../core/parts';
import { inch, type Mm } from '../../core/units';
import { useProjectStore } from '../store/projectStore';
import { Viewer } from '../viewer/LazyViewer';
import { StartButtons } from './EmptyState';
import form from './Form.module.css';
import styles from './GettingStarted.module.css';
import { LengthInput } from './LengthInput';

const SHAPES = [
  ['Straight', 1],
  ['L-shaped', 2],
  ['U-shaped', 3],
] as const;

/** Typical walls to start from: 10' then 8' runs, 8' ceilings (3 m, 2.4 m in metric). */
function startingRoom(project: Project): { lengths: Mm[]; height: Mm } {
  return project.units.system === 'metric'
    ? { lengths: [3000, 2400, 2400] as Mm[], height: 2400 as Mm }
    : { lengths: [inch(120), inch(96), inch(96)], height: inch(96) };
}

const noop = () => {};

/**
 * A new project's first steps, beside the 3D grid: lay out the room's walls (previewed as you
 * go), then add a first cabinet. Cabinets need a wall to stand on, so the room comes first.
 */
export function GettingStarted({
  project,
  models,
}: {
  project: Project;
  models: ReadonlyMap<string, CabinetModel | null>;
}) {
  const needsRoom = project.room.walls.length === 0;
  const [draft, setDraft] = useState(() => ({ ...startingRoom(project), count: 1 }));

  // The room as it would be created, so the preview matches what "Create room" makes.
  const preview: Project = useMemo(() => {
    if (!needsRoom) return project;
    return {
      ...project,
      room: {
        walls: draft.lengths.slice(0, draft.count).map((length, i) => ({
          id: `draft-${i}`,
          name: `Wall ${i + 1}`,
          length,
          height: draft.height,
          turn: 'right',
        })),
      },
    };
  }, [needsRoom, project, draft]);

  return (
    <div className={styles.start}>
      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="getting-started">
          <p className={styles.step}>Step {needsRoom ? 1 : 2} of 2</p>
          {needsRoom ? (
            <>
              <h2 id="getting-started">Set up the room</h2>
              <p className={form.hint}>
                Measure the walls the cabinets will go on, along the floor. The view on the right
                shows the room as you go.
              </p>
              <div className={form.field}>
                <span className={form.label} id="room-shape">
                  Shape
                </span>
                <div className={form.segmented} role="group" aria-labelledby="room-shape">
                  {SHAPES.map(([label, count]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={draft.count === count}
                      onClick={() => setDraft({ ...draft, count })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {draft.lengths.slice(0, draft.count).map((length, i) => (
                <LengthInput
                  key={i}
                  label={`Wall ${i + 1} length`}
                  value={length}
                  units={project.units}
                  onCommit={(v) =>
                    setDraft({ ...draft, lengths: draft.lengths.map((l, j) => (j === i ? v : l)) })
                  }
                />
              ))}
              <LengthInput
                label="Wall height (floor to ceiling)"
                value={draft.height}
                units={project.units}
                onCommit={(height) => setDraft({ ...draft, height })}
              />
              {draft.count > 1 && (
                <p className={form.hint}>
                  Walls meet at inside corners. You can change corners and add walls later under
                  Room &amp; walls.
                </p>
              )}
              <button
                type="button"
                className={styles.primary}
                onClick={() =>
                  useProjectStore
                    .getState()
                    .createRoom(draft.lengths.slice(0, draft.count), draft.height)
                }
              >
                Create room
              </button>
            </>
          ) : (
            <>
              <h2 id="getting-started">Add a first cabinet</h2>
              <p className={form.hint}>
                It goes at the start of Wall 1, and each new cabinet follows the last one. The cut
                list, sheet layouts and shop packet build themselves as you go.
              </p>
              <StartButtons stacked />
            </>
          )}
        </section>
        <div className={styles.preview}>
          <Suspense fallback={<p className={styles.loading}>Loading 3D view…</p>}>
            <Viewer project={preview} models={models} activeId={null} onActivate={noop} roomOnly />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
