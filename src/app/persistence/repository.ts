import type { Project } from '../../core/model';

export interface ProjectSummary {
  id: string;
  name: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

/**
 * Where projects live (ADR-010). The app only talks to this interface, so a sync backend can be
 * added later without touching the UI. `load` returns raw stored data: callers validate and
 * migrate it with `loadProject` from core.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<unknown>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Keeps projects in memory: tests, and the fallback when the browser blocks IndexedDB. */
export class MemoryRepository implements ProjectRepository {
  private readonly store = new Map<string, { summary: ProjectSummary; data: Project }>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  list(): Promise<ProjectSummary[]> {
    return Promise.resolve(byRecent([...this.store.values()].map((v) => v.summary)));
  }
  load(id: string): Promise<unknown> {
    return Promise.resolve(this.store.get(id)?.data ?? null);
  }
  save(project: Project): Promise<void> {
    const summary = { id: project.id, name: project.name, updatedAt: this.now().toISOString() };
    this.store.set(project.id, { summary, data: structuredClone(project) });
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }
}

export function byRecent(list: ProjectSummary[]): ProjectSummary[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
