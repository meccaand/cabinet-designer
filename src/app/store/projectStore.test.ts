import { beforeEach, describe, expect, it } from 'vitest';
import { inch } from '../../core/units';
import { projectModels } from '../models';
import { materialInUse, tidyStiles, useProjectStore } from './projectStore';

const initial = useProjectStore.getState();
beforeEach(() => useProjectStore.setState(initial, true));
const s = () => useProjectStore.getState();

describe('projectStore', () => {
  it('starts on the first sample cabinet', () => {
    expect(s().project.cabinets).toHaveLength(4);
    expect(s().activeCabinetId).toBe('sink-base');
  });

  it('edits one cabinet and leaves the others untouched (cached parts stay valid)', () => {
    const [a, b] = s().project.cabinets;
    s().updateCabinet('sink-base', (c) => {
      c.width = inch(33);
    });
    const [a2, b2] = s().project.cabinets;
    expect(a2!.width).toBe(inch(33));
    expect(a2).not.toBe(a);
    expect(b2).toBe(b);
    s().updateCabinet('missing', (c) => {
      c.width = 1;
    });
    expect(s().project.cabinets[0]).toBe(a2);
  });

  it('adds numbered cabinets of a type and makes the new one active', () => {
    const first = s().addCabinet('wall');
    const second = s().addCabinet('wall');
    const added = s().project.cabinets.slice(-2);
    // The sample already has one wall cabinet.
    expect(added.map((c) => c.name)).toEqual(['Wall cabinet 2', 'Wall cabinet 3']);
    expect(added.map((c) => c.id)).toEqual([first, second]);
    expect(s().activeCabinetId).toBe(second);
  });

  it('deletes cabinets and picks a neighbour as active', () => {
    s().setActiveCabinet('shaker-base');
    s().deleteCabinet('shaker-base');
    expect(s().project.cabinets.map((c) => c.id)).toEqual(['sink-base', 'drawer-base', 'upper']);
    expect(s().activeCabinetId).toBe('drawer-base');
    s().deleteCabinet('sink-base'); // not active: active stays
    expect(s().activeCabinetId).toBe('drawer-base');
    s().deleteCabinet('drawer-base');
    expect(s().activeCabinetId).toBe('upper');
    s().deleteCabinet('upper');
    expect(s().activeCabinetId).toBeNull();
  });

  it('switches units without touching stored lengths', () => {
    const before = s().project.cabinets;
    s().setUnits({ system: 'metric', fractionDenom: 16, mmDecimals: 0 });
    expect(s().project.units.system).toBe('metric');
    expect(s().project.cabinets).toBe(before);
  });

  it('places new cabinets after the run at their height on the active wall', () => {
    s().addCabinet('base'); // floor run: 30 + 24 + 18 = 72"
    expect(s().project.cabinets.at(-1)!.placement).toMatchObject({
      wallId: 'wall-1',
      offset: inch(72),
    });
    s().addCabinet('wall'); // upper run: after the 30" wall cabinet
    expect(s().project.cabinets.at(-1)!.placement).toMatchObject({
      offset: inch(30),
      elevation: inch(54),
    });
  });

  it('undoes and redoes edits, clearing redo on a new edit', () => {
    const original = s().project;
    s().moveItem('drawer-base', { offset: inch(60) });
    s().moveItem('drawer-base', { offset: inch(70) });
    s().undo();
    expect(s().project.cabinets[2]!.placement.offset).toBe(inch(60));
    s().undo();
    expect(s().project).toBe(original);
    s().undo(); // nothing left: no-op
    expect(s().project).toBe(original);
    s().redo();
    expect(s().project.cabinets[2]!.placement.offset).toBe(inch(60));
    s().rename('Kitchen');
    expect(s().future).toEqual([]);
    s().redo(); // nothing to redo: no-op
    expect(s().project.name).toBe('Kitchen');
  });

  it('keeps the active cabinet valid across undo of an add', () => {
    const id = s().addCabinet('tall');
    expect(s().activeCabinetId).toBe(id);
    s().undo();
    expect(s().activeCabinetId).toBe('sink-base');
    s().redo();
    expect(s().project.cabinets.some((c) => c.id === id)).toBe(true);
  });

  it('ignores edits that change nothing (no empty undo steps)', () => {
    s().moveItem('missing', { offset: 5 });
    expect(s().past).toEqual([]);
  });

  it('duplicates a cabinet beside the original', () => {
    const id = s().duplicateCabinet('drawer-base')!;
    const copy = s().project.cabinets.find((c) => c.id === id)!;
    expect(copy).toMatchObject({ name: '18" drawer base copy', placement: { offset: inch(72) } });
    expect(s().project.cabinets.indexOf(copy)).toBe(3);
    expect(s().duplicateCabinet('missing')).toBeNull();
  });

  it('puts an L-shaped cabinet in an inside corner, and carries on along its return', () => {
    s().openProject({ ...s().project, room: { walls: [] }, cabinets: [], fillers: [] });
    s().createRoom([inch(120), inch(96)], inch(96));
    const [w1, w2] = s().project.room.walls;
    const l = s().addCabinet('lBase');
    expect(s().project.cabinets.find((c) => c.id === l)!.placement.wallId).toBe(w1!.id);
    // Nudges and moves along the wall don't apply: it stays in the corner.
    const before = s().project;
    s().nudgeItem(l, inch(1));
    s().moveItem(l, { offset: inch(3) });
    expect(s().project).toBe(before);
    const next = s().addCabinet('base');
    expect(s().project.cabinets.find((c) => c.id === next)!.placement).toMatchObject({
      wallId: w2!.id,
      offset: inch(36),
    });
  });

  it('lays out a room as walls joined at inside corners, in one undo step', () => {
    s().openProject({ ...s().project, room: { walls: [] } });
    s().createRoom([inch(120), inch(96)], inch(90));
    expect(s().project.room.walls).toMatchObject([
      { name: 'Wall 1', length: inch(120), height: inch(90), turn: 'right' },
      { name: 'Wall 2', length: inch(96), height: inch(90), turn: 'right' },
    ]);
    s().undo();
    expect(s().project.room.walls).toEqual([]);
  });

  it('adds, edits and removes walls, refusing to remove one in use', () => {
    s().addWall();
    const w2 = s().project.room.walls[1]!;
    expect(w2).toMatchObject({ name: 'Wall 2', turn: 'right', length: inch(96) });
    s().updateWall(w2.id, (w) => void (w.length = inch(60)));
    expect(s().project.room.walls[1]!.length).toBe(inch(60));
    expect(s().removeWall('wall-1')).toBe(false);
    expect(s().removeWall(w2.id)).toBe(true);
    expect(s().removeWall('wall-1')).toBe(false); // the last wall stays
  });

  it('fills a gap with a filler of exactly that width, above the toe kick', () => {
    s().moveItem('drawer-base', { offset: inch(55) }); // 1" gap right of the shaker base
    const id = s().fillGap('shaker-base', 'right')!;
    const f = s().project.fillers.find((x) => x.id === id)!;
    expect(f).toMatchObject({
      wallId: 'wall-1',
      offset: inch(54),
      width: inch(1),
      elevation: inch(4),
    });
    expect(f.height).toBeCloseTo(inch(30.5), 6);
    expect(s().fillGap('shaker-base', 'right')).toBeNull(); // no gap left
    expect(s().fillGap('missing', 'left')).toBeNull();
    s().moveItem(id, { offset: inch(54.5), elevation: inch(5), wallId: 'wall-1' });
    s().updateFiller(id, (x) => void (x.width = inch(0.5)));
    expect(s().project.fillers[0]).toMatchObject({
      offset: inch(54.5),
      elevation: inch(5),
      width: inch(0.5),
    });
    s().deleteFiller(id);
    expect(s().project.fillers).toEqual([]);
  });

  it('fills beside a cabinet with no toe kick from the floor', () => {
    s().moveItem('drawer-base', { offset: inch(55) });
    s().updateCabinet('shaker-base', (c) => void (c.construction.platform = { enabled: false }));
    const id = s().fillGap('shaker-base', 'right')!;
    const f = s().project.fillers.find((x) => x.id === id)!;
    expect(f.elevation).toBe(0);
    expect(f.height).toBeCloseTo(inch(34.5), 6);
  });

  it('opens another project with fresh history', () => {
    s().rename('Changed');
    const other = { ...initial.project, id: 'other', name: 'Other', cabinets: [] };
    s().openProject(other);
    expect(s()).toMatchObject({ project: other, past: [], future: [], activeCabinetId: null });
  });

  it('edits the material library, shop settings and default materials', () => {
    s().updateMaterials((m) => void (m.sheets[0]!.costPerSheet = 99));
    s().updateShop((shop) => void (shop.kerf = 3));
    s().setDefaultMaterial('back', 'ply-12');
    const p = s().project;
    expect([
      p.materials.sheets[0]!.costPerSheet,
      p.shop.kerf,
      p.construction.materials.back,
    ]).toEqual([99, 3, 'ply-12']);
  });

  it('refuses to remove a material that is still used', () => {
    expect(s().removeMaterial('ply-18')).toBe(false); // project default
    s().updateCabinet('sink-base', (c) => void (c.construction.materials = { door: 'pvc-2' }));
    expect(s().removeMaterial('pvc-2')).toBe(false); // a cabinet override
    expect(s().removeMaterial('shelf-pin-5')).toBe(true);
    expect(s().project.materials.hardware.map((h) => h.id)).not.toContain('shelf-pin-5');
  });

  it('nudges along the wall, not past its start; a run of nudges is one undo step', () => {
    const offset = () => s().project.cabinets.find((c) => c.id === 'shaker-base')!.placement.offset;
    const start = offset();
    const history = s().past.length;
    s().nudgeItem('shaker-base', inch(1));
    s().nudgeItem('shaker-base', inch(1));
    s().nudgeItem('shaker-base', inch(-1 / 16));
    expect(offset()).toBeCloseTo(start + inch(2 - 1 / 16), 9);
    expect(s().past).toHaveLength(history + 1);
    s().undo();
    expect(offset()).toBe(start);

    // Another edit in between starts a new step; so does nudging something else.
    s().nudgeItem('shaker-base', inch(1));
    s().rename('Renamed');
    s().nudgeItem('shaker-base', inch(1));
    s().nudgeItem('sink-base', inch(1));
    expect(s().past).toHaveLength(history + 4);

    s().nudgeItem('sink-base', -inch(1000));
    expect(s().project.cabinets.find((c) => c.id === 'sink-base')!.placement.offset).toBe(0);

    const filler = s().fillGap('drawer-base', 'right')!;
    const before = s().project.fillers.find((f) => f.id === filler)!.offset;
    s().nudgeItem(filler, inch(1 / 2));
    expect(s().project.fillers.find((f) => f.id === filler)!.offset).toBeCloseTo(
      before + inch(0.5),
      9,
    );
  });
});

