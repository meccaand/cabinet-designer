/**
 * Shop-language text shared by every output (screen, PDF, CSV), so a size or a note reads the
 * same wherever it's printed.
 */
import type { CutListRow } from '../cutlist';
import type { MaterialLibrary, UnitSettings } from '../model';
import { formatLength, type Mm } from '../units';

/** Thicknesses read best at 1/32" in imperial (18 mm ply is ≈23/32", not ≈11/16"). */
export function formatThickness(v: Mm, units: UnitSettings): string {
  return formatLength(v, units.system === 'imperial' ? { ...units, fractionDenom: 32 } : units);
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
/** Prices are US dollars; there is no currency setting yet. */
export const formatMoney = (v: number): string => money.format(v);

/** Long lengths for buying: feet in imperial, metres in metric. */
export function formatRun(v: Mm, units: UnitSettings): string {
  return units.system === 'imperial'
    ? `${(v / 304.8).toFixed(1)} ft`
    : `${(v / 1000).toFixed(2)} m`;
}

/** Banded edges in words: "2 long, 1 end · PVC 2 mm", or "—" for none. */
export function bandingText(row: CutListRow, materials: MaterialLibrary): string {
  const e = row.edges;
  const long = [e.long1, e.long2].filter(Boolean).length;
  const ends = [e.end1, e.end2].filter(Boolean).length;
  if (long + ends === 0) return '—';
  const id = e.long1 ?? e.long2 ?? e.end1 ?? e.end2;
  const name = materials.banding.find((b) => b.id === id)?.name ?? '';
  const parts = [long && `${long} long`, ends && `${ends} end${ends > 1 ? 's' : ''}`].filter(
    Boolean,
  );
  return `${parts.join(', ')} · ${name}`;
}

/** The notch (if any) and the part's own notes, as one sentence or more. */
export function rowNotes(row: CutListRow, units: UnitSettings): string {
  const f = (v: Mm) => formatLength(v, units);
  return [
    ...(row.notch
      ? [
          `Notch ${f(row.notch.height)} × ${f(row.notch.depth)} at the bottom front for the toe kick.`,
        ]
      : []),
    ...row.notes,
  ].join(' ');
}

export const grainText = (row: CutListRow): string => (row.grain ? 'Along length' : 'Any');
