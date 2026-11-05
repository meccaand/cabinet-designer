import { create } from 'zustand';
import type { PartGroup, View } from '../viewer/scene';

export type Selection =
  | { kind: 'cabinet'; id: string }
  | { kind: 'part'; id: string }
  | { kind: 'filler'; id: string }
  | null;

export type Panel = 'edit' | 'parts';

/** Main area: 3D, plan, a wall elevation, or one of the shop outputs. */
export type MainView = '3d' | 'plan' | 'elevation' | 'cutlist' | 'sheets' | 'materials';

/** How the 3D view is shown. Not part of the project document, so never undone or saved. */
interface ViewerState {
  selection: Selection;
  /** Right-hand panel tab. */
  panel: Panel;
  main: MainView;
  /** 3D: the active cabinet alone, or every cabinet in the room. */
  scope: 'cabinet' | 'room';
  /** Wall shown in the elevation view. */
  elevationWall: string | null;
  /** Face-tree path of the opening being edited, or null. */
  opening: string | null;
  view: View;
  /** Bumped on every view request so pressing the same view again re-fits the camera. */
  viewRequest: number;
  exploded: boolean;
  xray: boolean;
  dimensions: boolean;
  hiddenParts: Partial<Record<string, true>>;
  hiddenGroups: Partial<Record<PartGroup, true>>;
  /** On narrow screens the side panels slide over the main view; which one is open. */
  drawer: 'cabinets' | 'properties' | null;
  /** The keyboard shortcuts dialog. */
  help: boolean;
  select: (selection: Selection) => void;
  setPanel: (panel: Panel) => void;
  setMain: (main: MainView) => void;
  setScope: (scope: 'cabinet' | 'room') => void;
  setElevationWall: (id: string) => void;
  selectOpening: (path: string | null) => void;
  setView: (view: View) => void;
  toggle: (flag: 'exploded' | 'xray' | 'dimensions') => void;
  togglePart: (id: string) => void;
  toggleGroup: (group: PartGroup) => void;
  showAll: () => void;
  setDrawer: (drawer: 'cabinets' | 'properties' | null) => void;
  setHelp: (help: boolean) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  selection: null,
  panel: 'edit',
  main: '3d',
  scope: 'cabinet',
  elevationWall: null,
  opening: null,
  view: 'iso',
  viewRequest: 0,
  exploded: false,
  xray: false,
  dimensions: true,
  hiddenParts: {},
  hiddenGroups: {},
  drawer: null,
  help: false,
  // Picking a part shows its details; picking a cabinet keeps whichever tab is open.
  select: (selection) =>
    set((s) => ({ selection, panel: selection?.kind === 'part' ? 'parts' : s.panel })),
  setPanel: (panel) => set({ panel }),
  setMain: (main) => set({ main }),
  setScope: (scope) => set((s) => ({ scope, viewRequest: s.viewRequest + 1 })),
  setElevationWall: (elevationWall) => set({ elevationWall }),
  selectOpening: (opening) => set({ opening }),
  setView: (view) => set((s) => ({ view, viewRequest: s.viewRequest + 1 })),
  toggle: (flag) => set((s) => ({ [flag]: !s[flag] })),
  togglePart: (id) => set((s) => ({ hiddenParts: flip(s.hiddenParts, id) })),
  toggleGroup: (group) => set((s) => ({ hiddenGroups: flip(s.hiddenGroups, group) })),
  showAll: () => set({ hiddenParts: {}, hiddenGroups: {} }),
  setDrawer: (drawer) => set({ drawer }),
  setHelp: (help) => set({ help }),
}));

/** Add `key` to the set if absent, remove it if present. */
function flip<K extends string>(set: Partial<Record<K, true>>, key: K): Partial<Record<K, true>> {
  if (!set[key]) return { ...set, [key]: true };
  return Object.fromEntries(Object.entries(set).filter(([k]) => k !== key)) as Partial<
    Record<K, true>
  >;
}
