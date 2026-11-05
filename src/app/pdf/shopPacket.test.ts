import type { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { estimate } from '../../core/costing';
import { buildCutList } from '../../core/cutlist';
import { createCabinet } from '../../core/generate';
import { createProject, type Project } from '../../core/model';
import { nestCutList } from '../../core/nesting';
import { formatLength, inch } from '../../core/units';
import { projectModels } from '../models';
import { createSampleProject } from '../sample';
import { fitDrawing, pdfText } from './drawing';
import { packetFileName, shopPacket } from './shopPacket';

function packet(project: Project) {
  const models = projectModels(project);
  const cutList = buildCutList(project, models);
  const nests = nestCutList(project, cutList);
  const doc = shopPacket({
    project,
    models,
    cutList,
    nests,
    estimate: estimate(project, cutList, nests, models),
    date: new Date(2026, 10, 5),
  });
  return { doc, cutList, nests };
}

/** The text drawn on a page, one string per text operator, read from its content stream. */
function pageText(doc: jsPDF, page: number): string[] {
  const ops = (doc.internal.pages as unknown as string[][])[page]!.join('\n');
  return [...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
    m[1]!.replace(/\\([0-7]{3}|.)/g, (_, c: string) =>
      c.length === 3 ? String.fromCharCode(parseInt(c, 8)) : c,
    ),
  );
}

const pages = (doc: jsPDF) =>
  Array.from({ length: doc.getNumberOfPages() }, (_, i) => pageText(doc, i + 1));

describe('shop packet', () => {
  const project = createSampleProject();
  const { doc, cutList, nests } = packet(project);
  const all = pages(doc);
  const contents = new Map<string, number>();
  {
    const cover = all[0]!;
    const at = cover.indexOf('Contents');
    for (let i = at + 1; /^\d+$/.test(cover[i + 1] ?? ''); i += 2) {
      contents.set(cover[i]!, Number(cover[i + 1]));
    }
  }

  it('is landscape Letter for an inch project, with a numbered footer on every page', () => {
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(792, 3);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(612, 3);
    all.forEach((text, i) => {
      expect(text).toContain(`Page ${i + 1} of ${all.length}`);
      expect(text).toContain('Sample kitchen · shop packet · 11/5/2026');
    });
  });

  it('lists its sections with the pages they start on', () => {
    expect([...contents.keys()]).toEqual([
      'Wall elevations',
      'Cabinets',
      'Cut list',
      'Sheet layouts',
      'Shopping list',
    ]);
    expect(all[contents.get('Wall elevations')! - 1]).toContain('Wall 1 elevation');
    expect(all[contents.get('Cabinets')! - 1]).toContain(project.cabinets[0]!.name);
    expect(all[contents.get('Cut list')! - 1]).toContain('Cut list');
    expect(all[contents.get('Shopping list')! - 1]).toContain('Shopping list & estimate');
    expect(all[contents.get('Shopping list')! - 1]).toContain('$705.19');
  });

  it('prints every cabinet with its elevation dimensions', () => {
    const cabinetPages = all.slice(contents.get('Cabinets')! - 1, contents.get('Cut list')! - 1);
    expect(cabinetPages).toHaveLength(Math.ceil(project.cabinets.length / 2));
    const text = cabinetPages.flat();
    for (const c of project.cabinets) {
      expect(text).toContain(c.name);
      expect(text).toContain(pdfText(formatLength(c.height, project.units)));
    }
  });

  it('prints every cut list row with its sizes, and no character the PDF fonts lack', () => {
    const text = all
      .slice(contents.get('Cut list')! - 1, contents.get('Sheet layouts')! - 1)
      .flat();
    const f = (v: number) => pdfText(formatLength(v, project.units));
    for (const r of cutList.groups.flatMap((g) => g.rows)) {
      const at = text.findIndex((s, i) => s === String(r.number) && text[i + 1] === r.name);
      expect(at, `row ${r.number}`).toBeGreaterThan(-1);
      // Row cells follow the number in order (long cells may wrap onto more lines).
      const row = text.slice(at, at + 20);
      expect(row).toEqual(expect.arrayContaining([r.name, String(r.qty), f(r.length), f(r.width)]));
    }
    expect(all.flat().some((s) => s.includes('≈'))).toBe(false);
    expect(text).toContain('~23/32"');
  });

  it('gives each sheet its own page with every numbered cut', () => {
    const start = contents.get('Sheet layouts')! - 1;
    const sheets = nests.flatMap((n) => n.result.sheets.map((s, i) => ({ n, s, i })));
    sheets.forEach(({ n, s, i }, k) => {
      const text = all[start + k]!;
      expect(text).toContain(`${n.materialName}: sheet ${i + 1} of ${n.result.sheets.length}`);
      for (const c of s.cuts) expect(text).toContain(String(c.n));
      // Every placed part is labelled with its cut list row.
      for (const p of s.placements) expect(text).toContain(`#${p.label}`);
    });
    expect(contents.get('Shopping list')).toBe(start + sheets.length + 1);
  });

  it('uses A4 for metric projects and handles an empty project', () => {
    const empty = createProject('e', 'Empty');
    empty.units = { ...empty.units, system: 'metric' };
    const { doc } = packet(empty);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(841.89, 1);
    const text = pages(doc);
    expect(text).toHaveLength(2); // cover and shopping list
    expect(text[0]).toContain('This project has no parts yet.');
  });

  it("explains a cabinet that can't be built instead of drawing it", () => {
    const p = createProject('b', 'Broken');
    p.cabinets = [{ ...createCabinet(p, 'base', { id: 'x', name: 'Too narrow' }), width: inch(1) }];
    const text = pages(packet(p).doc).flat();
    expect(text).toContain('Too narrow');
    expect(text).toContain("This cabinet can't be built as specified; fix it in the app.");
  });

  it('names the file after the project', () => {
    expect(packetFileName(project)).toBe('Sample kitchen shop packet.pdf');
    expect(packetFileName({ ...project, name: '???' })).toBe('project shop packet.pdf');
  });
});

describe('pdf drawing helpers', () => {
  it('fits a y-up drawing into a y-down box, centred, keeping proportions', () => {
    const t = fitDrawing({ x0: 0, y0: 0, x1: 200, y1: 100 }, { x: 10, y: 20, w: 100, h: 100 });
    expect(t.scale).toBe(0.5);
    expect([t.x(0), t.y(100)]).toEqual([10, 45]); // top-left
    expect([t.x(200), t.y(0)]).toEqual([110, 95]); // bottom-right
  });

  it('swaps characters the standard PDF fonts lack', () => {
    expect(pdfText('≈23 1/16" × 4" · ½ — ok')).toBe('~23 1/16" × 4" · ½ — ok');
    expect(pdfText('✓ done')).toBe('? done');
  });
});