describe('style presets', () => {
  it('adds a style from a template, assigns it, and edits it for every follower at once', () => {
    const id = s().addStyle('traditionalPainted');
    expect(s().project.stylePresets.map((x) => x.name)).toEqual(['Traditional painted built-in']);
    s().addStyle('traditionalPainted');
    expect(s().project.stylePresets[1]!.name).toBe('Traditional painted built-in 2');

    const [a, b] = s().project.cabinets;
    s().setCabinetStyle(a!.id, id);
    s().setCabinetStyle(b!.id, id);
    expect(projectModelsOf(a!.id)?.hardware.some((h) => h.kind === 'knob')).toBe(true);

    s().updateStyle(id, (st) => void (st.construction.hardware = { handle: 'pull' }));
    for (const c of [a!, b!]) {
      expect(projectModelsOf(c.id)?.hardware.some((h) => h.kind === 'knob')).toBe(false);
    }
    s().undo();
    expect(projectModelsOf(a!.id)?.hardware.some((h) => h.kind === 'knob')).toBe(true);
  });

  it('coalesces repeated edits with the same key (a colour picker drag) into one undo step', () => {
    const id = s().addStyle('blank');
    const before = s().past.length;
    for (const color of ['#111111', '#222222', '#333333'])
      s().updateStyle(id, (st) => void (st.finish.color = color), 'color');
    expect(s().past.length).toBe(before + 1);
    expect(s().project.stylePresets[0]!.finish.color).toBe('#333333');
  });

  it("new cabinets follow the active cabinet's style", () => {
    const id = s().addStyle('traditionalPainted');
    s().setCabinetStyle(s().activeCabinetId!, id);
    const added = s().addCabinet('openShelf');
    expect(s().project.cabinets.find((c) => c.id === added)?.styleId).toBe(id);
  });

  it('deleting a style returns its cabinets to the project defaults', () => {
    const id = s().addStyle('traditionalPainted');
    const cab = s().activeCabinetId!;
    s().setCabinetStyle(cab, id);
    s().deleteStyle(id);
    expect(s().project.stylePresets).toEqual([]);
    expect(s().project.cabinets.find((c) => c.id === cab)).not.toHaveProperty('styleId');
    s().setCabinetStyle(cab, null);
    expect(s().project.cabinets.find((c) => c.id === cab)).not.toHaveProperty('styleId');
  });

  it('counts a material used by a style as in use', () => {
    const id = s().addStyle('blank');
    s().updateStyle(id, (st) => void (st.construction.materials = { shelf: 'ply-12' }));
    expect(materialInUse(s().project, 'ply-12')).toBe(true);
  });
});

