import { generateCabinet, type GenerateResult } from '../core/generate';
import { layoutItems, type LayoutItem } from '../core/layout';
import { cabinetStyle, type Cabinet, type Project, type StylePreset } from '../core/model';
import type { CabinetModel } from '../core/parts';

/**
 * Generated parts per cabinet, cached by object identity. Immer keeps unchanged cabinets (and
 * the project's conventions, materials and style presets) as the same objects, so only edited
 * cabinets, and cabinets whose style was edited, are regenerated (PLAN.md data flow).
 */
interface CacheEntry {
  construction: Project['construction'];
  materials: Project['materials'];
  style: StylePreset | undefined;
  result: GenerateResult;
}
const cache = new WeakMap<Cabinet, CacheEntry>();

export function cabinetResult(cabinet: Cabinet, project: Project): GenerateResult {
  const hit = cache.get(cabinet);
  const style = cabinetStyle(project, cabinet);
  if (
    hit &&
    hit.construction === project.construction &&
    hit.materials === project.materials &&
    hit.style === style
  ) {
    return hit.result;
  }
  const result = generateCabinet(cabinet, project);
  cache.set(cabinet, {
    construction: project.construction,
    materials: project.materials,
    style,
    result,
  });
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
