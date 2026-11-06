/**
 * Physical sanity checks every generated cabinet must pass. Shared by the property-based and
 * table-driven tests. Returns a list of violations (empty = all good) so failures are readable.
 */
import { AXES, extent, intersection } from '../../geometry';
import type { Cabinet, Project } from '../../model';
import { resolveConstruction } from '../../model';
import type { CabinetModel, Part } from '../../parts';

const EPS = 1e-6;

export function violations(model: CabinetModel, cabinet: Cabinet, project: Project): string[] {
  const out: string[] = [];
  const c = resolveConstruction(project.construction, cabinet.construction);
  const parts = model.parts;
  const byId = new Map(parts.map((p) => [p.id, p]));

  // Unique ids
  if (byId.size !== parts.length) out.push('duplicate part ids');

  // Sizes are the bounds; thickness is the stock thickness (spacers are planed to fit)
  const stock = (p: Part) =>
    [...project.materials.sheets, ...project.materials.solids].find((m) => m.id === p.materialId);
  for (const p of parts) {
    const ext = AXES.map((a) => extent(p.bounds, a)).sort((a, b) => a - b);
    const dims = [p.finished.length, p.finished.width, p.finished.thickness].sort((a, b) => a - b);
    if (dims.some((d, i) => Math.abs(d - ext[i]!) > EPS))
      out.push(`${p.id}: finished size != bounds`);
    if (p.role !== 'slideSpacer' && Math.abs(p.finished.thickness - stock(p)!.thickness) > EPS) {
      out.push(`${p.id}: thickness ${p.finished.thickness} != stock ${stock(p)!.thickness}`);
    }
    if (p.cut.length <= 0 || p.cut.width <= 0) out.push(`${p.id}: non-positive cut size`);
    if (p.cut.length > p.finished.length + EPS || p.cut.width > p.finished.width + EPS) {
      out.push(`${p.id}: cut larger than finished`);
    }
  }

  // Envelope: within the cabinet (face frame may overhang; overlay fronts project forward)
  const oh = c.carcass.style === 'faceFrame' ? c.faceFrame.sideOverhang : 0;
  const frontRoles = ['slabFront', 'frontStile', 'frontRail', 'frontPanel', 'blindPanel'];
  const maxFront = Math.max(
    0,
    ...parts.filter((p) => frontRoles.includes(p.role)).map((p) => p.finished.thickness),
  );
  const endT = (id: string) =>
    parts.find((p) => p.id === `${cabinet.id}/${id}`)?.finished.thickness ?? 0;
  const endL = endT('endPanel/L');
  const endR = endT('endPanel/R');
  // A blind corner's pull filler stands out from the face by its width.
  const zMax = cabinet.depth + maxFront + (cabinet.blind?.pullFillerWidth ?? 0);
  type Env = { x0: number; x1: number; z0: number; z1: number };
  // An L-shaped cabinet: the run's envelope, or the return's (ending at the corner line).
  const envelopes: Env[] = cabinet.corner
    ? [
        { x0: -oh - endL, x1: cabinet.width, z0: 0, z1: zMax },
        {
          x0: cabinet.width - cabinet.corner.returnDepth - maxFront,
          x1: cabinet.width,
          z0: 0,
          z1: cabinet.corner.returnWidth + oh + endT('return/endPanel/R'),
        },
      ]
    : [{ x0: -oh - endL, x1: cabinet.width + oh + endR, z0: 0, z1: zMax }];
  for (const p of parts) {
    const b = p.bounds;
    const inside =
      b.min.y >= -EPS &&
      b.max.y <= cabinet.height + EPS &&
      envelopes.some(
        (v) =>
          b.min.x >= v.x0 - EPS &&
          b.max.x <= v.x1 + EPS &&
          b.min.z >= v.z0 - EPS &&
          b.max.z <= v.z1 + EPS,
      );
    if (!inside) out.push(`${p.id}: outside the cabinet envelope`);
  }

  // Overlaps happen only at declared joints, by exactly the joint depth
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const joints = new Map(model.joints.map((j) => [key(j.host, j.guest), j]));
  const seen = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    for (let k = i + 1; k < parts.length; k++) {
      const a = parts[i]!;
      const b = parts[k]!;
      const hit = intersection(a.bounds, b.bounds);
      if (!hit) continue;
      const j = joints.get(key(a.id, b.id));
      if (!j) {
        out.push(`${a.id} and ${b.id} overlap with no joint`);
        continue;
      }
      seen.add(key(a.id, b.id));
      const depth = extent(hit, j.axis);
      if (Math.abs(depth - j.depth) > EPS) {
        out.push(`${j.kind} ${j.host}/${j.guest}: overlap ${depth} != declared ${j.depth}`);
      }
    }
  }
  for (const j of model.joints) {
    if (!byId.has(j.host) || !byId.has(j.guest)) out.push(`joint references a missing part`);
    else if (!seen.has(key(j.host, j.guest)))
      out.push(`${j.kind} ${j.host}/${j.guest}: parts don't meet`);
    if (j.depth <= 0) out.push(`${j.kind} ${j.host}/${j.guest}: non-positive depth`);
  }

  // Panels between the sides span exactly the interior plus the joint engagement (L-shaped
  // cabinets' two-piece panels are checked by their own tests)
  const t = project.materials.sheets.find((s) => s.id === c.materials.carcass)!.thickness;
  const housed = c.carcass.joinery === 'dado' || c.carcass.joinery === 'rabbet';
  const expected = cabinet.width - 2 * t + (housed ? 2 * c.carcass.dadoDepth : 0);
  for (const p of parts.filter((x) => ['bottom', 'top', 'stretcher'].includes(x.role))) {
    if (!cabinet.corner && Math.abs(extent(p.bounds, 'x') - expected) > EPS)
      out.push(`${p.id}: width sum is off`);
  }

  // Drawer boxes use a real slide length, one slide pair per box
  const boxSides = parts.filter((p) => p.role === 'drawerSide');
  if (boxSides.length !== model.slides.length * 2) out.push('slide count != drawer count');
  for (const s of boxSides) {
    if (!c.drawer.slideLengths.some((l) => Math.abs(l - s.finished.length) < EPS)) {
      out.push(`${s.id}: box length is not a slide length`);
    }
  }
  return out;
}
