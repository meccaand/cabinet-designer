/**
 * Pure edits to a cabinet's opening tree. Paths address nodes: '' is the root, '1.0' is the
 * first child of the root's second child. Every function returns a new tree.
 */
import type { OpeningFill, OpeningLeaf, OpeningNode, OpeningSplit } from './schema';

export function getNode(root: OpeningNode, path: string): OpeningNode | null {
  let node: OpeningNode = root;
  for (const i of indices(path)) {
    if (node.kind !== 'split') return null;
    const child = node.children[i];
    if (!child) return null;
    node = child.node;
  }
  return node;
}

/** Replace the node at `path` with `fn(node)`. */
export function updateNode(
  root: OpeningNode,
  path: string,
  fn: (node: OpeningNode) => OpeningNode,
): OpeningNode {
  const idx = indices(path);
  const go = (node: OpeningNode, depth: number): OpeningNode => {
    const i = idx[depth];
    if (i === undefined) return fn(node);
    if (node.kind !== 'split' || !node.children[i]) throw new Error(`No opening at ${path}`);
    return {
      ...node,
      children: node.children.map((c, k) => (k === i ? { ...c, node: go(c.node, depth + 1) } : c)),
    };
  };
  return go(root, 0);
}

const SHELVED: readonly OpeningFill[] = ['door', 'doorPair', 'open'];

/** Change what fills a leaf. Drawers and false fronts can't have shelves behind them. */
export function setFill(root: OpeningNode, path: string, fill: OpeningFill): OpeningNode {
  return updateLeaf(root, path, (leaf) => {
    const next: OpeningLeaf = { kind: 'leaf', fill };
    if (fill === 'door') next.hinge = leaf.hinge ?? 'left';
    if (SHELVED.includes(fill) && leaf.shelves) next.shelves = leaf.shelves;
    return next;
  });
}

export function setShelves(
  root: OpeningNode,
  path: string,
  shelves: { count: number; adjustable: boolean },
): OpeningNode {
  return updateLeaf(root, path, (leaf) => {
    if (!SHELVED.includes(leaf.fill)) return leaf;
    if (shelves.count === 0) {
      const { shelves: _removed, ...rest } = leaf;
      void _removed;
      return rest;
    }
    return { ...leaf, shelves };
  });
}

export function setHinge(root: OpeningNode, path: string, hinge: 'left' | 'right'): OpeningNode {
  return updateLeaf(root, path, (leaf) => (leaf.fill === 'door' ? { ...leaf, hinge } : leaf));
}

/**
 * Split an opening into `count` equal ('auto') parts. Splitting a child of a split in the same
 * direction adds siblings instead of nesting, so "split into rows" on a row just adds rows.
 */
export function splitOpening(
  root: OpeningNode,
  path: string,
  dir: OpeningSplit['dir'],
  count = 2,
): OpeningNode {
  const target = getNode(root, path);
  if (!target) throw new Error(`No opening at ${path}`);
  const copy = (): OpeningNode => (target.kind === 'leaf' ? { ...target } : target);
  const parentPath = parentOf(path);
  const parent = parentPath === null ? null : getNode(root, parentPath);
  if (parent?.kind === 'split' && parent.dir === dir && parentPath !== null) {
    const i = lastIndex(path);
    return updateNode(root, parentPath, (p) => {
      const split = p as OpeningSplit;
      const added = Array.from({ length: count - 1 }, () => ({
        size: 'auto' as const,
        node: copy(),
      }));
      const children = [...split.children];
      children.splice(i + 1, 0, ...added);
      return { ...split, children };
    });
  }
  return updateNode(root, path, () => ({
    kind: 'split',
    dir,
    children: Array.from({ length: count }, () => ({ size: 'auto' as const, node: copy() })),
  }));
}

/** Remove an opening. A split left with one child collapses into that child. */
export function removeOpening(root: OpeningNode, path: string): OpeningNode {
  const parentPath = parentOf(path);
  if (parentPath === null) throw new Error('The whole face cannot be removed.');
  const i = lastIndex(path);
  return updateNode(root, parentPath, (p) => {
    const split = p as OpeningSplit;
    const children = split.children.filter((_, k) => k !== i);
    const [only, ...others] = children;
    if (only && others.length === 0) return only.node;
    return { ...split, children };
  });
}

/** Set an opening's size within its parent split ('auto' shares the remainder). */
export function setSize(root: OpeningNode, path: string, size: 'auto' | number): OpeningNode {
  const parentPath = parentOf(path);
  if (parentPath === null) throw new Error('The whole face has no size of its own.');
  const i = lastIndex(path);
  return updateNode(root, parentPath, (p) => {
    const split = p as OpeningSplit;
    return { ...split, children: split.children.map((c, k) => (k === i ? { ...c, size } : c)) };
  });
}

/** Size of an opening within its parent, or null for the root. */
export function sizeOf(root: OpeningNode, path: string): 'auto' | number | null {
  const parentPath = parentOf(path);
  if (parentPath === null) return null;
  const parent = getNode(root, parentPath);
  return parent?.kind === 'split' ? (parent.children[lastIndex(path)]?.size ?? null) : null;
}

/** Turn the top-level divider (vertical panel or fixed shelf between openings) on or off. */
export function setDivider(root: OpeningNode, divider: boolean): OpeningNode {
  if (root.kind !== 'split') return root;
  if (divider) return { ...root, divider: true };
  const { divider: _removed, ...rest } = root;
  void _removed;
  return rest;
}

function updateLeaf(
  root: OpeningNode,
  path: string,
  fn: (l: OpeningLeaf) => OpeningLeaf,
): OpeningNode {
  return updateNode(root, path, (n) => (n.kind === 'leaf' ? fn(n) : n));
}

function indices(path: string): number[] {
  return path === '' ? [] : path.split('.').map(Number);
}

function parentOf(path: string): string | null {
  if (path === '') return null;
  const i = path.lastIndexOf('.');
  return i === -1 ? '' : path.slice(0, i);
}

function lastIndex(path: string): number {
  return Number(path.slice(path.lastIndexOf('.') + 1));
}
