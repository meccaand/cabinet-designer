import { useMemo } from 'react';
import { estimate, type Estimate } from '../core/costing';
import { buildCutList, type CutList } from '../core/cutlist';
import type { Project } from '../core/model';
import { nestCutList, type MaterialNest } from '../core/nesting';
import { projectModels } from './models';

export interface Outputs {
  cutList: CutList;
  nests: MaterialNest[];
  estimate: Estimate;
}

/** Cut list, sheet layouts and estimate for the open project, recomputed when it changes. */
export function useOutputs(project: Project): Outputs {
  return useMemo(() => {
    const models = projectModels(project);
    const cutList = buildCutList(project, models);
    const nests = nestCutList(project, cutList);
    return { cutList, nests, estimate: estimate(project, cutList, nests, models) };
  }, [project]);
}
