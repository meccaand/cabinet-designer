import { useMemo } from 'react';
import { generateCabinet, type GenerateResult } from '../core/generate';
import type { Cabinet, Project } from '../core/model';

/** Parts for a cabinet, regenerated only when the cabinet or the project changes. */
export function useCabinetModel(
  cabinet: Cabinet | undefined,
  project: Project,
): GenerateResult | null {
  return useMemo(() => (cabinet ? generateCabinet(cabinet, project) : null), [cabinet, project]);
}
