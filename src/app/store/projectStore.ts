import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { CABINET_TYPE_NAMES, createCabinet } from '../../core/generate';
import type { Cabinet, CabinetType, Project, UnitSettings } from '../../core/model';
import { createSampleProject } from '../sample';

/**
 * The open project document. Every edit goes through immer so unchanged cabinets keep their
 * identity and their generated parts stay cached (PLAN.md data flow). Undo/redo (ADR-003) and
 * persistence arrive with room layout.
 */
interface ProjectState {
  project: Project;
  activeCabinetId: string | null;
  setActiveCabinet: (id: string) => void;
  updateCabinet: (id: string, recipe: (cabinet: Draft<Cabinet>) => void) => void;
  addCabinet: (type: CabinetType) => string;
  deleteCabinet: (id: string) => void;
  setUnits: (units: UnitSettings) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const project = createSampleProject();
  const edit = (recipe: (p: Draft<Project>) => void) =>
    set((s) => ({ project: produce(s.project, recipe) }));

  return {
    project,
    activeCabinetId: project.cabinets[0]?.id ?? null,
    setActiveCabinet: (id) => set({ activeCabinetId: id }),

    updateCabinet: (id, recipe) =>
      edit((p) => {
        const cabinet = p.cabinets.find((c) => c.id === id);
        if (cabinet) recipe(cabinet);
      }),

    addCabinet: (type) => {
      const { project } = get();
      const id = crypto.randomUUID();
      const n = project.cabinets.filter((c) => c.type === type).length + 1;
      const cabinet = createCabinet(project, type, {
        id,
        name: `${CABINET_TYPE_NAMES[type]} ${n}`,
      });
      edit((p) => {
        p.cabinets.push(cabinet);
      });
      set({ activeCabinetId: id });
      return id;
    },

    deleteCabinet: (id) => {
      const before = get().project.cabinets;
      const i = before.findIndex((c) => c.id === id);
      edit((p) => {
        p.cabinets = p.cabinets.filter((c) => c.id !== id);
      });
      const after = get().project.cabinets;
      if (get().activeCabinetId === id) {
        set({ activeCabinetId: (after[Math.min(i, after.length - 1)] ?? null)?.id ?? null });
      }
    },

    setUnits: (units) =>
      edit((p) => {
        p.units = units;
      }),
  };
});
