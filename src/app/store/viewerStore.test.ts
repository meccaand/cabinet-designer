import { beforeEach, describe, expect, it } from 'vitest';
import { useViewerStore } from './viewerStore';

const initial = useViewerStore.getState();
beforeEach(() => useViewerStore.setState(initial, true));
const s = () => useViewerStore.getState();

describe('viewerStore', () => {
  it('toggles display flags', () => {
    s().toggle('exploded');
    s().toggle('xray');
    s().toggle('dimensions');
    expect([s().exploded, s().xray, s().dimensions]).toEqual([true, true, false]);
  });

  it('bumps the view request even when the view is unchanged', () => {
    s().setView('front');
    s().setView('front');
    expect(s().view).toBe('front');
    expect(s().viewRequest).toBe(2);
  });

  it('hides and shows parts and groups, and shows everything again', () => {
    s().togglePart('a');
    s().togglePart('b');
    s().togglePart('a');
    s().toggleGroup('fronts');
    expect(s().hiddenParts).toEqual({ b: true });
    expect(s().hiddenGroups).toEqual({ fronts: true });
    s().toggleGroup('fronts');
    expect(s().hiddenGroups).toEqual({});
    s().toggleGroup('drawers');
    s().showAll();
    expect([s().hiddenParts, s().hiddenGroups]).toEqual([{}, {}]);
  });

  it('selects cabinets and parts', () => {
    s().select({ kind: 'part', id: 'c/side/L' });
    expect(s().selection).toEqual({ kind: 'part', id: 'c/side/L' });
    s().select(null);
    expect(s().selection).toBeNull();
  });
});
