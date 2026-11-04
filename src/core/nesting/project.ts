import type { CutList } from '../cutlist';
import type { Project } from '../model';
import { guillotineNester, type Nester, type NestResult } from './guillotine';

export interface MaterialNest {
  materialId: string;
  materialName: string;
  result: NestResult;
}

/**
 * Nest every sheet-goods group of a cut list onto its material's sheets, using the project's
 * kerf and edge trim. Grain only constrains a part when both the part and the sheet have it.
 */
export function nestCutList(
  project: Project,
  cutList: CutList,
  nester: Nester = guillotineNester,
): MaterialNest[] {
  const out: MaterialNest[] = [];
  for (const group of cutList.groups) {
    const sheet = project.materials.sheets.find((m) => m.id === group.materialId);
    if (group.kind !== 'sheet' || !sheet) continue;
    const parts = cutList.parts
      .filter(({ part }) => part.materialId === sheet.id)
      .map(({ part, row }) => ({
        id: part.id,
        label: String(row),
        length: part.cut.length,
        width: part.cut.width,
        grain: part.grain && sheet.grain,
      }));
    out.push({
      materialId: sheet.id,
      materialName: sheet.name,
      result: nester.nest(
        parts,
        { length: sheet.length, width: sheet.width },
        {
          kerf: project.shop.kerf,
          trim: project.shop.sheetEdgeTrim,
        },
      ),
    });
  }
  return out;
}
