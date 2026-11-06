/**
 * Schema version of saved project files. Bump it (and add a migration in migrate.ts) for any
 * change that would make an existing saved project invalid (DECISIONS.md ADR-011).
 *
 * 2: toe kicks can be turned off (`construction.platform.enabled`).
 */
export const CURRENT_SCHEMA_VERSION = 2;
