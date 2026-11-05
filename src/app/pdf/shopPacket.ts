/**
 * The shop packet (ADR-028): everything needed at the bench in one PDF. A cover with the
 * summary and contents, wall and cabinet elevations, the cut list, one page per sheet with its
 * numbered cuts, and the shopping list. Built from the same derived outputs and drawings as
 * the screen.
 */
import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import type { Estimate } from '../../core/costing';
import type { CutList } from '../../core/cutlist';
import { frontElevation, sheetDrawing, wallElevation } from '../../core/drawing';
import { CABINET_TYPE_NAMES } from '../../core/generate';
import { resolveConstruction, type Cabinet, type Project } from '../../core/model';
import type { MaterialNest } from '../../core/nesting';
import type { CabinetModel } from '../../core/parts';
import {
  bandingText,
  cutStep,
  formatMoney,
  formatThickness,
  grainText,
  rowNotes,
  shoppingList,
} from '../../core/report';
import { formatLength } from '../../core/units';
import { fileBase } from '../download';
import { drawDrawing, pdfText } from './drawing';

export interface PacketInput {
  project: Project;
  models: ReadonlyMap<string, CabinetModel | null>;
  cutList: CutList;
  nests: MaterialNest[];
  estimate: Estimate;
  /** Printed on every page. */
  date: Date;
}

const M = 36; // page margin, pt (½")
const FOOTER = 24;
const ACCENT = '#b5651d';
const TABLE = {
  theme: 'grid' as const,
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: '#dedad2', lineWidth: 0.5 },
  headStyles: { fillColor: '#efe9df', textColor: '#22201c', fontStyle: 'bold' as const },
  margin: { left: M, right: M, top: M, bottom: M + FOOTER },
};

