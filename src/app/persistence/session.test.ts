import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../../core/model';
import { useProjectStore } from '../store/projectStore';
import { MemoryRepository } from './repository';
import { startSession, useSaveStatus } from './session';

const initial = useProjectStore.getState();
let stop: (() => void) | undefined;
beforeEach(() => {
  useProjectStore.setState(initial, true);
  useSaveStatus.setState({ status: 'loading', message: null });
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

describe('MemoryRepository', () => {
  it('lists most recent first and round-trips projects', async () => {
    let t = 0;
    const repo = new MemoryRepository(() => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)));
    await repo.save(createProject('a', 'A'));
    await repo.save(createProject('b', 'B'));
    expect((await repo.list()).map((p) => p.id)).toEqual(['b', 'a']);
    expect(await repo.load('a')).toMatchObject({ id: 'a', name: 'A' });
    expect(await repo.load('zzz')).toBeNull();
    await repo.remove('a');
    expect((await repo.list()).map((p) => p.id)).toEqual(['b']);
  });
});

describe('startSession', () => {
  it('saves the sample project on first run, then autosaves edits after a pause', async () => {
    vi.useFakeTimers();
    const repo = new MemoryRepository();
    stop = await startSession(repo);
    expect((await repo.list()).map((p) => p.name)).toEqual(['Sample kitchen']);
    expect(useSaveStatus.getState().status).toBe('saved');

    useProjectStore.getState().rename('My kitchen');
    expect(useSaveStatus.getState().status).toBe('saving');
    await vi.advanceTimersByTimeAsync(500);
    expect(useSaveStatus.getState().status).toBe('saved');
    expect(await repo.load('sample')).toMatchObject({ name: 'My kitchen' });
  });

  it('reopens the most recently saved project', async () => {
    const repo = new MemoryRepository();
    await repo.save({ ...createProject('mine', 'Garage'), cabinets: [] });
    stop = await startSession(repo);
    expect(useProjectStore.getState().project.name).toBe('Garage');
  });

  it('falls back to the sample and says so when stored data is unreadable', async () => {
    const repo = new MemoryRepository();
    await repo.save({ ...createProject('bad', 'Bad'), schemaVersion: 99 } as never);
    stop = await startSession(repo);
    expect(useProjectStore.getState().project.name).toBe('Sample kitchen');
    expect(useSaveStatus.getState()).toMatchObject({ status: 'error' });
    expect(useSaveStatus.getState().message).toContain('newer version');
  });

  it('reports storage failures', async () => {
    const repo = new MemoryRepository();
    repo.list = () => Promise.reject(new Error('blocked'));
    stop = await startSession(repo);
    expect(useSaveStatus.getState().message).toContain('blocked');
  });
});