function projectModelsOf(id: string) {
  return projectModels(s().project).get(id);
}

describe('built-ins', () => {
  const run = () => s().project.builtIns[0]!.runs[0]!;
  const kinds = () => run().modules.map((m) => m.kind);

  it('adds a built-in on a wall, following a face-frame style (added if there is none)', () => {
    const id = s().addBuiltIn('wall-1');
    const b = s().project.builtIns[0]!;
    expect(b.id).toBe(id);
    expect(s().project.stylePresets.find((st) => st.id === b.styleId)?.name).toBe(
      'Traditional painted built-in',
    );
    expect(b.runs).toHaveLength(1);
    expect(run().wallId).toBe('wall-1');
    // A second one reuses the style.
    s().addBuiltIn('wall-1');
    expect(s().project.stylePresets).toHaveLength(1);
    expect(s().addBuiltIn('missing')).toBe('');
  });

  it('puts stiles either side of sections, sharing one between sections', () => {
    s().addBuiltIn('wall-1');
    s().addModule(run().id, 'section');
    expect(kinds()).toEqual(['stile', 'section', 'stile']);
    s().addModule(run().id, 'tower');
    expect(kinds()).toEqual(['stile', 'section', 'stile', 'section', 'stile']);
    s().addModule(run().id, 'pilaster');
    expect(kinds().at(-1)).toBe('pilaster');
    expect(
      run()
        .modules.filter((m) => m.kind === 'section')
        .map((m) => m.kind === 'section' && m.name),
    ).toEqual(['Section 1', 'Tower 2']);
    expect(s().addModule('missing', 'section')).toBeNull();
  });

  it('removing a section tidies the stiles it leaves behind', () => {
    s().addBuiltIn('wall-1');
    s().addModule(run().id, 'section');
    s().addModule(run().id, 'section');
    const first = run().modules[1]!.id;
    s().deleteModule(first);
    expect(kinds()).toEqual(['stile', 'section', 'stile']);
    s().deleteModule(run().modules[1]!.id);
    expect(kinds()).toEqual([]);
  });

  it('tidyStiles drops orphans and merges neighbours', () => {
    const st = (id: string) => ({ kind: 'stile' as const, id, width: 1 });
    const sec = { ...run0Section() };
    expect(tidyStiles([st('a'), st('b'), sec, st('c')]).map((m) => m.id)).toEqual([
      'b',
      'sec',
      'c',
    ]);
    expect(tidyStiles([st('a')])).toEqual([]);
  });

  it('moves modules, edits runs and modules, removes runs and built-ins', () => {
    const id = s().addBuiltIn('wall-1');
    s().addModule(run().id, 'section');
    s().addModule(run().id, 'obstruction');
    const obstruction = run().modules.at(-1)!.id;
    s().moveModule(obstruction, -1);
    expect(kinds()).toEqual(['stile', 'section', 'obstruction', 'stile']);
    s().moveModule(run().modules[0]!.id, -1); // already first: no change
    expect(kinds()[0]).toBe('stile');
    s().updateModule(obstruction, (m) => void (m.kind === 'obstruction' && (m.label = 'Window')));
    expect(run().modules[2]).toMatchObject({ label: 'Window' });
    s().updateRun(run().id, (r) => void (r.countertopHeight = inch(36)));
    expect(run().countertopHeight).toBe(inch(36));
    s().updateBuiltIn(id, (b) => void (b.topGap = inch(12)));
    expect(s().project.builtIns[0]!.topGap).toBe(inch(12));
    const second = s().addRun(id, 'wall-1');
    expect(s().project.builtIns[0]!.runs).toHaveLength(2);
    s().deleteRun(second!);
    expect(s().project.builtIns[0]!.runs).toHaveLength(1);
    expect(s().addRun(id, 'missing')).toBeNull();
    s().deleteBuiltIn(id);
    expect(s().project.builtIns).toEqual([]);
  });

  it('deleting its style sends a built-in back to the project defaults', () => {
    s().addBuiltIn('wall-1');
    const styleId = s().project.builtIns[0]!.styleId!;
    s().deleteStyle(styleId);
    expect(s().project.builtIns[0]!.styleId).toBeNull();
  });
});

function run0Section() {
  return {
    kind: 'section' as const,
    id: 'sec',
    name: 'S',
    width: 'auto' as const,
    base: { groups: [{ doors: 2 as const }], shelves: 1 },
    upper: null,
    endPanels: { left: false, right: false },
  };
}
