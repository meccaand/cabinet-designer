/**
 * Keyboard shortcuts (ADR-031): one table drives both the key handling and the help dialog,
 * so the help can't drift from what the keys do.
 */
import { useEffect } from 'react';
import { inch } from '../core/units';
import { useProjectStore } from './store/projectStore';
import { useViewerStore, type MainView } from './store/viewerStore';

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const MOD = isMac ? '⌘' : 'Ctrl+';

/** The fields of a key event the shortcuts read. */
export type KeyPress = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'target'
>;

export interface Shortcut {
  /** Keys as shown in the help; alternatives are separate entries. */
  keys: string[];
  label: string;
  match: (e: KeyPress) => boolean;
  run: (e: KeyPress) => void;
}

const project = () => useProjectStore.getState();
const viewer = () => useViewerStore.getState();

const mod = (e: KeyPress) => (isMac ? e.metaKey : e.ctrlKey) && !e.altKey;
const plain = (e: KeyPress) => !e.metaKey && !e.ctrlKey && !e.altKey;
const key = (e: KeyPress) => e.key.toLowerCase();

/** Editing by keyboard works where cabinets are on screen, not in the shop-output tables. */
const onLayout = () => ['3d', 'plan', 'elevation'].includes(viewer().main);
const in3d = () => viewer().main === '3d';

/** The selected filler, or else the active cabinet. */
function target(): string | null {
  const sel = viewer().selection;
  return sel?.kind === 'filler' ? sel.id : project().activeCabinetId;
}

function nudge(e: KeyPress, direction: 1 | -1) {
  const id = target();
  if (!id) return;
  const metric = project().project.units.system === 'metric';
  const step = e.shiftKey ? (metric ? 10 : inch(1)) : metric ? 1 : inch(1 / 16);
  project().nudgeItem(id, direction * step);
}

const VIEWS: [string, MainView, string][] = [
  ['1', '3d', '3D'],
  ['2', 'plan', 'Plan'],
  ['3', 'elevation', 'Elevation'],
  ['4', 'cutlist', 'Cut list'],
  ['5', 'sheets', 'Sheets'],
  ['6', 'materials', 'Materials & cost'],
];

const CAMERA = [
  ['i', 'iso', 'Iso view'],
  ['f', 'front', 'Front view'],
  ['t', 'top', 'Top view'],
  ['s', 'side', 'Side view'],
] as const;

const TOGGLES = [
  ['e', 'exploded', 'Exploded view'],
  ['x', 'xray', 'X-ray'],
  ['d', 'dimensions', 'Dimensions'],
] as const;

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Project',
    items: [
      {
        keys: [`${MOD}Z`],
        label: 'Undo',
        match: (e) => mod(e) && key(e) === 'z' && !e.shiftKey,
        run: () => project().undo(),
      },
      {
        keys: [`${MOD}⇧Z`, `${MOD}Y`],
        label: 'Redo',
        match: (e) => mod(e) && ((key(e) === 'z' && e.shiftKey) || key(e) === 'y'),
        run: () => project().redo(),
      },
      {
        keys: ['?'],
        label: 'Show these shortcuts',
        match: (e) => plain(e) && e.key === '?',
        run: () => viewer().setHelp(true),
      },
      {
        keys: ['Esc'],
        label: 'Close the side panel, or clear the selection',
        match: (e) => plain(e) && e.key === 'Escape',
        run: () => {
          if (viewer().drawer) return viewer().setDrawer(null);
          viewer().select(null);
          viewer().selectOpening(null);
        },
      },
    ],
  },
  {
    title: 'Views',
    items: VIEWS.map(([k, view, label]) => ({
      keys: [k],
      label,
      match: (e) => plain(e) && e.key === k,
      run: () => viewer().setMain(view),
    })),
  },
  {
    title: 'Cabinets (in 3D, plan and elevation)',
    items: [
      {
        keys: ['←', '→'],
        label: 'Move the cabinet or filler along its wall by 1/16" (1 mm)',
        match: (e) =>
          !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && onLayout() && isArrow(e),
        run: (e) => nudge(e, e.key === 'ArrowRight' ? 1 : -1),
      },
      {
        keys: ['⇧←', '⇧→'],
        label: 'Move it by 1" (10 mm)',
        match: (e) => plain(e) && e.shiftKey && onLayout() && isArrow(e),
        run: (e) => nudge(e, e.key === 'ArrowRight' ? 1 : -1),
      },
      {
        keys: [`${MOD}D`],
        label: 'Duplicate the cabinet',
        match: (e) => mod(e) && key(e) === 'd' && !e.shiftKey && onLayout(),
        run: () => {
          const id = project().activeCabinetId;
          if (id && project().duplicateCabinet(id)) viewer().select(null);
        },
      },
      {
        keys: ['Delete', 'Backspace'],
        label: 'Delete the cabinet or filler (undo brings it back)',
        match: (e) => plain(e) && (e.key === 'Delete' || e.key === 'Backspace') && onLayout(),
        run: () => {
          const sel = viewer().selection;
          const active = project().activeCabinetId;
          if (sel?.kind === 'filler') project().deleteFiller(sel.id);
          else if (active) project().deleteCabinet(active);
          viewer().select(null);
          viewer().selectOpening(null);
        },
      },
    ],
  },
  {
    title: '3D view',
    items: [
      ...CAMERA.map(([k, view, label]) => ({
        keys: [k.toUpperCase()],
        label,
        match: (e: KeyPress) => plain(e) && key(e) === k && in3d(),
        run: () => viewer().setView(view),
      })),
      ...TOGGLES.map(([k, flag, label]) => ({
        keys: [k.toUpperCase()],
        label: `${label} on or off`,
        match: (e: KeyPress) => plain(e) && key(e) === k && in3d(),
        run: () => viewer().toggle(flag),
      })),
      {
        keys: ['R'],
        label: 'Show the whole room or just the cabinet',
        match: (e) => plain(e) && key(e) === 'r' && in3d(),
        run: () => viewer().setScope(viewer().scope === 'room' ? 'cabinet' : 'room'),
      },
    ],
  },
];

const isArrow = (e: KeyPress) => e.key === 'ArrowLeft' || e.key === 'ArrowRight';

/**
 * Run the shortcut for a key press, unless the user is typing or in a dialog (fields and
 * dialogs keep their own keys, including undo). Returns whether a shortcut ran.
 */
export function handleShortcut(e: KeyPress): boolean {
  const el = e.target as Element | null;
  if (el?.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return false;
  const shortcut = SHORTCUT_GROUPS.flatMap((g) => g.items).find((s) => s.match(e));
  if (!shortcut) return false;
  shortcut.run(e);
  return true;
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleShortcut(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
