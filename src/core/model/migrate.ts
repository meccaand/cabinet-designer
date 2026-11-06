import { z } from 'zod';
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
