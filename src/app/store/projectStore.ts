import { create } from 'zustand';
import type { Project } from '../../core/model';
import { createSampleProject } from '../sample';

/**
 * The open project. Editing actions, undo/redo (ADR-003) and persistence arrive with the editor
 * and room layout; for now it holds the sample project and which cabinet is shown.
 */
interface ProjectState {
  project: Project;
  activeCabinetId: string | null;
  setActiveCabinet: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => {
  const project = createSampleProject();
  return {
    project,
    activeCabinetId: project.cabinets[0]?.id ?? null,
    setActiveCabinet: (id) => set({ activeCabinetId: id }),
  };
});