/** Where autotable's last table ended. */
const tableEnd = (doc: jsPDF): number =>
  (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export function shopPacket(input: PacketInput): jsPDF {
  const { project, models, cutList, nests, estimate, date } = input;
  const units = project.units;
  const f = (v: number) => formatLength(v, units);
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    // Letter for inch projects, A4 for metric ones.
    format: units.system === 'imperial' ? 'letter' : 'a4',
    compress: true,
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const bottom = H - M - FOOTER;
  const contents: [string, number][] = [];
  const t = pdfText;

  const heading = (text: string, y = M + 14) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor('#22201c');
    doc.text(t(text), M, y);
    doc.setFont('helvetica', 'normal');
  };
  const small = (text: string, x: number, y: number, maxWidth = W - 2 * M) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#6d675d');
    const lines: string[] = doc.splitTextToSize(t(text), maxWidth);
    doc.text(lines, x, y);
    doc.setTextColor('#000000');
    return y + lines.length * 11;
  };
  const section = (title: string) => {
    doc.addPage();
    contents.push([title, doc.getNumberOfPages()]);
  };

  // ---- Cover -------------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(t(project.name), M, M + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(ACCENT);
  doc.text(`Shop packet · ${date.toLocaleDateString('en-US', { dateStyle: 'long' })}`, M, M + 50);
  doc.setTextColor('#000000');

  const partCount = cutList.parts.length;
  const rowCount = cutList.groups.reduce((n, g) => n + g.rows.length, 0);
  const built = project.cabinets.filter((c) => models.get(c.id));
  const summary: [string, string][] = [
    [
      'Cabinets',
      `${built.length}${project.fillers.length ? ` + ${project.fillers.length} filler${project.fillers.length > 1 ? 's' : ''}` : ''}`,
    ],
    ['Parts', `${partCount} (${rowCount} cut list rows)`],
    ...estimate.sheets.map((s): [string, string] => [
      s.name,
      `${s.count} sheet${s.count === 1 ? '' : 's'}`,
    ]),
    ...estimate.solids.map((s): [string, string] => [s.name, `${s.boardFeet.toFixed(1)} bd ft`]),
    ['Estimated cost', formatMoney(estimate.total)],
    [
      'Units',
      units.system === 'imperial'
        ? `Inches, to the nearest 1/${units.fractionDenom}"`
        : `Millimetres`,
    ],
    ['Saw kerf', f(project.shop.kerf)],
    ['Factory edge trim', f(project.shop.sheetEdgeTrim)],
  ];
  autoTable(doc, {
    ...TABLE,
    theme: 'plain',
    startY: M + 70,
    tableWidth: 300,
    body: summary.map(([k, v]) => [t(k), t(v)]),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } },
    styles: { ...TABLE.styles, fontSize: 10 },
  });
  const notesY = tableEnd(doc) + 20;
  small(
    'Sizes in the cut list are cut sizes: banding marked "subtract" is already taken off. Length ' +
      'runs with the grain. Drawings show finished sizes. A size starting with ~ is rounded to ' +
      'the precision above; the CSV export has the exact decimals.',
    M,
    notesY,
    320,
  );
  if (cutList.parts.length === 0) small('This project has no parts yet.', M, notesY + 50);
  const contentsX = W / 2 + 20;
  const contentsPage = doc.getNumberOfPages();

  // ---- Wall elevations ---------------------------------------------------------------------
  const walls = project.room.walls.filter(
    (w) =>
      project.cabinets.some((c) => c.placement.wallId === w.id && models.get(c.id)) ||
      project.fillers.some((fl) => fl.wallId === w.id),
  );
  walls.forEach((wall, i) => {
    doc.addPage();
    if (i === 0) contents.push(['Wall elevations', doc.getNumberOfPages()]);
    heading(`${wall.name} elevation`);
    small(`${f(wall.length)} long × ${f(wall.height)} high`, M, M + 30);
    drawDrawing(doc, wallElevation(project, wall.id, models), {
      x: M,
      y: M + 44,
      w: W - 2 * M,
      h: bottom - M - 44,
    });
  });

  // ---- Cabinets, two to a page -------------------------------------------------------------
  project.cabinets.forEach((c, i) => {
    const col = i % 2;
    if (col === 0) {
      doc.addPage();
      if (i === 0) contents.push(['Cabinets', doc.getNumberOfPages()]);
    }
    const x = M + col * ((W - 2 * M) / 2 + 10);
    const colW = (W - 2 * M) / 2 - 10;
    cabinetBlock(doc, project, c, models.get(c.id) ?? null, { x, y: M, w: colW, h: bottom - M });
  });

  // ---- Cut list ----------------------------------------------------------------------------
  if (cutList.groups.length) {
    section('Cut list');
    heading('Cut list');
    let y = M + 30;
    for (const g of cutList.groups) {
      const count = g.rows.reduce((n, r) => n + r.qty, 0);
      if (y > bottom - 60) {
        doc.addPage();
        y = M + 10;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(t(`${g.materialName}  ·  ${count} parts`), M, y + 8);
      autoTable(doc, {
        ...TABLE,
        startY: y + 14,
        head: [
          [
            '#',
            'Part',
            'Cabinet',
            'Qty',
            'Length',
            'Width',
            'Thick',
            'Grain',
            'Edge banding',
            'Notes',
          ],
        ],
        body: g.rows.map((r): RowInput =>
          [
            String(r.number),
            r.name,
            r.cabinets.join(', '),
            String(r.qty),
            f(r.length),
            f(r.width),
            formatThickness(r.thickness, units),
            grainText(r),
            bandingText(r, project.materials),
            rowNotes(r, units),
          ].map(t),
        ),
        rowPageBreak: 'avoid',
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 90 },
          3: { halign: 'right', cellWidth: 28 },
          4: { halign: 'right', cellWidth: 52 },
          5: { halign: 'right', cellWidth: 52 },
          6: { halign: 'right', cellWidth: 40 },
          7: { cellWidth: 58 },
          8: { cellWidth: 120 },
        },
      });
      y = tableEnd(doc) + 18;
    }
  }

  // ---- Sheets, one per page ----------------------------------------------------------------
  nests.forEach((n, ni) => {
    const { sheets, sheet, unplaced } = n.result;
    sheets.forEach((s, i) => {
      doc.addPage();
      if (ni === 0 && i === 0) contents.push(['Sheet layouts', doc.getNumberOfPages()]);
      heading(`${n.materialName}: sheet ${i + 1} of ${sheets.length}`);
      let y = small(
        `${f(sheet.width)} × ${f(sheet.length)} · ${Math.round(s.yield * 100)}% used` +
          (s.offcut
            ? ` · offcut ${f(Math.min(s.offcut.w, s.offcut.h))} × ${f(Math.max(s.offcut.w, s.offcut.h))}`
            : '') +
          ' · numbers on parts are cut list rows, red numbers are the cut order',
        M,
        M + 30,
      );
      if (i === 0 && unplaced.length) {
        doc.setTextColor('#b03a2e');
        y = small(
          `Too big for this sheet, not laid out: ${unplaced.map((u) => `#${u.label} (${f(u.length)} × ${f(u.width)})`).join(', ')}`,
          M,
          y + 2,
        );
      }
      const drawW = (W - 2 * M) * 0.64;
      // Top-aligned: as tall as the sheet's proportions need, at most the rest of the page.
      drawDrawing(doc, sheetDrawing(s, sheet, project.shop.sheetEdgeTrim), {
        x: M,
        y: y + 6,
        w: drawW,
        h: Math.min(bottom - y - 6, (drawW * sheet.width) / sheet.length),
      });
      autoTable(doc, {
        ...TABLE,
        theme: 'plain',
        startY: y + 6,
        margin: { ...TABLE.margin, left: M + drawW + 16 },
        head: [['', 'Cut']],
        body: s.cuts.length
          ? s.cuts.map((c) => [String(c.n), t(cutStep(c, s, units))])
          : [['', 'No cuts: the part is the whole sheet.']],
        columnStyles: { 0: { cellWidth: 18, textColor: '#b03a2e', fontStyle: 'bold' } },
        styles: { ...TABLE.styles, cellPadding: 1.5 },
      });
    });
  });

  // ---- Shopping list -----------------------------------------------------------------------
  section('Shopping list');
  heading('Shopping list & estimate');
  autoTable(doc, {
    ...TABLE,
    startY: M + 30,
    head: [['Item', 'Category', 'Quantity', 'Cost']],
    body: shoppingList(project, estimate).map((l) => [
      t(l.item),
      l.category,
      t(l.quantity),
      formatMoney(l.cost),
    ]),
    foot: [
      ['Total', '', '', { content: formatMoney(estimate.total), styles: { halign: 'right' } }],
    ],
    footStyles: { fillColor: '#efe9df', textColor: '#22201c', fontStyle: 'bold' },
    showFoot: 'lastPage',
    columnStyles: { 3: { halign: 'right' } },
  });
  small(
    'Prices are from the material library, in US dollars. Sheets are whole sheets from the ' +
      'layouts; banding includes 1" per edge for trimming; solid stock includes the waste factor.',
    M,
    tableEnd(doc) + 16,
  );

  // ---- Contents and footers ----------------------------------------------------------------
  doc.setPage(contentsPage);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Contents', contentsX, M + 82);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  contents.forEach(([title, page], i) => {
    const y = M + 102 + i * 16;
    doc.text(title, contentsX, y);
    doc.text(String(page), W - M, y, { align: 'right' });
  });

  const pages = doc.getNumberOfPages();
  const stamp = `${t(project.name)} · shop packet · ${date.toLocaleDateString('en-US')}`;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#6d675d');
    doc.text(stamp, M, H - M + 6);
    doc.text(`Page ${p} of ${pages}`, W - M, H - M + 6, { align: 'right' });
  }
  return doc;
}

