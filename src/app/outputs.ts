import { useDeferredValue, useMemo } from 'react';
import { estimate, type Estimate } from '../core/costing';
import { buildCutList, type CutList } from '../core/cutlist';
import { mouldingTotals, type ExpandedProject } from '../core/builtin';
import type { Project } from '../core/model';
import {
  guillotineNester,
  nestCutList,
  type MaterialNest,
  type Nester,
  type NestResult,
} from '../core/nesting';
import { expand } from './expand';
import { projectModels } from './models';

export interface Outputs {
  /** The project these outputs were derived from (may trail the open one by a render). */
  project: Project;
  /** It as built: with its built-ins' boxes and run parts (ADR-040). */
  built: ExpandedProject;
  cutList: CutList;
  nests: MaterialNest[];
  estimate: Estimate;
}

/**
 * Nesting is the one slow step (≈100 ms for a 60-cabinet kitchen), and most edits (moving a
 * cabinet, renaming, prices) leave a material's parts unchanged. Results are cached by their
 * exact inputs (ADR-033), so those edits never re-nest.
 */
export function cachingNester(nester: Nester, size: number): Nester {
  const cache = new Map<string, NestResult>();
  return {
    nest(parts, sheet, options) {
      const key = JSON.stringify([parts, sheet, options]);
      const hit = cache.get(key);
      if (hit) {
        // Refresh: most recently used last.
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const result = nester.nest(parts, sheet, options);
      cache.set(key, result);
      if (cache.size > size) cache.delete(cache.keys().next().value as string);
      return result;
    },
  };
}

/** A few materials, with room for undo/redo to land on recent layouts. */
const nester = cachingNester(guillotineNester, 24);

export function deriveOutputs(project: Project): Outputs {
  const built = expand(project);
  const view = built.project;
  const models = projectModels(view);
  const assemblies = built.assemblies.map((a) => ({
    id: a.id,
    name: a.name,
    parts: a.model.parts,
  }));
  const cutList = buildCutList(view, models, assemblies);
  const nests = nestCutList(view, cutList, nester);
  const extras = {
    hardware: built.assemblies.flatMap((a) => a.model.hardware),
    mouldings: mouldingTotals(built.assemblies.flatMap((a) => a.mouldings)),
  };
  return {
    project,
    built,
    cutList,
    nests,
    estimate: estimate(view, cutList, nests, models, extras),
  };
}

/**
 * Cut list, sheet layouts and estimate for the open project. They follow a deferred copy of
 * the project, so an edit repaints the model and editor first and the outputs right after.
 */
export function useOutputs(project: Project): Outputs {
  const deferred = useDeferredValue(project);
  return useMemo(() => deriveOutputs(deferred), [deferred]);
}
