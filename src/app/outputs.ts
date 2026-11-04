import { useMemo } from 'react';
import { estimate, type Estimate } from '../core/costing';
import { buildCutList, type CutList } from '../core/cutlist';
import type { Project, UnitSettings } from '../core/model';
import { nestCutList, type MaterialNest } from '../core/nesting';
import { formatLength, type Mm } from '../core/units';
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

/** Thicknesses read best at 1/32" in imperial (18 mm ply is ≈23/32", not ≈11/16"). */
export function formatThickness(v: Mm, units: UnitSettings): string {
  return formatLength(v, units.system === 'imperial' ? { ...units, fractionDenom: 32 } : units);
}

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const formatMoney = (v: number) => money.format(v);

/** Long lengths for buying: feet in imperial, metres in metric. */
export function formatRun(v: Mm, units: UnitSettings): string {
  return units.system === 'imperial'
    ? `${(v / 304.8).toFixed(1)} ft`
    : `${(v / 1000).toFixed(2)} m`;
}
