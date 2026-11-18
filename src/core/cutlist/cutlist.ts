/**
 * Cut list: every part in the project, identical parts merged, grouped by material.
 * Parts are "identical" when they have the same name (ignoring left/right), material, cut size,
 * grain, edge banding and notch, so a row can be cut as a batch on the saw.
 */
import { fillerPart } from '../layout';
import type { Project } from '../model';
import type { CabinetModel, Part, PartEdges } from '../parts';
import { quantize, type Mm } from '../units';

export interface CutListRow {
  /** Stable within a cut list; used to label parts on sheet diagrams. */
  number: number;
  name: string;
  /** Where these parts go, e.g. ["Base cabinet 1", "Base cabinet 2"]. */
  cabinets: string[];
  qty: number;
  length: Mm;
  width: Mm;
  thickness: Mm;
  grain: boolean;
  edges: PartEdges;
  notch: Part['notch'] | undefined;
  notes: string[];
  partIds: string[];
}

export interface CutListGroup {
  materialId: string;
  materialName: string;
  kind: 'sheet' | 'solid';
  rows: CutListRow[];
}

export interface CutList {
  groups: CutListGroup[];
  /** Every part, in cut list order, with the row it belongs to. */
  parts: { part: Part; row: number }[];
}

/**
 * Mirror-image parts are cut the same way, so "Left side" and "Right side", or "Door (L)" and
 * "Door (R)", share a row.
 */
export function cutName(name: string): string {
  const plain = name.replace(/^(Left|Right) /, '').replace(/ \((L|R)\)/, '');
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export function buildCutList(
  project: Project,
  models: ReadonlyMap<string, CabinetModel | null>,
  /** Parts that belong to no one cabinet: a built-in run's countertop (ADR-040). */
  assemblies: readonly { id: string; name: string; parts: Part[] }[] = [],
): CutList {
  const owners = new Map<string, string>();
  const all: Part[] = [];
  for (const c of project.cabinets) {
    const model = models.get(c.id);
    if (!model) continue;
    owners.set(c.id, c.name);
    all.push(...model.parts);
  }
  for (const f of project.fillers) {
    const wall = project.room.walls.find((w) => w.id === f.wallId);
    owners.set(f.id, `${f.name ?? 'Filler'}${wall ? ` (${wall.name})` : ''}`);
    all.push(fillerPart(f, project));
  }
  for (const a of assemblies) {
    owners.set(a.id, a.name);
    all.push(...a.parts);
  }

  const materials = [
    ...project.materials.sheets.map((m) => ({ id: m.id, name: m.name, kind: 'sheet' as const })),
    ...project.materials.solids.map((m) => ({ id: m.id, name: m.name, kind: 'solid' as const })),
  ];
  const groups: CutListGroup[] = [];
  const parts: CutList['parts'] = [];
  let number = 1;

  for (const m of materials) {
    const mine = all.filter((p) => p.materialId === m.id);
    if (mine.length === 0) continue;
    const rows = new Map<string, Omit<CutListRow, 'number'> & { members: Part[] }>();
    for (const p of mine) {
      const name = cutName(p.name);
      const key = [
        name,
        quantize(p.cut.length),
        quantize(p.cut.width),
        quantize(p.cut.thickness),
        p.grain,
        p.edges.long1,
        p.edges.long2,
        p.edges.end1,
        p.edges.end2,
        p.notch?.height,
        p.notch?.depth,
        p.notes.join('|'),
      ].join('/');
      const row = rows.get(key);
      const owner = owners.get(p.cabinetId) ?? '';
      if (row) {
        row.qty++;
        row.members.push(p);
        if (!row.cabinets.includes(owner)) row.cabinets.push(owner);
      } else {
        rows.set(key, {
          name,
          cabinets: [owner],
          qty: 1,
          length: p.cut.length,
          width: p.cut.width,
          thickness: p.cut.thickness,
          grain: p.grain,
          edges: p.edges,
          notch: p.notch,
          notes: p.notes,
          partIds: [],
          members: [p],
        });
      }
    }
    const sorted = [...rows.values()].sort(
      (a, b) => b.length - a.length || b.width - a.width || a.name.localeCompare(b.name),
    );
    groups.push({
      materialId: m.id,
      materialName: m.name,
      kind: m.kind,
      rows: sorted.map(({ members, ...row }) => {
        const n = number++;
        for (const p of members) parts.push({ part: p, row: n });
        return { ...row, number: n, partIds: members.map((p) => p.id) };
      }),
    });
  }
  return { groups, parts };
}