/** One cabinet in a column: name, type and size, construction, and its front elevation. */
function cabinetBlock(
  doc: jsPDF,
  project: Project,
  c: Cabinet,
  model: CabinetModel | null,
  box: { x: number; y: number; w: number; h: number },
): void {
  const units = project.units;
  const f = (v: number) => formatLength(v, units);
  const k = resolveConstruction(project.construction, c.construction);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor('#22201c');
  doc.text(pdfText(c.name), box.x, box.y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#6d675d');
  const lines = [
    `${CABINET_TYPE_NAMES[c.type]} · ${f(c.width)} W × ${f(c.height)} H × ${f(c.depth)} D`,
    [
      k.carcass.style === 'frameless' ? 'Frameless' : 'Face frame',
      `${JOINERY[k.carcass.joinery]} joints`,
      BACK[k.carcass.back],
      `${k.fronts.style} fronts`,
    ].join(' · '),
    model ? `${model.parts.length} parts` : '',
  ].filter(Boolean);
  doc.text(lines.map(pdfText), box.x, box.y + 30);
  doc.setTextColor('#000000');
  const top = box.y + 30 + lines.length * 11 + 6;
  if (model) {
    drawDrawing(doc, frontElevation(c, model, units), {
      x: box.x,
      y: top,
      w: box.w,
      h: box.y + box.h - top,
    });
  } else {
    doc.setTextColor('#b03a2e');
    doc.text("This cabinet can't be built as specified; fix it in the app.", box.x, top + 12);
    doc.setTextColor('#000000');
  }
}

const JOINERY = { dado: 'Dado', rabbet: 'Rabbet', butt: 'Butt', pocket: 'Pocket-screw' } as const;
const BACK = { inset: 'inset back', applied: 'applied back', dado: 'back in a groove' } as const;

/** "Sample kitchen" → "Sample kitchen shop packet.pdf". */
export const packetFileName = (project: Project): string => `${fileBase(project)} shop packet.pdf`;
