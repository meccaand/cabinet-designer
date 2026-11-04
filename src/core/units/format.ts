import type { Mm } from './length';

export interface UnitFormat {
  system: 'imperial' | 'metric';
  /** Imperial precision: lengths are shown to the nearest 1/16" or 1/32". */
  fractionDenom: 16 | 32;
  /** Metric precision: decimal places shown for mm. */
  mmDecimals: 0 | 1 | 2;
}

export interface FormatOptions {
  /** Append the unit (`"` or ` mm`). Default true. */
  unit?: boolean;
  /**
   * Prefix `≈` when the value is not exactly representable at the chosen precision,
   * so rounding is never silent (ADR-002). Default true.
   */
  approxMark?: boolean;
}

export interface Rounded {
  /** Formatted text without the approx mark. */
  text: string;
  /** True when the displayed value equals the stored (nm-quantized) value exactly. */
  exact: boolean;
}

const NM_PER_MM = 1e6;
const NM_PER_INCH = 25_400_000; // exact integer; 25.4 * 1e6 in floats is not guaranteed to be

export function roundLength(value: Mm, units: UnitFormat, opts: FormatOptions = {}): Rounded {
  const withUnit = opts.unit ?? true;
  // Round on the integer-nanometre value so half-steps (590.55 mm, 1/64") round consistently
  // instead of depending on binary float error.
  const nm = Math.round(value * NM_PER_MM);
  if (units.system === 'metric') {
    const nmPerStep = NM_PER_MM / 10 ** units.mmDecimals;
    const steps = roundHalfAwayFromZero(nm / nmPerStep);
    const text = (steps / 10 ** units.mmDecimals).toFixed(units.mmDecimals);
    return { text: withUnit ? `${text} mm` : text, exact: steps * nmPerStep === nm };
  }

  const denom = units.fractionDenom;
  const ticks = roundHalfAwayFromZero((nm * denom) / NM_PER_INCH);
  const text = fractionText(ticks, denom);
  return { text: withUnit ? `${text}"` : text, exact: ticks * NM_PER_INCH === nm * denom };
}

export function formatLength(value: Mm, units: UnitFormat, opts: FormatOptions = {}): string {
  const { text, exact } = roundLength(value, units, opts);
  return exact || opts.approxMark === false ? text : `≈${text}`;
}

/** Math.round sends -0.5 to -0; cut sizes round symmetrically about zero. */
function roundHalfAwayFromZero(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return Object.is(r, -0) ? 0 : r;
}

/** `ticks` sixteenths (or thirty-seconds) → "23 1/4", "3/8", "0", "-1 1/2". */
function fractionText(ticks: number, denom: number): string {
  if (ticks === 0) return '0';
  const sign = ticks < 0 ? '-' : '';
  const abs = Math.abs(ticks);
  const whole = Math.floor(abs / denom);
  let num = abs % denom;
  let den = denom;
  while (num !== 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) return `${sign}${whole}`;
  return whole === 0 ? `${sign}${num}/${den}` : `${sign}${whole} ${num}/${den}`;
}
