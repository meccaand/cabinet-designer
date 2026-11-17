import {
  compileBuiltIn,
  expandProject,
  type CompiledBuiltIn,
  type ExpandedProject,
} from '../core/builtin';
import type { BuiltIn, Project } from '../core/model';

/**
 * Built-ins compiled per built-in and cached by identity (ADR-040). A built-in compiles again
 * only when it, the room, the styles, the conventions, the materials or the shop settings
 * change, so its compiled cabinets keep their identity and their parts stay cached (models.ts).
 */
interface Entry {
  deps: unknown[];
  result: CompiledBuiltIn;
}
const perBuiltIn = new WeakMap<BuiltIn, Entry>();
const perProject = new WeakMap<Project, ExpandedProject>();

const depsOf = (p: Project) => [
  p.room,
  p.stylePresets,
  p.construction,
  p.materials,
  p.shop,
  p.units,
];

function compileCached(project: Project, b: BuiltIn): CompiledBuiltIn {
  const deps = depsOf(project);
  const hit = perBuiltIn.get(b);
  if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.result;
  const result = compileBuiltIn(project, b);
  perBuiltIn.set(b, { deps, result });
  return result;
}

/** The project as built: its own cabinets plus every built-in's, and the built-ins' run parts. */
export function expand(project: Project): ExpandedProject {
  const hit = perProject.get(project);
  if (hit) return hit;
  const e = expandProject(project, compileCached);
  perProject.set(project, e);
  return e;
}
