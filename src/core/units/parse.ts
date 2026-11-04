import { MM_PER_INCH, quantize, type Mm } from './length';

export type ParseResult = { ok: true; value: Mm } | { ok: false; error: string };

/** Unit applied to a bare number such as `23.5` or `23 1/4`. */
export type BareUnit = 'in' | 'mm';

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

/**
 * One amount: mixed number ("23 1/4", "23-1/4"), fraction ("3/4") or decimal ("23.25", ".5").
 * No spaces around the slash: "23 /4" is ambiguous (23/4 or a typo for 23 1/4), so it is rejected.
 * Capture groups: 1 whole, 2 num, 3 den | 4 num, 5 den | 6 decimal.
 */
const AMOUNT = String.raw`(?:(\d+)(?:\s+|\s*-\s*)(\d+)/(\d+)|(\d+)/(\d+)|(\d+(?:\.\d*)?|\.\d+))`;

const SINGLE = new RegExp(String.raw`^${AMOUNT}\s*(mm|cm|m|"|')?$`);
const FEET_INCHES = new RegExp(String.raw`^${AMOUNT}\s*'\s*(?:-\s*)?${AMOUNT}\s*"?$`);

const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, '"': MM_PER_INCH, "'": MM_PER_INCH * 12 } as const;

/**
 * Parse a user-typed length into mm.
 *
 * Accepts: `23`, `23.25`, `.5`, `3/4`, `23 1/4`, `23-1/4"`, `23¼`, `23.25 in`, `2'`, `1' 2"`,
 * `1'-2 1/4"`, `2 ft 3 in`, `590mm`, `59 cm`, `0.59m`. Bare numbers use `bareUnit`.
 * A leading `-` makes the value negative; callers enforce their own ranges.
 */
export function parseLength(input: string, bareUnit: BareUnit): ParseResult {
  let text = normalize(input);
  if (text === '') return { ok: false, error: 'Enter a length.' };

  let sign = 1;
  if (text.startsWith('-')) {
    sign = -1;
    text = text.slice(1).trimStart();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trimStart();
  }

  const fi = FEET_INCHES.exec(text);
  if (fi) {
    const feet = amountFrom(fi, 1);
    const inches = amountFrom(fi, 7);
    if (!feet.ok) return feet;
    if (!inches.ok) return inches;
    return { ok: true, value: quantize(sign * (feet.value * 12 + inches.value) * MM_PER_INCH) };
  }

  const single = SINGLE.exec(text);
  if (single) {
    const amount = amountFrom(single, 1);
    if (!amount.ok) return amount;
    const unit = single[7] as keyof typeof MM_PER_UNIT | undefined;
    if (unit === undefined) {
      const factor = bareUnit === 'in' ? MM_PER_INCH : 1;
      return { ok: true, value: quantize(sign * amount.value * factor) };
    }
    if (amount.isFraction && (unit === 'mm' || unit === 'cm' || unit === 'm')) {
      return { ok: false, error: 'Use decimals with metric units, e.g. 12.5 mm.' };
    }
    return { ok: true, value: quantize(sign * amount.value * MM_PER_UNIT[unit]) };
  }

  return {
    ok: false,
    error: `Can't read "${input.trim()}" as a length. Try 23 1/4", 23.25 or 590mm.`,
  };
}

function normalize(input: string): string {
  let text = input.trim().toLowerCase();
  text = text.replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'").replace(/''/g, '"');
  // "23½" → "23 1/2"; a lone "½" → "1/2".
  text = text.replace(/[½¼¾⅛⅜⅝⅞]/g, (ch) => ` ${UNICODE_FRACTIONS[ch]}`).trim();
  // Word units → symbols. Lookarounds instead of \b so "23in" and "2ft" work.
  const word = (w: string) => new RegExp(String.raw`(?<![a-z])(?:${w})(?![a-z])\.?`, 'g');
  text = text
    .replace(word('millimet(?:er|re)s?'), 'mm')
    .replace(word('centimet(?:er|re)s?'), 'cm')
    .replace(word('met(?:er|re)s?'), 'm')
    .replace(word('inch(?:es)?|in'), '"')
    .replace(word('feet|foot|ft'), "'");
  return text.replace(/\s+/g, ' ');
}

type Amount = { ok: true; value: number; isFraction: boolean } | { ok: false; error: string };

function amountFrom(match: RegExpExecArray, first: number): Amount {
  const [whole, mixedNum, mixedDen, num, den, decimal] = match.slice(first, first + 6);
  if (decimal !== undefined) return { ok: true, value: Number(decimal), isFraction: false };
  const n = Number(mixedNum ?? num);
  const d = Number(mixedDen ?? den);
  if (d === 0) return { ok: false, error: 'A fraction cannot have 0 on the bottom.' };
  return { ok: true, value: Number(whole ?? 0) + n / d, isFraction: true };
}
