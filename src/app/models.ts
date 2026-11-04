import { generateCabinet, type GenerateResult } from '../core/generate';
import { layoutItems, type LayoutItem } from '../core/layout';
import type { Cabinet, Project } from '../core/model';
import type { CabinetModel } from '../core/parts';

/**
 * Generated parts per cabinet, cached by object identity. Immer keeps unchanged cabinets (and
 * the project's conventions and materials) as the same objects, so only edited cabinets are
 * regenerated (PLAN.md data flow).
 */
const cache = new WeakMap<
  Cabinet,
  { construction: Project['construction']; materials: Project['materials']; result: GenerateResult }
>();

export function cabinetResult(cabinet: Cabinet, project: Project): GenerateResult {
  const hit = cache.get(cabinet);
  if (hit && hit.construction === project.construction && hit.materials === project.materials) {
    return hit.result;
  }
  const result = generateCabinet(cabinet, project);
  cache.set(cabinet, { construction: project.construction, materials: project.materials, result });
  return result;
}

export function projectModels(project: Project): Map<string, CabinetModel | null> {
  return new Map(
    project.cabinets.map((c) => {
      const r = cabinetResult(c, project);
      return [c.id, r.ok ? r.model : null];
    }),
  );
}

export function projectLayout(project: Project): LayoutItem[] {
  return layoutItems(project, projectModels(project));
}
