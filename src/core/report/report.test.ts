import { describe, expect, it } from 'vitest';
import { modelsOf, sample } from '../__tests__/sampleKitchen';
import { estimate } from '../costing';
import { buildCutList, type CutListRow } from '../cutlist';
import { createProject, type Project } from '../model';
import { nestCutList, type Cut, type SheetLayout } from '../nesting';
import { inch } from '../units';
import {
  bandingText,
  cutListCsv,
  cutStep,
  formatMoney,
  formatRun,
  formatThickness,
  rowNotes,
  shoppingList,
  shoppingListCsv,
  toCsv,
} from './index';

function outputs(p: Project) {
  const models = modelsOf(p);
  const cutList = buildCutList(p, models);
  const nests = nestCutList(p, cutList);
  return { cutList, nests, estimate: estimate(p, cutList, nests, models) };
}

/** Minimal RFC 4180 reader, to check the writer round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  return rows;
}

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks; ends every line with CRLF', () => {
    const text = toCsv([
      ['a', 'b,c', '23 1/4"', 'two\nlines', 3.5],
      ['', 'plain', 'x', 'y', 0],
    ]);
    expect(text).toBe('a,"b,c","23 1/4""","two\nlines",3.5\r\n,plain,x,y,0\r\n');
    expect(parseCsv(text)).toEqual([
      ['a', 'b,c', '23 1/4"', 'two\nlines', '3.5'],
      ['', 'plain', 'x', 'y', '0'],
    ]);
  });

  it('defuses text a spreadsheet would run as a formula, but not numbers', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-x', '@cmd', 'ok', -2]])).toBe(
      "'=SUM(A1),'+1,'-x,'@cmd,ok,-2\r\n",
    );
  });
});

describe('cutListCsv', () => {
  it('has one line per cut list row, sizes as shop text and exact decimals', () => {
    const p = sample();
    const { cutList } = outputs(p);
    const rows = parseCsv(cutListCsv(p, cutList));
    const all = cutList.groups.flatMap((g) => g.rows.map((r) => ({ g, r })));
    expect(rows).toHaveLength(all.length + 1);
    expect(rows[0]).toEqual([
      'Row',
      'Material',
      'Part',
      'Cabinets',
      'Qty',
      'Length',
      'Width',
      'Thickness',
      'Length (in)',
      'Width (in)',
      'Thickness (in)',
      'Grain',
      'Edge banding',
      'Notes',
    ]);
    // Sample kitchen row 1: the four 30 1/2" × 24" sides of the frameless base cabinets.
    expect(rows[1]).toEqual([
      '1',
      '3/4" Plywood',
      'Side',
      'Sink; Drawers',
      '4',
      '30 1/2"',
      '24"',
      '≈23/32"',
      '30.5',
      '24',
      '0.7087',
      'Along length',
      '1 long · Iron-on veneer 0.5 mm',
      '',
    ]);
    for (const [i, { g, r }] of all.entries()) {
      const line = rows[i + 1]!;
      expect(line[0]).toBe(String(r.number));
      expect(line[1]).toBe(g.materialName);
      expect(Number(line[4])).toBe(r.qty);
      expect(Number(line[8])).toBeCloseTo(r.length / 25.4, 4);
      expect(Number(line[9])).toBeCloseTo(r.width / 25.4, 4);
    }
  });

  it('gives decimals in mm for metric projects', () => {
    const p = {
      ...sample(),
      units: { system: 'metric', fractionDenom: 16, mmDecimals: 1 },
    } as const;
    const { cutList } = outputs(p);
    const rows = parseCsv(cutListCsv(p, cutList));
    expect(rows[0]!.slice(8, 11)).toEqual(['Length (mm)', 'Width (mm)', 'Thickness (mm)']);
    expect(rows[1]!.slice(5, 11)).toEqual([
      '774.7 mm',
      '609.6 mm',
      '18.0 mm',
      '774.7',
      '609.6',
      '18',
    ]);
  });
});

describe('shopping list', () => {
  const p = sample();
  const { estimate: e } = outputs(p);

  it('lists every estimate line once, in buying order, with readable quantities', () => {
    const lines = shoppingList(p, e);
    expect(lines.map((l) => [l.category, l.item, l.quantity])).toEqual([
      ['Sheet goods', '3/4" Plywood', '4 sheets (74% used)'],
      ['Sheet goods', '1/2" Plywood', '1 sheet (58% used)'],
      ['Sheet goods', '1/4" Plywood', '2 sheets (57% used)'],
      ['Solid stock', 'Poplar 4/4', '4.4 bd ft (incl. 20% waste) · 23.5 ft of parts'],
      ['Edge banding', 'Iron-on veneer 0.5 mm', '93.5 ft'],
      ['Hardware', 'Concealed hinge, 35 mm cup', '12'],
      ['Hardware', 'Side-mount slide (pair), 22"', '5'],
      ['Hardware', 'Pull', '12'],
      ['Hardware', 'Shelf pin, 5 mm', '16'],
    ]);
    expect(lines.reduce((s, l) => s + l.cost, 0)).toBeCloseTo(e.total, 9);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
  });

  it('measures banding in metres for metric projects', () => {
    const metric = { ...p, units: { ...p.units, system: 'metric' as const } };
    const band = shoppingList(metric, e).find((l) => l.category === 'Edge banding')!;
    expect(band).toMatchObject({ unit: 'm', amount: Math.round(e.banding[0]!.length / 10) / 100 });
  });

  it('exports as CSV with amounts, units and a total that matches the estimate', () => {
    const rows = parseCsv(shoppingListCsv(p, e));
    expect(rows[0]).toEqual(['Category', 'Item', 'Quantity', 'Unit', 'Details', 'Cost (USD)']);
    expect(rows[1]).toEqual([
      'Sheet goods',
      '3/4" Plywood',
      '4',
      'sheets',
      '4 sheets (74% used)',
      '340',
    ]);
    expect(rows[4]).toEqual([
      'Solid stock',
      'Poplar 4/4',
      '4.42',
      'bd ft',
      expect.any(String),
      '22.08',
    ]);
    expect(rows.at(-1)).toEqual(['Total', '', '', '', '', '705.19']);
  });
});

describe('shop text', () => {
  const units = createProject('u', 'U').units;
  const row = (over: Partial<CutListRow>): CutListRow => ({
    number: 1,
    name: 'Side',
    cabinets: [],
    qty: 1,
    length: 0,
    width: 0,
    thickness: 0,
    grain: true,
    edges: { long1: null, long2: null, end1: null, end2: null },
    notch: undefined,
    notes: [],
    partIds: [],
    ...over,
  });

  it('formats thickness at 1/32" in imperial and to the project precision in metric', () => {
    expect(formatThickness(18, units)).toBe('≈23/32"');
    expect(formatThickness(inch(0.75), units)).toBe('3/4"');
    expect(formatThickness(18, { ...units, system: 'metric' })).toBe('18.0 mm');
  });

  it('formats money in dollars and runs in feet or metres', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatRun(3048, units)).toBe('10.0 ft');
    expect(formatRun(3048, { ...units, system: 'metric' })).toBe('3.05 m');
  });

  it('describes banded edges and notes', () => {
    const lib = createProject('u', 'U').materials;
    expect(bandingText(row({}), lib)).toBe('—');
    expect(
      bandingText(
        row({ edges: { long1: 'pvc-2', long2: null, end1: 'pvc-2', end2: 'pvc-2' } }),
        lib,
      ),
    ).toBe('1 long, 2 ends · PVC 2 mm');
    expect(
      bandingText(row({ edges: { long1: null, long2: null, end1: 'gone', end2: null } }), lib),
    ).toBe('1 end · ');
    expect(
      rowNotes(
        row({ notch: { height: inch(4), depth: inch(3) }, notes: ['Drill for pins.'] }),
        units,
      ),
    ).toBe('Notch 4" × 3" at the bottom front for the toe kick. Drill for pins.');
    expect(rowNotes(row({}), units)).toBe('');
  });

  it('says every kind of saw cut in shop language', () => {
    const sheet: SheetLayout = {
      placements: [{ partId: 'p', label: '7', x: 0, y: 0, w: 1, h: 1, rotated: false }],
      cuts: [],
      yield: 0,
      offcut: null,
    };
    const cut = (stage: Cut['stage'], kind: Cut['kind']): Cut => ({
      n: 1,
      kind,
      stage,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      size: inch(23.25),
      partId: stage >= 3 ? 'p' : null,
    });
    expect(
      [cut(0, 'rip'), cut(1, 'rip'), cut(2, 'crosscut'), cut(3, 'rip'), cut(4, 'crosscut')].map(
        (c) => cutStep(c, sheet, units),
      ),
    ).toEqual([
      'Trim 23 1/4" off a factory edge (rip).',
      'Rip a strip 23 1/4" wide off the sheet.',
      'Crosscut a 23 1/4" section off the strip.',
      'Rip part #7 off the section at 23 1/4".',
      'Trim part #7 to 23 1/4" (crosscut).',
    ]);
  });
});
