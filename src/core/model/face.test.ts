import { describe, expect, it } from 'vitest';
import {
  getNode,
  OpeningNodeSchema,
  removeOpening,
  setDivider,
  setFill,
  setHinge,
  setShelves,
  setSize,
  sizeOf,
  splitOpening,
  updateNode,
  type OpeningNode,
} from './index';

const drawer: OpeningNode = { kind: 'leaf', fill: 'drawer' };
const doors: OpeningNode = {
  kind: 'leaf',
  fill: 'doorPair',
  shelves: { count: 1, adjustable: true },
};
const base: OpeningNode = {
  kind: 'split',
  dir: 'rows',
  children: [
    { size: 152.4, node: drawer },
    { size: 'auto', node: doors },
  ],
};
const valid = (n: OpeningNode) => expect(OpeningNodeSchema.safeParse(n).success).toBe(true);

describe('opening tree edits', () => {
  it('finds nodes by path', () => {
    expect(getNode(base, '')).toBe(base);
    expect(getNode(base, '1')).toBe(doors);
    expect(getNode(base, '2')).toBeNull();
    expect(getNode(base, '0.0')).toBeNull();
  });

  it('changes fills, keeping shelves only where they make sense', () => {
    const asDrawer = setFill(base, '1', 'drawer');
    expect(getNode(asDrawer, '1')).toEqual({ kind: 'leaf', fill: 'drawer' });
    const asDoor = setFill(base, '1', 'door');
    expect(getNode(asDoor, '1')).toEqual({ ...doors, fill: 'door', hinge: 'left' });
    expect(getNode(setFill(base, '0', 'open'), '0')).toEqual({ kind: 'leaf', fill: 'open' });
    expect(base.kind === 'split' && base.children[1]!.node).toBe(doors); // not mutated
    valid(asDrawer);
  });

  it('sets shelves and hinges on the right kinds of opening', () => {
    expect(getNode(setShelves(base, '1', { count: 3, adjustable: false }), '1')).toMatchObject({
      shelves: { count: 3, adjustable: false },
    });
    expect(getNode(setShelves(base, '1', { count: 0, adjustable: true }), '1')).not.toHaveProperty(
      'shelves',
    );
    expect(getNode(setShelves(base, '0', { count: 2, adjustable: true }), '0')).toBe(drawer);
    const door = setFill(base, '1', 'door');
    expect(getNode(setHinge(door, '1', 'right'), '1')).toMatchObject({ hinge: 'right' });
    expect(getNode(setHinge(base, '0', 'right'), '0')).toBe(drawer);
    expect(setShelves(base, '', { count: 1, adjustable: true })).toBe(base); // not a leaf
  });

  it('splits a leaf into a nested split, or adds siblings in the same direction', () => {
    const cols = splitOpening(base, '1', 'columns');
    expect(getNode(cols, '1')).toMatchObject({
      kind: 'split',
      dir: 'columns',
      children: [{ size: 'auto' }, { size: 'auto' }],
    });
    const moreRows = splitOpening(base, '0', 'rows', 3);
    expect(moreRows.kind === 'split' && moreRows.children.map((c) => c.size)).toEqual([
      152.4,
      'auto',
      'auto',
      'auto',
    ]);
    const rootLeaf: OpeningNode = { kind: 'leaf', fill: 'door' };
    expect(splitOpening(rootLeaf, '', 'rows')).toMatchObject({ kind: 'split', children: [{}, {}] });
    expect(splitOpening(cols, '1', 'rows')).toMatchObject({
      children: [{}, {}, { node: { kind: 'split' } }],
    });
    valid(cols);
    valid(moreRows);
  });

  it('removes openings and collapses single-child splits', () => {
    expect(removeOpening(base, '0')).toBe(doors);
    const three = splitOpening(base, '0', 'rows');
    expect(removeOpening(three, '1')).toEqual(base);
    expect(() => removeOpening(base, '')).toThrow('cannot be removed');
  });

  it('sets and reads sizes', () => {
    const fixed = setSize(base, '1', 600);
    expect(sizeOf(fixed, '1')).toBe(600);
    expect(sizeOf(base, '0')).toBe(152.4);
    expect(sizeOf(base, '')).toBeNull();
    expect(sizeOf(base, '0.1')).toBeNull();
    expect(() => setSize(base, '', 3)).toThrow('no size');
  });

  it('toggles the top-level divider', () => {
    const on = setDivider(base, true);
    expect(on).toMatchObject({ divider: true });
    expect(setDivider(on, false)).toEqual(base);
    expect(setDivider(drawer, true)).toBe(drawer);
  });

  it('rejects bad paths', () => {
    expect(() => updateNode(base, '5', (n) => n)).toThrow('No opening at 5');
    expect(() => updateNode(base, '0.1', (n) => n)).toThrow('No opening');
    expect(() => splitOpening(base, '7', 'rows')).toThrow('No opening');
  });
});
