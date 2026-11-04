import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../../core/model';
import { byRecent, type ProjectRepository, type ProjectSummary } from './repository';

interface Schema extends DBSchema {
  projects: { key: string; value: ProjectSummary & { data: Project } };
}

/** Projects in the browser's IndexedDB: local-first, no account, survives reloads. */
export class IndexedDbRepository implements ProjectRepository {
  private db: Promise<IDBPDatabase<Schema>> | null = null;

  private open(): Promise<IDBPDatabase<Schema>> {
    this.db ??= openDB<Schema>('cabinet-designer', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
      },
    });
    return this.db;
  }

  async list(): Promise<ProjectSummary[]> {
    const all = await (await this.open()).getAll('projects');
    return byRecent(all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })));
  }

  async load(id: string): Promise<unknown> {
    return (await (await this.open()).get('projects', id))?.data ?? null;
  }

  async save(project: Project): Promise<void> {
    await (
      await this.open()
    ).put('projects', {
      id: project.id,
      name: project.name,
      updatedAt: new Date().toISOString(),
      data: project,
    });
  }

  async remove(id: string): Promise<void> {
    await (await this.open()).delete('projects', id);
  }
}
