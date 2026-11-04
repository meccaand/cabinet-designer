import { AXES, extent, type Axis, type Box } from '../geometry';
import {
  resolveConstruction,
  type Banding,
  type Cabinet,
  type ConstructionDefaults,
  type MaterialRole,
  type Project,
} from '../model';
import type { Joint, Part, PartEdges, PartRole } from '../parts';
import { quantize, type Mm } from '../units';

/** Thrown for cabinets that cannot be built as specified; collected into the result. */
export class BuildError extends Error {}

export interface StockInfo {
  id: string;
  thickness: Mm;
  grain: boolean;
}

/** Everything a generator step needs: the cabinet, its resolved conventions and materials. */
export class BuildContext {
  readonly c: ConstructionDefaults;
  readonly parts: Part[] = [];
  readonly joints: Joint[] = [];
  readonly warnings: string[] = [];

  constructor(
    readonly cabinet: Cabinet,
    readonly project: Project,
  ) {
    this.c = resolveConstruction(project.construction, cabinet.construction);
  }

  stock(role: MaterialRole): StockInfo {
    const id = this.c.materials[role];
    const sheet = this.project.materials.sheets.find((s) => s.id === id);
    if (sheet) return { id, thickness: sheet.thickness, grain: sheet.grain };
    const solid = this.project.materials.solids.find((s) => s.id === id);
    if (solid) return { id, thickness: solid.thickness, grain: true };
    throw new BuildError(`No sheet or solid stock "${id}" for ${role}.`);
  }

  banding(role: 'carcassBanding' | 'frontBanding'): Banding {
    const id = this.c.materials[role];
    const b = this.project.materials.banding.find((x) => x.id === id);
    if (!b) throw new BuildError(`No edge banding "${id}" for ${role}.`);
    return b;
  }

  thickness(role: MaterialRole): Mm {
    return this.stock(role).thickness;
  }

  /** Add a part. Sizes come from its bounds, so geometry and cut list cannot disagree. */
  add(spec: PartSpec): Part {
    const stock = this.stock(spec.materialRole);
    const { bounds, thicknessAxis } = spec;
    let lengthAxis = spec.lengthAxis;
    const widthAxis = otherAxis(lengthAxis, thicknessAxis);
    // Grainless material: "length" is simply the longer side.
    if (!stock.grain && extent(bounds, widthAxis) > extent(bounds, lengthAxis))
      lengthAxis = widthAxis;
    const wAxis = otherAxis(lengthAxis, thicknessAxis);

    const edges: PartEdges = { long1: null, long2: null, end1: null, end2: null };
    const banding = spec.banding ? this.banding(spec.banding.role) : null;
    if (banding && spec.banding) {
      for (const e of spec.banding.edges) edges[e] = banding.id;
    }
    // Long edges run along the length, so banding them shortens the width (and vice versa).
    const sub = banding?.subtractFromCut ? banding.thickness : 0;
    const longCount = (edges.long1 ? 1 : 0) + (edges.long2 ? 1 : 0);
    const endCount = (edges.end1 ? 1 : 0) + (edges.end2 ? 1 : 0);

    const finished = {
      length: extent(bounds, lengthAxis),
      width: extent(bounds, wAxis),
      thickness: extent(bounds, thicknessAxis),
    };
    const part: Part = {
      id: `${this.cabinet.id}/${spec.id}`,
      cabinetId: this.cabinet.id,
      role: spec.role,
      name: spec.name,
      materialRole: spec.materialRole,
      materialId: stock.id,
      bounds,
      lengthAxis,
      thicknessAxis,
      finished,
      cut: {
        length: quantize(finished.length - endCount * sub),
        width: quantize(finished.width - longCount * sub),
        thickness: finished.thickness,
      },
      grain: stock.grain,
      edges,
      notes: spec.notes ?? [],
    };
    for (const [label, v] of Object.entries(part.cut)) {
      if (!(v > 0)) throw new BuildError(`${spec.name}: ${label} works out to ${v.toFixed(2)} mm.`);
    }
    this.parts.push(part);
    return part;
  }

  /** Record that `guest` sits `depth` deep in a recess of `host` along `axis`. */
  joint(host: Part, guest: Part, kind: Joint['kind'], axis: Axis, depth: Mm): void {
    this.joints.push({ host: host.id, guest: guest.id, kind, axis, depth: quantize(depth) });
  }
}

export interface PartSpec {
  /** Unique within the cabinet; the part id is `${cabinetId}/${id}`. */
  id: string;
  role: PartRole;
  name: string;
  materialRole: MaterialRole;
  bounds: Box;
  lengthAxis: Axis;
  thicknessAxis: Axis;
  banding?: { role: 'carcassBanding' | 'frontBanding'; edges: (keyof PartEdges)[] };
  notes?: string[];
}

export function otherAxis(a: Axis, b: Axis): Axis {
  const rest = AXES.find((x) => x !== a && x !== b);
  if (!rest || a === b) throw new Error(`Axes ${a} and ${b} must differ.`);
  return rest;
}
