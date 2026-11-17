/**
 * What to buy and roughly what it costs: sheets (from nesting), solid stock in board feet,
 * edge banding by length, and hardware.
 */
import type { MouldingTotal } from '../builtin';
import type { CutList } from '../cutlist';
import type { HardwareKind, Project } from '../model';
import type { MaterialNest } from '../nesting';
import type { CabinetModel, HardwareLine } from '../parts';
import { MM_PER_INCH, type Mm } from '../units';

/** Extra banding per banded edge, for trimming flush (1"). */
export const BANDING_ALLOWANCE: Mm = 25.4;

export interface Estimate {
  sheets: { materialId: string; name: string; count: number; yield: number; cost: number }[];
  solids: { materialId: string; name: string; boardFeet: number; length: Mm; cost: number }[];
  banding: { bandingId: string; name: string; length: Mm; cost: number }[];
  hardware: (HardwareLine & { unitCost: number; cost: number })[];
  /** Crown and base moulding by length (with the board-foot waste allowance), ADR-042. */
  mouldings: {
    kind: 'crownMoulding' | 'baseMoulding';
    itemId: string | null;
    name: string;
    /** To buy: the long-point length plus waste. */
    length: Mm;
    insideMiters: number;
    outsideMiters: number;
    cost: number;
  }[];
  total: number;
}

/** What built-ins add beyond their boxes: run hardware (picture lights) and mouldings. */
export interface EstimateExtras {
  hardware?: readonly HardwareLine[];
  mouldings?: readonly MouldingTotal[];
}

const CUBIC_INCHES_PER_BOARD_FOOT = 144;

export function estimate(
  project: Project,
  cutList: CutList,
  nests: MaterialNest[],
  models: ReadonlyMap<string, CabinetModel | null>,
  extras: EstimateExtras = {},
): Estimate {
  const m = project.materials;

  const sheets = nests.map((n) => {
    const count = n.result.sheets.length;
    const sheet = m.sheets.find((s) => s.id === n.materialId);
    const used = n.result.sheets.reduce((sum, s) => sum + s.yield, 0);
    return {
      materialId: n.materialId,
      name: n.materialName,
      count,
      yield: count ? used / count : 0,
      cost: count * (sheet?.costPerSheet ?? 0),
    };
  });

  const solids = m.solids.flatMap((s) => {
    const parts = cutList.parts
      .filter(({ part }) => part.materialId === s.id)
      .map(({ part }) => part);
    if (parts.length === 0) return [];
    const inches = (v: Mm) => v / MM_PER_INCH;
    const raw = parts.reduce(
      (sum, p) => sum + inches(p.cut.length) * inches(p.cut.width) * inches(s.roughThickness),
      0,
    );
    const boardFeet = (raw / CUBIC_INCHES_PER_BOARD_FOOT) * (1 + project.shop.boardFootWaste);
    return [
      {
        materialId: s.id,
        name: s.name,
        boardFeet,
        length: parts.reduce((sum, p) => sum + p.cut.length, 0),
        cost: boardFeet * s.costPerBoardFoot,
      },
    ];
  });

  const bandLength = new Map<string, Mm>();
  for (const { part } of cutList.parts) {
    const e = part.edges;
    const add = (id: string | null, len: Mm) => {
      if (id) bandLength.set(id, (bandLength.get(id) ?? 0) + len + BANDING_ALLOWANCE);
    };
    add(e.long1, part.finished.length);
    add(e.long2, part.finished.length);
    add(e.end1, part.finished.width);
    add(e.end2, part.finished.width);
  }
  const banding = m.banding.flatMap((b) => {
    const length = bandLength.get(b.id);
    return length
      ? [{ bandingId: b.id, name: b.name, length, cost: (length / 1000) * b.costPerMeter }]
      : [];
  });

  // Hardware across every cabinet, merged by item and (for slides) length.
  const merged = new Map<string, HardwareLine>();
  const lines = [
    ...project.cabinets.flatMap((c) => models.get(c.id)?.hardware ?? []),
    ...(extras.hardware ?? []),
  ];
  for (const line of lines) {
    const key = `${line.kind}|${line.itemId}|${line.length ?? ''}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: prev.qty + line.qty } : { ...line });
  }
  const order: HardwareKind[] = ['hinge', 'slide', 'pull', 'knob', 'shelfPin', 'pictureLight'];
  const hardware = [...merged.values()]
    .sort(
      (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.length ?? 0) - (b.length ?? 0),
    )
    .map((line) => {
      const unitCost = m.hardware.find((h) => h.id === line.itemId)?.unitCost ?? 0;
      return { ...line, unitCost, cost: unitCost * line.qty };
    });

  const mouldings = (extras.mouldings ?? []).map((t) => {
    const kind = t.kind === 'crown' ? ('crownMoulding' as const) : ('baseMoulding' as const);
    const item = m.hardware.find((h) => h.kind === kind);
    const length = t.length * (1 + project.shop.boardFootWaste);
    return {
      kind,
      itemId: item?.id ?? null,
      name: item?.name ?? (kind === 'crownMoulding' ? 'Crown moulding' : 'Base moulding'),
      length,
      insideMiters: t.insideMiters,
      outsideMiters: t.outsideMiters,
      cost: (length / 1000) * (item?.unitCost ?? 0),
    };
  });

  const total = [...sheets, ...solids, ...banding, ...hardware, ...mouldings].reduce(
    (sum, x) => sum + x.cost,
    0,
  );
  return { sheets, solids, banding, hardware, mouldings, total };
}
