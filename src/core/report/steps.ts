import type { Cut, SheetLayout } from '../nesting';
import type { UnitSettings } from '../model';
import { formatLength } from '../units';

/** A saw cut in shop language, e.g. "Rip a strip 23 1/4" wide off the sheet." */
export function cutStep(c: Cut, sheet: SheetLayout, units: UnitSettings): string {
  const f = (v: number) => formatLength(v, units);
  const verb = c.kind === 'rip' ? 'Rip' : 'Crosscut';
  const label = sheet.placements.find((p) => p.partId === c.partId)?.label;
  switch (c.stage) {
    case 0:
      return `Trim ${f(c.size)} off a factory edge (${c.kind}).`;
    case 1:
      return `${verb} a strip ${f(c.size)} wide off the sheet.`;
    case 2:
      return `${verb} a ${f(c.size)} section off the strip.`;
    case 3:
      return `${verb} part #${label} off the section at ${f(c.size)}.`;
    case 4:
      return `Trim part #${label} to ${f(c.size)} (${c.kind}).`;
  }
}
