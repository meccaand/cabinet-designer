import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { CABINET_TYPE_NAMES, createCabinet, hasToeKick } from '../../core/generate';
import {
  gapsBeside,
  nextFreeOffset,
  returnWall,
  wallFrames,
  type LayoutItem,
} from '../../core/layout';
import {
  resolveConstruction,
  type Cabinet,
  type CabinetType,
  type ConstructionDefaults,
  type Filler,
  type MaterialLibrary,
  type Project,
  type ShopSettings,
  type UnitSettings,
  type Wall,
} from '../../core/model';
import { inch, quantize, type Mm } from '../../core/units';
import { projectLayout } from '../models';
import { createSampleProject } from '../sample';

/** Undo depth (ADR-003). */
const HISTORY_LIMIT = 200;

/**
 * The open project document, with undo/redo by snapshots (ADR-003). Every edit goes through
 * immer so unchanged cabinets keep their identity and their generated parts stay cached.
 */
export interface ProjectState {
  project: Project;
  activeCabinetId: string | null;
  past: Project[];
  future: Project[];

  /** Replace the open document (open, new, import). Clears undo history. */
  openProject: (project: Project) => void;
  undo: () => void;
  redo: () => void;
  rename: (name: string) => void;
  setUnits: (units: UnitSettings) => void;

  setActiveCabinet: (id: string) => void;
  updateCabinet: (id: string, recipe: (cabinet: Draft<Cabinet>) => void) => void;
  addCabinet: (type: CabinetType) => string;
  duplicateCabinet: (id: string) => string | null;
  deleteCabinet: (id: string) => void;
  /** Move a cabinet or filler along its wall (or onto another wall). */
  moveItem: (id: string, placement: { wallId?: string; offset?: Mm; elevation?: Mm }) => void;
  /** Move a cabinet or filler along its wall by `delta` (not past the wall start). Repeated
   * nudges of the same item are one undo step. */
  nudgeItem: (id: string, delta: Mm) => void;

  /** Lays out a new project's room: walls of these lengths, joined at inside corners (a
   * straight run, an L or a U). Replaces any walls; one undo step. */
  createRoom: (lengths: Mm[], height: Mm) => void;
  addWall: () => void;
  updateWall: (id: string, recipe: (wall: Draft<Wall>) => void) => void;
  /** Removes an empty wall; returns false if cabinets or fillers are still on it. */
  removeWall: (id: string) => boolean;

  /** Fill the gap beside a cabinet with a filler of exactly that width. */
  fillGap: (cabinetId: string, side: 'left' | 'right') => string | null;
  updateFiller: (id: string, recipe: (filler: Draft<Filler>) => void) => void;
  deleteFiller: (id: string) => void;

  updateMaterials: (recipe: (materials: Draft<MaterialLibrary>) => void) => void;
  updateShop: (recipe: (shop: Draft<ShopSettings>) => void) => void;
  /** Project-wide default materials for each part role. */
  setDefaultMaterial: (role: keyof ConstructionDefaults['materials'], id: string) => void;
  /** Removes a library item unless a cabinet or default still uses it. Returns whether it did. */
  removeMaterial: (id: string) => boolean;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const initial = createSampleProject();

  /** The last coalescing edit (ADR-003): its key and the document it produced. */
  let coalescing: { key: string; project: Project } | null = null;

