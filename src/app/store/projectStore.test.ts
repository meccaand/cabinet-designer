import { beforeEach, describe, expect, it } from 'vitest';
import { inch } from '../../core/units';
import { useProjectStore } from './projectStore';

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
