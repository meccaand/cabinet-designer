/**
 * Canonical length unit: millimetres, stored as a plain `number` (ADR-002).
 *
 * Every length inside the domain is mm. Inches exist only at the UI edge (parse/format)
 * and in literal constants written through `inch()`.
 */
export type Mm = number;

export const MM_PER_INCH = 25.4;

/** Lengths are quantized to 1 nanometre so equal parts compare and group exactly. */
const QUANTA_PER_MM = 1e6;

export function quantize(value: Mm): Mm {
  const q = Math.round(value * QUANTA_PER_MM) / QUANTA_PER_MM;
  return Object.is(q, -0) ? 0 : q;
}

/** Inches → mm (quantized). Use for constants: `inch(3 / 4)`. */
export function inch(inches: number): Mm {
  return quantize(inches * MM_PER_INCH);
}