  /**
   * Apply an undoable edit to the document. Consecutive edits with the same `key`, with nothing
   * else in between (no other edit, undo or redo), share one undo step.
   */
  const edit = (recipe: (p: Draft<Project>) => void, key?: string) =>
    set((s) => {
      const next = produce(s.project, recipe);
      if (next === s.project) return {};
      const merge =
        key !== undefined && coalescing?.key === key && coalescing.project === s.project;
      coalescing = key === undefined ? null : { key, project: next };
      return merge
        ? { project: next, future: [] }
        : { project: next, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project], future: [] };
    });
  /** Keep the active cabinet pointing at something that exists. */
  const fixActive = (project: Project, preferred: string | null) =>
    project.cabinets.some((c) => c.id === preferred)
      ? preferred
      : (project.cabinets[0]?.id ?? null);
  const itemOf = (id: string): LayoutItem | undefined =>
    projectLayout(get().project).find((i) => i.id === id);

  return {
    project: initial,
    activeCabinetId: initial.cabinets[0]?.id ?? null,
    past: [],
    future: [],

    openProject: (project) =>
      set({ project, past: [], future: [], activeCabinetId: project.cabinets[0]?.id ?? null }),

    undo: () =>
      set((s) => {
        const prev = s.past.at(-1);
        if (!prev) return {};
        return {
          project: prev,
          past: s.past.slice(0, -1),
          future: [s.project, ...s.future],
          activeCabinetId: fixActive(prev, s.activeCabinetId),
        };
      }),

    redo: () =>
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return {
          project: next,
          past: [...s.past, s.project],
          future: rest,
          activeCabinetId: fixActive(next, s.activeCabinetId),
        };
      }),

    rename: (name) =>
      edit((p) => {
        p.name = name;
      }),
    setUnits: (units) =>
      edit((p) => {
        p.units = units;
      }),

    setActiveCabinet: (id) => set({ activeCabinetId: id }),

    updateCabinet: (id, recipe) =>
      edit((p) => {
        const cabinet = p.cabinets.find((c) => c.id === id);
        if (cabinet) recipe(cabinet);
      }),

    addCabinet: (type) => {
      const { project, activeCabinetId } = get();
      const id = crypto.randomUUID();
      const n = project.cabinets.filter((c) => c.type === type).length + 1;
      const cabinet = createCabinet(project, type, {
        id,
        name: `${CABINET_TYPE_NAMES[type]} ${n}`,
      });
      // Next to the active cabinet's run, after whatever is already there at that height. An
      // L-shaped cabinet goes in an inside corner: the active cabinet's wall if it ends in one.
      const active = project.cabinets.find((c) => c.id === activeCabinetId);
      // After an L-shaped cabinet, the run carries on along its return's wall.
      const frames = wallFrames(project.room);
      let wallId = active?.placement.wallId ?? project.room.walls[0]?.id ?? null;
      const activeFrame = frames.find((f) => f.wall.id === wallId);
      if (cabinet.corner) {
        const turns = frames.filter((f) => returnWall(f, frames)).map((f) => f.wall.id);
        wallId = turns.includes(wallId ?? '') ? wallId : (turns[0] ?? wallId);
      } else if (active?.corner && activeFrame) {
        wallId = returnWall(activeFrame, frames)?.wall.id ?? wallId;
      }
      let placed: Cabinet = { ...cabinet, placement: { ...cabinet.placement, wallId } };
      if (wallId && !cabinet.corner) {
        const trial = produce(project, (p) => void p.cabinets.push(placed));
        const items = projectLayout(trial);
        const item = items.find((i) => i.id === id);
        if (item) {
          placed = {
            ...placed,
            placement: { ...placed.placement, offset: nextFreeOffset(item, wallId, trial, items) },
          };
        }
      }
      edit((p) => {
        p.cabinets.push(placed);
      });
      set({ activeCabinetId: id });
      return id;
    },

    duplicateCabinet: (id) => {
      const source = get().project.cabinets.find((c) => c.id === id);
      if (!source) return null;
      const copyId = crypto.randomUUID();
      const item = itemOf(id);
      const offset = source.placement.offset + (item ? item.x1 - item.x0 : source.width);
      edit((p) => {
        const i = p.cabinets.findIndex((c) => c.id === id);
        p.cabinets.splice(i + 1, 0, {
          ...structuredClone(source),
          id: copyId,
          name: `${source.name} copy`,
          placement: { ...source.placement, offset },
        });
      });
      set({ activeCabinetId: copyId });
      return copyId;
    },

    deleteCabinet: (id) => {
      const i = get().project.cabinets.findIndex((c) => c.id === id);
      edit((p) => {
        p.cabinets = p.cabinets.filter((c) => c.id !== id);
      });
      const after = get().project.cabinets;
      if (get().activeCabinetId === id) {
        set({ activeCabinetId: (after[Math.min(i, after.length - 1)] ?? null)?.id ?? null });
      }
    },

    moveItem: (id, placement) =>
      edit((p) => {
        const cabinet = p.cabinets.find((c) => c.id === id);
        if (cabinet) {
          if (placement.wallId !== undefined) cabinet.placement.wallId = placement.wallId;
          // L-shaped cabinets sit in their corner; their offset follows the wall.
          if (placement.offset !== undefined && !cabinet.corner)
            cabinet.placement.offset = placement.offset;
          if (placement.elevation !== undefined) cabinet.placement.elevation = placement.elevation;
          return;
        }
        const filler = p.fillers.find((f) => f.id === id);
        if (filler) {
          if (placement.wallId !== undefined) filler.wallId = placement.wallId;
          if (placement.offset !== undefined) filler.offset = placement.offset;
          if (placement.elevation !== undefined) filler.elevation = placement.elevation;
        }
      }),

    nudgeItem: (id, delta) =>
      edit((p) => {
        const cabinet = p.cabinets.find((c) => c.id === id);
        if (cabinet?.corner) return;
        const item = cabinet?.placement ?? p.fillers.find((f) => f.id === id);
        if (item) item.offset = Math.max(0, quantize(item.offset + delta));
      }, `nudge:${id}`),

    createRoom: (lengths, height) =>
      edit((p) => {
        p.room.walls = lengths.map((length, i) => ({
          id: crypto.randomUUID(),
          name: `Wall ${i + 1}`,
          length,
          height,
          turn: 'right',
        }));
      }),

    addWall: () =>
      edit((p) => {
        const n = p.room.walls.length + 1;
        p.room.walls.push({
          id: crypto.randomUUID(),
          name: `Wall ${n}`,
          length: inch(96),
          height: p.room.walls.at(-1)?.height ?? inch(96),
          turn: 'right',
        });
      }),

    updateWall: (id, recipe) =>
      edit((p) => {
        const wall = p.room.walls.find((w) => w.id === id);
        if (wall) recipe(wall);
      }),

    removeWall: (id) => {
      const { project } = get();
      const used =
        project.cabinets.some((c) => c.placement.wallId === id) ||
        project.fillers.some((f) => f.wallId === id);
      if (used || project.room.walls.length <= 1) return false;
      edit((p) => {
        p.room.walls = p.room.walls.filter((w) => w.id !== id);
      });
      return true;
    },

    fillGap: (cabinetId, side) => {
      const { project } = get();
      const items = projectLayout(project);
      const item = items.find((i) => i.id === cabinetId);
      if (!item?.wallId) return null;
      const gaps = gapsBeside(item, project, items);
      const width = gaps?.[side] ?? 0;
      if (width <= 0) return null;
      const id = crypto.randomUUID();
      const filler: Filler = {
        id,
        wallId: item.wallId,
        offset: side === 'left' ? item.offset + item.x0 - width : item.offset + item.x1,
        width,
        // Line up with the cabinet: the box height above any toe kick, its front face.
        height: item.height,
        elevation: item.elevation,
        depth: item.depth,
      };
      const cabinet = project.cabinets.find((c) => c.id === cabinetId);
      const platformTop =
        cabinet && cabinet.placement.elevation === 0 ? cabinetPlatform(project, cabinet) : 0;
      edit((p) => {
        p.fillers.push({
          ...filler,
          elevation: filler.elevation + platformTop,
          height: filler.height - platformTop,
        });
      });
      return id;
    },

    updateFiller: (id, recipe) =>
      edit((p) => {
        const filler = p.fillers.find((f) => f.id === id);
        if (filler) recipe(filler);
      }),

    deleteFiller: (id) =>
      edit((p) => {
        p.fillers = p.fillers.filter((f) => f.id !== id);
      }),

    updateMaterials: (recipe) =>
      edit((p) => {
        recipe(p.materials);
      }),
    updateShop: (recipe) =>
      edit((p) => {
        recipe(p.shop);
      }),
    setDefaultMaterial: (role, id) =>
      edit((p) => {
        p.construction.materials[role] = id;
      }),
    removeMaterial: (id) => {
      const { project } = get();
      if (materialInUse(project, id)) return false;
      edit((p) => {
        const m = p.materials;
        m.sheets = m.sheets.filter((x) => x.id !== id);
        m.solids = m.solids.filter((x) => x.id !== id);
        m.banding = m.banding.filter((x) => x.id !== id);
        m.hardware = m.hardware.filter((x) => x.id !== id);
      });
      return true;
    },
  };
});

/** Toe-kick height under a floor cabinet (0 when it has none): fillers start above it. */
function cabinetPlatform(project: Project, cabinet: Cabinet): Mm {
  const platform = resolveConstruction(project.construction, cabinet.construction).platform;
  return hasToeKick(cabinet.type, platform) ? platform.height : 0;
}

/** Whether a library item is assigned anywhere (defaults or a cabinet's overrides). */
export function materialInUse(project: Project, id: string): boolean {
  if (Object.values(project.construction.materials).includes(id)) return true;
  return project.cabinets.some((c) => Object.values(c.construction.materials ?? {}).includes(id));
}
