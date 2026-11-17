import { z } from 'zod';
import { inch } from '../units';
import { ProjectSchema, type Project } from './schema';
import { CURRENT_SCHEMA_VERSION } from './version';

/** Upgrades a raw document from version n to n + 1. Must not throw on valid version-n input. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
export type Migrations = Readonly<Record<number, Migration>>;

/** MIGRATIONS[n] upgrades version n → n + 1. */
export const MIGRATIONS: Migrations = {
  // Toe kicks became optional: every project saved before had them on.
  1: (doc) => {
    const construction = record(doc['construction']);
    const platform = record(construction?.['platform']);
    if (!construction || !platform) return doc;
    return { ...doc, construction: { ...construction, platform: { enabled: true, ...platform } } };
  },
  // Style presets, knobs and handle placement, shelf nosing (ADR-039). Values are frozen here
  // rather than read from the defaults, so a later change to the defaults can't alter old files.
  2: (doc) => {
    const construction = record(doc['construction']);
    const hardware = record(construction?.['hardware']);
    const shelves = record(construction?.['shelves']);
    const materials = record(doc['materials']);
    const library = materials?.['hardware'];
    const hasKnob =
      Array.isArray(library) &&
      library.some((h) => record(h)?.['kind'] === 'knob' || record(h)?.['id'] === 'knob');
    return {
      ...doc,
      stylePresets: [],
      ...(construction && {
        construction: {
          ...construction,
          ...(hardware && {
            hardware: {
              handle: 'pull',
              knobDiameter: inch(1.25),
              pullLength: inch(5),
              handleFromEnd: inch(2.75),
              handleFromEdge: inch(1.25),
              ...hardware,
            },
          }),
          ...(shelves && { shelves: { nosingHeight: 0, ...shelves } }),
        },
      }),
      ...(materials &&
        Array.isArray(library) &&
        !hasKnob && {
          materials: {
            ...materials,
            hardware: [...library, { id: 'knob', name: 'Knob', kind: 'knob', unitCost: 6 }],
          },
        }),
    };
  },
  // Built-ins (ADR-040).
  3: (doc) => ({ ...doc, builtIns: [] }),
  // End panel conventions (ADR-041): every end panel so far was flat.
  4: (doc) => {
    const construction = record(doc['construction']);
    if (!construction) return doc;
    return {
      ...doc,
      construction: {
        endPanel: { style: 'flat', frameWidth: inch(2.25), frameThickness: inch(1 / 4) },
        ...construction,
      },
    };
  },
  // Run trim, picture lights and corner-aware runs (ADR-042).
  5: (doc) => {
    const builtIns = Array.isArray(doc['builtIns']) ? (doc['builtIns'] as unknown[]) : [];
    const materials = record(doc['materials']);
    const library = materials?.['hardware'];
    const has = (kind: string) =>
      Array.isArray(library) && library.some((h) => record(h)?.['kind'] === kind);
    const extra = [
      { id: 'picture-light', name: 'Picture light', kind: 'pictureLight', unitCost: 45 },
      { id: 'crown', name: 'Crown moulding', kind: 'crownMoulding', unitCost: 11.5 },
      { id: 'base-moulding', name: 'Base moulding', kind: 'baseMoulding', unitCost: 6.5 },
    ].filter((h) => !has(h.kind));
    return {
      ...doc,
      builtIns: builtIns.map((b) => {
        const bi = record(b);
        if (!bi) return b;
        const runs = Array.isArray(bi['runs']) ? (bi['runs'] as unknown[]) : [];
        return {
          trim: {
            crownHeight: inch(4.5),
            crownProjection: inch(3),
            baseMouldingHeight: inch(4.5),
            pictureLightWidth: inch(16),
          },
          ...bi,
          runs: runs.map((r) => {
            const run = record(r);
            if (!run || !Array.isArray(run['modules'])) return r;
            return {
              ...run,
              modules: (run['modules'] as unknown[]).map((m) => {
                const mod = record(m);
                if (mod?.['kind'] === 'section') return { pictureLight: false, ...mod };
                if (mod?.['kind'] === 'obstruction') return { crown: 'continue', ...mod };
                return m;
              }),
            };
          }),
        };
      }),
      ...(materials &&
        Array.isArray(library) &&
        extra.length > 0 && { materials: { ...materials, hardware: [...library, ...extra] } }),
    };
  },
};

/** The value as a plain object, or undefined: migrations see unvalidated input. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Turn untrusted input (an imported file, an IndexedDB record) into a valid Project:
 * upgrade it to the current version, then validate it.
 */
export function loadProject(raw: unknown): Result<Project> {
  const upgraded = upgradeDocument(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  if (!upgraded.ok) return upgraded;
  const parsed = ProjectSchema.safeParse(upgraded.value);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

/** Apply migrations in order until the document reaches `target`. Does not validate. */
export function upgradeDocument(
  raw: unknown,
  migrations: Migrations,
  target: number,
): Result<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Not a project file.' };
  }
  let doc = raw as Record<string, unknown>;
  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Not a project file (missing schema version).' };
  }
  if (version > target) {
    return {
      ok: false,
      error: `This project was saved by a newer version of the app (format ${version}). Please update.`,
    };
  }
  for (let v = version; v < target; v++) {
    const migrate = migrations[v];
    if (!migrate) return { ok: false, error: `No upgrade path from format ${v}.` };
    doc = { ...migrate(doc), schemaVersion: v + 1 };
  }
  return { ok: true, value: doc };
}
