/**
 * Schema version of saved project files. Bump it (and add a migration in migrate.ts) for any
 * change that would make an existing saved project invalid. Until the first release the
 * schema is still settling and stays at 1 (see DECISIONS.md ADR-011).
 */
export const CURRENT_SCHEMA_VERSION = 1;
