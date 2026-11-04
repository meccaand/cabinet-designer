/**
 * Lays the cabinet's opening tree out on the face plane (x, y).
 *
 * Frameless: each child's size is its front's size, and cells are separated by the reveal
 * between fronts. Face frame: sizes are openings, separated by rails and mullions.
 */
import type { OpeningLeaf, OpeningNode } from '../model';
import { quantize, type Mm } from '../units';
import { BuildError } from './context';

export interface Rect {
  x0: Mm;
  x1: Mm;
  y0: Mm;
  y1: Mm;
}

export interface LeafCell {
  leaf: OpeningLeaf;
  /** Position in the tree, e.g. "1.0" = first child of the second child of the root. */
  path: string;
  rect: Rect;
  /** Inside a column split (side by side with something), and whether that split has a divider. */
  columns: { divided: boolean } | null;
}

export interface FaceMember {
  kind: 'rail' | 'mullion';
  path: string;
  rect: Rect;
}

export interface FaceLayout {
  leaves: LeafCell[];
  /** Face-frame rails and mullions between openings (not the outer frame). */
  members: FaceMember[];
  /** Centre x of each divider panel (top-level column splits only). */
  dividers: Mm[];
}

export interface LayoutRules {
  /** Added to every child's size to get its cell (frameless inset: the gap around the front). */
  pad: Mm;
  rowGap: Mm;
  columnGap: (divided: boolean) => Mm;
  /** Face frame: rails and mullions fill the gaps. */
  members: boolean;
}

export function layoutFace(root: OpeningNode, rect: Rect, rules: LayoutRules): FaceLayout {
  const out: FaceLayout = { leaves: [], members: [], dividers: [] };
  visit(root, rect, '', null, rules, out);
  return out;
}

function visit(
  node: OpeningNode,
  rect: Rect,
  path: string,
  columns: LeafCell['columns'],
  rules: LayoutRules,
  out: FaceLayout,
): void {
  if (node.kind === 'leaf') {
    out.leaves.push({ leaf: node, path, rect, columns });
    return;
  }
  const rows = node.dir === 'rows';
  const divided = node.divider === true;
  if (divided && (rows || path !== '')) {
    throw new BuildError('Dividers are only supported between the top-level columns of a cabinet.');
  }
  const total = rows ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
  const gap = rows ? rules.rowGap : rules.columnGap(divided);
  if (divided && gap <= 0)
    throw new BuildError('A divided column split needs room for the divider.');
  const cells = splitExtents(total, node.children, gap, rules.pad, rows ? 'height' : 'width');

  let cursor = rows ? rect.y1 : rect.x0;
  cells.forEach(({ item: child, extent: e }, i) => {
    const childPath = path === '' ? `${i}` : `${path}.${i}`;
    const cell: Rect = rows
      ? { x0: rect.x0, x1: rect.x1, y0: quantize(cursor - e), y1: cursor }
      : { x0: cursor, x1: quantize(cursor + e), y0: rect.y0, y1: rect.y1 };
    visit(child.node, cell, childPath, rows ? columns : { divided }, rules, out);
    cursor = quantize(rows ? cursor - e - gap : cursor + e + gap);

    const last = i === cells.length - 1;
    if (last || gap <= 0) return;
    const between: Rect = rows
      ? { x0: rect.x0, x1: rect.x1, y0: cursor, y1: quantize(cursor + gap) }
      : { x0: quantize(cursor - gap), x1: cursor, y0: rect.y0, y1: rect.y1 };
    if (rules.members)
      out.members.push({ kind: rows ? 'rail' : 'mullion', path: childPath, rect: between });
    if (divided) out.dividers.push(quantize((between.x0 + between.x1) / 2));
  });
}

/** Cell extents along the split axis: fixed sizes as given, 'auto' sharing what's left. */
export function splitExtents<T extends { size: 'auto' | Mm }>(
  total: Mm,
  children: T[],
  gap: Mm,
  pad: Mm,
  dimension: 'width' | 'height',
): { item: T; extent: Mm }[] {
  const fixed = children.reduce((sum, c) => (c.size === 'auto' ? sum : sum + c.size + pad), 0);
  const autoCount = children.filter((c) => c.size === 'auto').length;
  const free = total - fixed - gap * (children.length - 1);
  if (autoCount === 0 && Math.abs(free) > 1e-6) {
    throw new BuildError(
      `Opening ${dimension}s don't add up: ${mm(total - free)} mm specified but ${mm(total)} mm available. Make one of them "auto".`,
    );
  }
  const each = autoCount === 0 ? 0 : free / autoCount;
  if (autoCount > 0 && each - pad <= 0) {
    throw new BuildError(
      `Fixed opening ${dimension}s leave no room for the "auto" ones (${mm(total)} mm available).`,
    );
  }
  return children.map((item) => ({
    item,
    extent: quantize(item.size === 'auto' ? each : item.size + pad),
  }));
}

function mm(v: Mm): string {
  return v.toFixed(1);
}
