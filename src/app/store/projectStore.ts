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
  cabinetConstruction,
  createBuiltIn,
  createModule,
  createRun,
  createStylePreset,
  resolveConstruction,
  type BuiltIn,
  type Cabinet,
  type CabinetType,
  type ConstructionDefaults,
  type Filler,
  type MaterialLibrary,
  type ModuleTemplate,
  type Project,
  type Run,
  type RunModule,
  type ShopSettings,
  type StylePreset,
  type StyleTemplateId,
  type UnitSettings,
  type Wall,
} from '../../core/model';
import { inch, quantize, type Mm } from '../../core/units';
import {
  fitRun,
  layoutModules,
  setCorner,
  type CornerSettings,
  type RunLayout,
} from '../../core/builtin';
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

  /** Adds a style preset from a template and returns its id (ADR-039). */
  addStyle: (template: StyleTemplateId) => string;
  /** Edits a style; every cabinet following it changes. Edits with the same `key` in a row
   * (e.g. dragging a colour picker) are one undo step. */
  updateStyle: (id: string, recipe: (style: Draft<StylePreset>) => void, key?: string) => void;
  /** Removes a style; cabinets that followed it go back to the project defaults. */
  deleteStyle: (id: string) => void;
  /** Makes a cabinet follow a style, or none. Its own overrides stay. */
  setCabinetStyle: (cabinetId: string, styleId: string | null) => void;

  /** A new built-in with one run along `wallId` (ADR-040). It follows a face-frame style,
   * adding the traditional built-in one if the project has none. Returns its id. */
  addBuiltIn: (wallId: string) => string;
  updateBuiltIn: (id: string, recipe: (b: Draft<BuiltIn>) => void, key?: string) => void;
  deleteBuiltIn: (id: string) => void;
  /** Adds a run along `wallId`, starting where the wall is free. Returns its id. */
  addRun: (builtInId: string, wallId: string) => string | null;
  updateRun: (runId: string, recipe: (run: Draft<Run>) => void, key?: string) => void;
  deleteRun: (runId: string) => void;
  /** Appends a module to a run. A section gets stiles either side, sharing one with a section
   * before it. Returns the new module's id. */
  addModule: (runId: string, template: ModuleTemplate) => string | null;
  updateModule: (moduleId: string, recipe: (m: Draft<RunModule>) => void, key?: string) => void;
  /** Moves a module one place left (-1) or right (+1) in its run. */
  moveModule: (moduleId: string, step: -1 | 1) => void;
  deleteModule: (moduleId: string) => void;
  /** Replaces a run's modules with a whole-wall layout (ADR-043). */
  layOutRun: (runId: string, layout: RunLayout) => void;
  /** Sets how the corner at the start of `wallId` is built, refitting its two runs (ADR-044). */
  setCorner: (builtInId: string, wallId: string, patch: Partial<CornerSettings>) => void;
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
      // A new cabinet follows the active cabinet's style.
      const styleId = project.cabinets.find((c) => c.id === activeCabinetId)?.styleId;
      const cabinet = createCabinet(project, type, {
        id,
        name: `${CABINET_TYPE_NAMES[type]} ${n}`,
        ...(styleId !== undefined && { styleId }),
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

    addStyle: (template) => {
      const id = crypto.randomUUID();
      const style = createStylePreset(id, template);
      const names = new Set(get().project.stylePresets.map((s) => s.name));
      let name = style.name;
      for (let n = 2; names.has(name); n++) name = `${style.name} ${n}`;
      edit((p) => {
        p.stylePresets.push({ ...style, name });
      });
      return id;
    },
    updateStyle: (id, recipe, key) =>
      edit(
        (p) => {
          const style = p.stylePresets.find((s) => s.id === id);
          if (style) recipe(style);
        },
        key === undefined ? undefined : `style:${id}:${key}`,
      ),
    deleteStyle: (id) =>
      edit((p) => {
        p.stylePresets = p.stylePresets.filter((s) => s.id !== id);
        for (const c of p.cabinets) if (c.styleId === id) delete c.styleId;
        for (const b of p.builtIns) if (b.styleId === id) b.styleId = null;
      }),
    setCabinetStyle: (cabinetId, styleId) =>
      edit((p) => {
        const c = p.cabinets.find((x) => x.id === cabinetId);
        if (!c) return;
        if (styleId === null) delete c.styleId;
        else c.styleId = styleId;
      }),

    addBuiltIn: (wallId) => {
      const { project } = get();
      const wall = project.room.walls.find((w) => w.id === wallId);
      if (!wall) return '';
      const faceFrame = project.stylePresets.find(
        (st) =>
          resolveConstruction(project.construction, st.construction).carcass.style === 'faceFrame',
      );
      const styleId = faceFrame?.id ?? crypto.randomUUID();
      const id = crypto.randomUUID();
      const n = project.builtIns.length + 1;
      edit((p) => {
        if (!faceFrame) p.stylePresets.push(createStylePreset(styleId, 'traditionalPainted'));
        const b = createBuiltIn(id, n === 1 ? 'Built-in' : `Built-in ${n}`, styleId);
        const run = createRun(crypto.randomUUID(), wall, 0);
        b.runs.push(run);
        p.builtIns.push(b);
        fitRun(p, b, run);
      });
      return id;
    },
    updateBuiltIn: (id, recipe, key) =>
      edit(
        (p) => {
          const b = p.builtIns.find((x) => x.id === id);
          if (b) recipe(b);
        },
        key === undefined ? undefined : `builtIn:${id}:${key}`,
      ),
    deleteBuiltIn: (id) =>
      edit((p) => {
        p.builtIns = p.builtIns.filter((b) => b.id !== id);
      }),
    addRun: (builtInId, wallId) => {
      const { project } = get();
      const wall = project.room.walls.find((w) => w.id === wallId);
      if (!wall || !project.builtIns.some((b) => b.id === builtInId)) return null;
      const id = crypto.randomUUID();
      edit((p) => {
        const b = p.builtIns.find((x) => x.id === builtInId);
        if (!b) return;
        b.runs.push(createRun(id, wall, 0));
        const run = b.runs.at(-1);
        // Meets a run of the built-in round a corner, if there is one.
        if (run) fitRun(p, b, run);
      });
      return id;
    },
    updateRun: (runId, recipe, key) =>
      edit(
        (p) => {
          const run = p.builtIns.flatMap((b) => b.runs).find((r) => r.id === runId);
          if (run) recipe(run);
        },
        key === undefined ? undefined : `run:${runId}:${key}`,
      ),
    deleteRun: (runId) =>
      edit((p) => {
        for (const b of p.builtIns) b.runs = b.runs.filter((r) => r.id !== runId);
      }),
    addModule: (runId, template) => {
      const run = get()
        .project.builtIns.flatMap((b) => b.runs)
        .find((r) => r.id === runId);
      if (!run) return null;
      const id = crypto.randomUUID();
      const sections = run.modules.filter((m) => m.kind === 'section').length;
      const name =
        template === 'section' || template === 'baseOnly'
          ? `Section ${sections + 1}`
          : template === 'tower'
            ? `Tower ${sections + 1}`
            : '';
      const module = createModule(id, template, name);
      edit((p) => {
        const r = p.builtIns.flatMap((b) => b.runs).find((x) => x.id === runId);
        if (!r) return;
        if (module.kind === 'section') {
          // Stiles either side; the one after a previous section is shared with it.
          if (r.modules.at(-1)?.kind !== 'stile')
            r.modules.push(createModule(crypto.randomUUID(), 'stile'));
          r.modules.push(module, createModule(crypto.randomUUID(), 'stile'));
        } else {
          r.modules.push(module);
        }
      });
      return id;
    },
    updateModule: (moduleId, recipe, key) =>
      edit(
        (p) => {
          const m = p.builtIns
            .flatMap((b) => b.runs)
            .flatMap((r) => r.modules)
            .find((x) => x.id === moduleId);
          if (m) recipe(m);
        },
        key === undefined ? undefined : `module:${moduleId}:${key}`,
      ),
    moveModule: (moduleId, step) =>
      edit((p) => {
        for (const r of p.builtIns.flatMap((b) => b.runs)) {
          const i = r.modules.findIndex((m) => m.id === moduleId);
          const j = i + step;
          if (i < 0 || j < 0 || j >= r.modules.length) continue;
          const [m] = r.modules.splice(i, 1);
          if (m) r.modules.splice(j, 0, m);
        }
      }),
    layOutRun: (runId, layout) =>
      edit((p) => {
        const r = p.builtIns.flatMap((b) => b.runs).find((x) => x.id === runId);
        if (r) r.modules = layoutModules(layout, r, () => crypto.randomUUID());
      }),
    setCorner: (builtInId, wallId, patch) =>
      edit((p) => {
        const b = p.builtIns.find((x) => x.id === builtInId);
        if (b) setCorner(p, b, wallId, patch);
      }),
    deleteModule: (moduleId) =>
      edit((p) => {
        for (const r of p.builtIns.flatMap((b) => b.runs)) {
          if (r.modules.some((m) => m.id === moduleId)) {
            r.modules = tidyStiles(r.modules.filter((m) => m.id !== moduleId));
          }
        }
      }),
  };
});

/**
 * After a module is removed: stiles with no section beside them go, and two stiles left side by
 * side become one.
 */
export function tidyStiles(modules: RunModule[]): RunModule[] {
  const isSection = (m: RunModule | undefined) => m?.kind === 'section';
  const kept = modules.filter(
    (m, i) => m.kind !== 'stile' || isSection(modules[i - 1]) || isSection(modules[i + 1]),
  );
  return kept.filter((m, i) => !(m.kind === 'stile' && kept[i - 1]?.kind === 'stile'));
}

/** Toe-kick height under a floor cabinet (0 when it has none): fillers start above it. */
function cabinetPlatform(project: Project, cabinet: Cabinet): Mm {
  const platform = cabinetConstruction(project, cabinet).platform;
  return hasToeKick(cabinet.type, platform) ? platform.height : 0;
}

/** Whether a library item is assigned anywhere (defaults or a cabinet's overrides). */
export function materialInUse(project: Project, id: string): boolean {
  if (Object.values(project.construction.materials).includes(id)) return true;
  const uses = (o: { construction: { materials?: Partial<Record<string, string>> | undefined } }) =>
    Object.values(o.construction.materials ?? {}).includes(id);
  return project.cabinets.some(uses) || project.stylePresets.some(uses);
}
