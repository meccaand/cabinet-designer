import { beforeEach, describe, expect, it } from 'vitest';
import { inch } from '../../core/units';
import { useProjectStore } from './projectStore';

const initial = useProjectStore.getState();
beforeEach(() => useProjectStore.setState(initial, true));
const s = () => useProjectStore.getState();

describe('projectStore', () => {
  it('starts on the first sample cabinet', () => {
    expect(s().project.cabinets).toHaveLength(3);
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
    expect(added.map((c) => c.name)).toEqual(['Wall cabinet 1', 'Wall cabinet 2']);
    expect(added.map((c) => c.id)).toEqual([first, second]);
    expect(s().activeCabinetId).toBe(second);
  });

  it('deletes cabinets and picks a neighbour as active', () => {
    s().setActiveCabinet('shaker-base');
    s().deleteCabinet('shaker-base');
    expect(s().project.cabinets.map((c) => c.id)).toEqual(['sink-base', 'drawer-base']);
    expect(s().activeCabinetId).toBe('drawer-base');
    s().deleteCabinet('sink-base'); // not active: active stays
    expect(s().activeCabinetId).toBe('drawer-base');
    s().deleteCabinet('drawer-base');
    expect(s().activeCabinetId).toBeNull();
  });

  it('switches units without touching stored lengths', () => {
    const before = s().project.cabinets;
    s().setUnits({ system: 'metric', fractionDenom: 16, mmDecimals: 0 });
    expect(s().project.units.system).toBe('metric');
    expect(s().project.cabinets).toBe(before);
  });
});
