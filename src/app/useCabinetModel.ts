import { useMemo } from 'react';
import type { GenerateResult } from '../core/generate';
import type { Cabinet, Project } from '../core/model';
import { cabinetResult } from './models';

/** Parts for a cabinet, regenerated only when the cabinet or the project's conventions change. */
export function useCabinetModel(
  cabinet: Cabinet | undefined,
  project: Project,
): GenerateResult | null {
  return useMemo(() => (cabinet ? cabinetResult(cabinet, project) : null), [cabinet, project]);
}
