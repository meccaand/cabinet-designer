import { create } from 'zustand';
import type { PartGroup, View } from '../viewer/scene';

export type Selection = { kind: 'cabinet'; id: string } | { kind: 'part'; id: string } | null;

/** How the 3D view is shown. Not part of the project document, so never undone or saved. */
interface ViewerState {
  selection: Selection;
  view: View;
  /** Bumped on every view request so pressing the same view again re-fits the camera. */
  viewRequest: number;
  exploded: boolean;
  xray: boolean;
  dimensions: boolean;
  hiddenParts: Partial<Record<string, true>>;
  hiddenGroups: Partial<Record<PartGroup, true>>;
  select: (selection: Selection) => void;
  setView: (view: View) => void;
  toggle: (flag: 'exploded' | 'xray' | 'dimensions') => void;
  togglePart: (id: string) => void;
  toggleGroup: (group: PartGroup) => void;
  showAll: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  selection: null,
  view: 'iso',
  viewRequest: 0,
  exploded: false,
  xray: false,
  dimensions: true,
  hiddenParts: {},
  hiddenGroups: {},
  select: (selection) => set({ selection }),
  setView: (view) => set((s) => ({ view, viewRequest: s.viewRequest + 1 })),
  toggle: (flag) => set((s) => ({ [flag]: !s[flag] })),
  togglePart: (id) => set((s) => ({ hiddenParts: flip(s.hiddenParts, id) })),
  toggleGroup: (group) => set((s) => ({ hiddenGroups: flip(s.hiddenGroups, group) })),
  showAll: () => set({ hiddenParts: {}, hiddenGroups: {} }),
}));

/** Add `key` to the set if absent, remove it if present. */
function flip<K extends string>(set: Partial<Record<K, true>>, key: K): Partial<Record<K, true>> {
  if (!set[key]) return { ...set, [key]: true };
  return Object.fromEntries(Object.entries(set).filter(([k]) => k !== key)) as Partial<
    Record<K, true>
  >;
}
