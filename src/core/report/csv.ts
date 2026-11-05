/**
 * CSV exports (ADR-030): RFC 4180 text with CRLF line ends. Sizes come twice: as shop text
 * ("23 1/4\"") for reading, and as plain decimals for spreadsheets and other cut optimizers.
 */
import type { Estimate } from '../costing';
import type { CutList } from '../cutlist';
import type { Project } from '../model';
import { formatLength, MM_PER_INCH, type Mm } from '../units';
import { shoppingList } from './shopping';
import { bandingText, formatThickness, grainText, rowNotes } from './text';

type Cell = string | number;

/**
 * Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start) is
 * prefixed with an apostrophe: cabinet and material names are typed by the user.
 */
function cell(v: Cell): string {
  if (typeof v === 'number') return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Every cut list row, with sizes as shop text and as decimals in the project's units. */
export function cutListCsv(project: Project, cutList: CutList): string {
  const units = project.units;
  const imperial = units.system === 'imperial';
  const u = imperial ? 'in' : 'mm';
  const decimal = (v: Mm) => (imperial ? round(v / MM_PER_INCH, 4) : round(v, 2));
  const f = (v: Mm) => formatLength(v, units);
  const rows: Cell[][] = [
    [
      'Row',
      'Material',
      'Part',
      'Cabinets',
      'Qty',
      'Length',
      'Width',
      'Thickness',
      `Length (${u})`,
      `Width (${u})`,
      `Thickness (${u})`,
      'Grain',
      'Edge banding',
      'Notes',
    ],
  ];
  for (const g of cutList.groups) {
    for (const r of g.rows) {
      rows.push([
        r.number,
        g.materialName,
        r.name,
        r.cabinets.join('; '),
        r.qty,
        f(r.length),
        f(r.width),
        formatThickness(r.thickness, units),
        decimal(r.length),
        decimal(r.width),
        decimal(r.thickness),
        grainText(r),
        bandingText(r, project.materials),
        rowNotes(r, units),
      ]);
    }
  }
  return toCsv(rows);
}

/** What to buy: category, item, amount and unit, cost in USD, and the total. */
export function shoppingListCsv(project: Project, estimate: Estimate): string {
  return toCsv([
    ['Category', 'Item', 'Quantity', 'Unit', 'Details', 'Cost (USD)'],
    ...shoppingList(project, estimate).map((l) => [
      l.category,
      l.item,
      l.amount,
      l.unit,
      l.quantity,
      round(l.cost, 2),
    ]),
    ['Total', '', '', '', '', round(estimate.total, 2)],
  ]);
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
