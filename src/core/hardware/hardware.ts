import type { ConstructionDefaults, HardwareItem, HardwareKind } from '../model';
import type { FrontSummary, HardwareLine } from '../parts';
import type { Mm } from '../units';

export interface HardwareInput {
  fronts: FrontSummary[];
  slides: Mm[];
  adjustableShelves: number;
}

const GENERIC: Record<HardwareKind, string> = {
  hinge: 'Hinge',
  slide: 'Drawer slide (pair)',
  pull: 'Pull',
  knob: 'Knob',
  pictureLight: 'Picture light',
  crownMoulding: 'Crown moulding',
  baseMoulding: 'Base moulding',
  shelfPin: 'Shelf pin',
};

/**
 * Hardware for one cabinet: hinges by door height (hinge tiers), one slide pair per drawer
 * grouped by length, one handle (pull or knob, by convention) per door and drawer front (two
 * when wider than `twoPullsOver`; none on false fronts or the cabinet-hinged leaf of a bi-fold),
 * and shelf pins per adjustable shelf. `handlesPerFront` is the same rule the drawn handles use.
 */
export function hardwareFor(
  input: HardwareInput,
  c: ConstructionDefaults,
  library: HardwareItem[],
): HardwareLine[] {
  const item = (kind: HardwareKind) => library.find((h) => h.kind === kind) ?? null;
  const line = (kind: HardwareKind, qty: number, length?: Mm): HardwareLine => {
    const it = item(kind);
    return {
      kind,
      itemId: it?.id ?? null,
      name: it?.name ?? GENERIC[kind],
      qty,
      ...(length !== undefined && { length }),
    };
  };

  const lines: HardwareLine[] = [];
  const doors = input.fronts.filter((f) => f.kind === 'door');
  const hinges = doors.reduce((n, d) => n + hingeCount(d.height, c), 0);
  if (hinges > 0) lines.push(line('hinge', hinges));

  const byLength = new Map<Mm, number>();
  for (const len of input.slides) byLength.set(len, (byLength.get(len) ?? 0) + 1);
  for (const [len, qty] of [...byLength].sort((a, b) => a[0] - b[0]))
    lines.push(line('slide', qty, len));

  const handles = input.fronts.reduce((n, f) => n + handlesPerFront(f, c), 0);
  if (handles > 0) lines.push(line(c.hardware.handle, handles));

  const pins = input.adjustableShelves * c.shelves.pinsPerShelf;
  if (pins > 0) lines.push(line('shelfPin', pins));
  return lines;
}

/** Pulls or knobs on one front. */
export function handlesPerFront(f: FrontSummary, c: ConstructionDefaults): number {
  if (f.kind === 'door') return f.noPull ? 0 : 1;
  if (f.kind === 'drawer') return f.width > c.hardware.twoPullsOver ? 2 : 1;
  return 0;
}

export function hingeCount(doorHeight: Mm, c: ConstructionDefaults): number {
  for (const tier of c.hardware.hingeTiers) {
    if (tier.upTo === null || doorHeight <= tier.upTo + 1e-6) return tier.count;
  }
  // The project schema requires a final catch-all tier, so only unvalidated data gets here.
  throw new Error('Hinge tiers must end with a tier that covers any height.');
}
