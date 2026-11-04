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
  shelfPin: 'Shelf pin',
};

/**
 * Hardware for one cabinet: hinges by door height (hinge tiers), one slide pair per drawer
 * grouped by length, one pull per door and drawer front (two when wider than `twoPullsOver`;
 * none on false fronts), and shelf pins per adjustable shelf.
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

  const pulls = input.fronts.reduce(
    (n, f) =>
      n +
      (f.kind === 'door'
        ? 1
        : f.kind === 'drawer'
          ? f.width > c.hardware.twoPullsOver
            ? 2
            : 1
          : 0),
    0,
  );
  if (pulls > 0) lines.push(line('pull', pulls));

  const pins = input.adjustableShelves * c.shelves.pinsPerShelf;
  if (pins > 0) lines.push(line('shelfPin', pins));
  return lines;
}

export function hingeCount(doorHeight: Mm, c: ConstructionDefaults): number {
  for (const tier of c.hardware.hingeTiers) {
    if (tier.upTo === null || doorHeight <= tier.upTo + 1e-6) return tier.count;
  }
  // The project schema requires a final catch-all tier, so only unvalidated data gets here.
  throw new Error('Hinge tiers must end with a tier that covers any height.');
}
