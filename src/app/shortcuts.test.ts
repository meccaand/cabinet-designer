import { beforeEach, describe, expect, it } from 'vitest';
import { inch } from '../core/units';
import { handleShortcut, isMac, SHORTCUT_GROUPS, type KeyPress } from './shortcuts';
import { useProjectStore } from './store/projectStore';
import { useViewerStore } from './store/viewerStore';

const project0 = useProjectStore.getState();
const viewer0 = useViewerStore.getState();
beforeEach(() => {
  useProjectStore.setState(project0, true);
  useViewerStore.setState(viewer0, true);
});
const p = () => useProjectStore.getState();
const v = () => useViewerStore.getState();

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: null,
  ...mods,
});
const withMod = (key: string, shift = false) =>
  press(key, { [isMac ? 'metaKey' : 'ctrlKey']: true, shiftKey: shift });
const offsetOf = (id: string) => p().project.cabinets.find((c) => c.id === id)!.placement.offset;

describe('keyboard shortcuts', () => {
  it('switch the main view with 1–6', () => {
    expect(['1', '2', '3', '4', '5', '6'].map((k) => (handleShortcut(press(k)), v().main))).toEqual(
      ['3d', 'plan', 'elevation', 'cutlist', 'sheets', 'materials'],
    );
  });

  it('nudge the active cabinet along its wall, only where cabinets are on screen', () => {
    const start = offsetOf('sink-base');
    handleShortcut(press('ArrowRight'));
    expect(offsetOf('sink-base')).toBeCloseTo(start + inch(1 / 16), 9);
    handleShortcut(press('ArrowRight', { shiftKey: true }));
    expect(offsetOf('sink-base')).toBeCloseTo(start + inch(1 + 1 / 16), 9);
    handleShortcut(press('ArrowLeft'));
    expect(offsetOf('sink-base')).toBeCloseTo(start + inch(1), 9);
    // One undo step for the run of nudges.
    p().undo();
    expect(offsetOf('sink-base')).toBe(start);

    v().setMain('cutlist');
    expect(handleShortcut(press('ArrowRight'))).toBe(false); // the table scrolls instead
    expect(offsetOf('sink-base')).toBe(start);
  });

  it('nudge in millimetres in a metric project', () => {
    p().setUnits({ ...p().project.units, system: 'metric' });
    const start = offsetOf('sink-base');
    handleShortcut(press('ArrowRight'));
    handleShortcut(press('ArrowRight', { shiftKey: true }));
    expect(offsetOf('sink-base')).toBeCloseTo(start + 11, 9);
  });

  it('duplicate and delete the active cabinet, or delete the selected filler', () => {
    const count = p().project.cabinets.length;
    handleShortcut(withMod('d'));
    expect(p().project.cabinets).toHaveLength(count + 1);
    expect(p().project.cabinets.find((c) => c.id === p().activeCabinetId)!.name).toMatch(/copy$/);
    handleShortcut(press('Delete'));
    expect(p().project.cabinets).toHaveLength(count);

    const filler = p().fillGap('drawer-base', 'right')!;
    v().select({ kind: 'filler', id: filler });
    handleShortcut(press('Backspace'));
    expect(p().project.fillers).toEqual([]);
    expect(p().project.cabinets).toHaveLength(count);
    expect(v().selection).toBeNull();
  });

  it('undo and redo', () => {
    p().rename('Changed');
    handleShortcut(withMod('z'));
    expect(p().project.name).not.toBe('Changed');
    handleShortcut(withMod('z', true));
    expect(p().project.name).toBe('Changed');
    handleShortcut(withMod('z'));
    handleShortcut(withMod('y'));
    expect(p().project.name).toBe('Changed');
  });

  it('drive the 3D view only while it is showing', () => {
    handleShortcut(press('t'));
    expect(v().view).toBe('top');
    handleShortcut(press('x'));
    handleShortcut(press('e'));
    handleShortcut(press('d'));
    expect([v().xray, v().exploded, v().dimensions]).toEqual([true, true, false]);
    handleShortcut(press('r'));
    expect(v().scope).toBe('room');
    handleShortcut(press('R', { shiftKey: true }));
    expect(v().scope).toBe('cabinet');
    v().setMain('plan');
    expect(handleShortcut(press('f'))).toBe(false);
    expect(v().view).toBe('top');
  });

  it('Esc closes a side panel first, then clears the selection; ? opens the help', () => {
    v().select({ kind: 'cabinet', id: 'sink-base' });
    v().selectOpening('0');
    v().setDrawer('cabinets');
    handleShortcut(press('Escape'));
    expect([v().drawer, v().selection]).toEqual([null, { kind: 'cabinet', id: 'sink-base' }]);
    handleShortcut(press('Escape'));
    expect([v().selection, v().opening]).toEqual([null, null]);
    handleShortcut(press('?', { shiftKey: true }));
    expect(v().help).toBe(true);
  });

  it('leave keys alone while typing or in a dialog, and with other modifiers', () => {
    const field = { closest: (sel: string) => (sel.includes('input') ? {} : null) };
    expect(handleShortcut(press('2', { target: field as unknown as EventTarget }))).toBe(false);
    expect(v().main).toBe('3d');
    expect(handleShortcut(press('2', { altKey: true }))).toBe(false);
    expect(handleShortcut(press('2', { metaKey: true, ctrlKey: true }))).toBe(false);
    expect(handleShortcut(press('q'))).toBe(false);
  });

  it('document every shortcut, and never bind one press to two actions', () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items);
    for (const s of all) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.label).not.toBe('');
    }
    const keys = ['z', 'y', 'd', 'ArrowLeft', 'ArrowRight', 'Delete', 'Escape', '?', '1', 'e', 'r'];
    for (const k of keys) {
      for (const e of [press(k), press(k, { shiftKey: true }), withMod(k), withMod(k, true)]) {
        expect(all.filter((s) => s.match(e)).length, `${k}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
