import type { Estimate } from '../costing';
import type { Project } from '../model';
import { formatLength } from '../units';
import { formatRun } from './text';

export interface ShoppingLine {
  key: string;
  category: 'Sheet goods' | 'Solid stock' | 'Edge banding' | 'Mouldings' | 'Hardware';
  item: string;
  /** For reading: "14 sheets (82% used)". */
  quantity: string;
  /** For spreadsheets: the number to buy, in `unit`. */
  amount: number;
  unit: 'sheets' | 'bd ft' | 'ft' | 'm' | 'each';
  cost: number;
}

/** The estimate as a shopping list: one line per thing to buy. */
export function shoppingList(project: Project, estimate: Estimate): ShoppingLine[] {
  const units = project.units;
  const imperial = units.system === 'imperial';
  const waste = Math.round(project.shop.boardFootWaste * 100);
  return [
    ...estimate.sheets.map((s) => ({
      key: `sheet-${s.materialId}`,
      category: 'Sheet goods' as const,
      item: s.name,
      quantity: `${s.count} sheet${s.count === 1 ? '' : 's'} (${Math.round(s.yield * 100)}% used)`,
      amount: s.count,
      unit: 'sheets' as const,
      cost: s.cost,
    })),
    ...estimate.solids.map((s) => ({
      key: `solid-${s.materialId}`,
      category: 'Solid stock' as const,
      item: s.name,
      quantity: `${s.boardFeet.toFixed(1)} bd ft (incl. ${waste}% waste) · ${formatRun(s.length, units)} of parts`,
      amount: round(s.boardFeet, 2),
      unit: 'bd ft' as const,
      cost: s.cost,
    })),
    ...estimate.banding.map((b) => ({
      key: `banding-${b.bandingId}`,
      category: 'Edge banding' as const,
      item: b.name,
      quantity: formatRun(b.length, units),
      amount: imperial ? round(b.length / 304.8, 1) : round(b.length / 1000, 2),
      unit: imperial ? ('ft' as const) : ('m' as const),
      cost: b.cost,
    })),
    ...estimate.mouldings.map((mo) => {
      const miters = [
        mo.insideMiters
          ? `${mo.insideMiters} inside corner${mo.insideMiters === 1 ? '' : 's'}`
          : '',
        mo.outsideMiters
          ? `${mo.outsideMiters} outside corner${mo.outsideMiters === 1 ? '' : 's'} with return${mo.outsideMiters === 1 ? '' : 's'}`
          : '',
      ].filter(Boolean);
      return {
        key: `moulding-${mo.kind}`,
        category: 'Mouldings' as const,
        item: mo.name,
        quantity: `${formatRun(mo.length, units)} (incl. ${waste}% waste)${miters.length ? ` · ${miters.join(', ')}` : ''}`,
        amount: imperial ? round(mo.length / 304.8, 1) : round(mo.length / 1000, 2),
        unit: imperial ? ('ft' as const) : ('m' as const),
        cost: mo.cost,
      };
    }),
    ...estimate.hardware.map((h) => ({
      key: `hardware-${h.kind}-${h.itemId}-${h.length ?? ''}`,
      category: 'Hardware' as const,
      item: h.length === undefined ? h.name : `${h.name}, ${formatLength(h.length, units)}`,
      quantity: String(h.qty),
      amount: h.qty,
      unit: 'each' as const,
      cost: h.cost,
    })),
  ];
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
