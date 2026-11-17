/**
 * Schema version of saved project files. Bump it (and add a migration in migrate.ts) for any
 * change that would make an existing saved project invalid (DECISIONS.md ADR-011).
 *
 * 2: toe kicks can be turned off (`construction.platform.enabled`).
 * 3: style presets, knobs and handle placement, shelf nosing (ADR-039).
 * 4: built-ins (ADR-040).
 * 5: end panel conventions (flat or framed, ADR-041).
 * 6: run trim, picture lights, corners between runs (ADR-042).
 */
export const CURRENT_SCHEMA_VERSION = 6;
