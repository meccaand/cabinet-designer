/**
 * Connects the open project to storage: restores the last project on startup, saves changes
 * shortly after they happen, and remembers which project was open.
 */
import { create } from 'zustand';
import { loadProject, type Project } from '../../core/model';
import { createSampleProject } from '../sample';
import { useProjectStore } from '../store/projectStore';
import { IndexedDbRepository } from './indexedDb';
import { MemoryRepository, type ProjectRepository } from './repository';

const LAST_OPEN = 'cabinet-designer:last-project';
const SAVE_DELAY_MS = 400;

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';
export const useSaveStatus = create<{ status: SaveStatus; message: string | null }>(() => ({
  status: 'loading',
  message: null,
}));

function createRepository(): ProjectRepository {
  return typeof indexedDB === 'undefined' ? new MemoryRepository() : new IndexedDbRepository();
}

/** The app's project storage. */
export const repository: ProjectRepository = createRepository();

export async function startSession(repo: ProjectRepository = repository): Promise<() => void> {
  const store = useProjectStore;
  try {
    const list = await repo.list();
    const preferred = readLastOpen();
    const id = list.find((p) => p.id === preferred)?.id ?? list[0]?.id;
    const loaded = id ? loadProject(await repo.load(id)) : null;
    if (loaded?.ok) {
      store.getState().openProject(loaded.value);
    } else {
      // First run (or unreadable data): start with the sample project and keep it.
      const sample = createSampleProject();
      store.getState().openProject(sample);
      await repo.save(sample);
      if (loaded && !loaded.ok) {
        useSaveStatus.setState({
          status: 'error',
          message: `Couldn't open your last project: ${loaded.error}`,
        });
      }
    }
    writeLastOpen(store.getState().project.id);
    if (useSaveStatus.getState().status === 'loading') useSaveStatus.setState({ status: 'saved' });
  } catch (e) {
    useSaveStatus.setState({ status: 'error', message: `Storage is unavailable: ${String(e)}` });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.project.id !== prev.project.id) writeLastOpen(state.project.id);
    useSaveStatus.setState({ status: 'saving', message: null });
    clearTimeout(timer);
    const project: Project = state.project;
    timer = setTimeout(() => {
      repo.save(project).then(
        () => useSaveStatus.setState({ status: 'saved', message: null }),
        (e: unknown) =>
          useSaveStatus.setState({ status: 'error', message: `Couldn't save: ${String(e)}` }),
      );
    }, SAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

function readLastOpen(): string | null {
  try {
    return localStorage.getItem(LAST_OPEN);
  } catch {
    return null;
  }
}

function writeLastOpen(id: string): void {
  try {
    localStorage.setItem(LAST_OPEN, id);
  } catch {
    // Private mode or blocked storage: the most recently saved project opens instead.
  }
}
