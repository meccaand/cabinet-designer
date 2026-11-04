import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatLength, roundLength, type UnitFormat } from './format';
import { inch, quantize } from './length';
import { parseLength } from './parse';

const in16: UnitFormat = { system: 'imperial', fractionDenom: 16, mmDecimals: 1 };
const in32: UnitFormat = { system: 'imperial', fractionDenom: 32, mmDecimals: 1 };
const mm0: UnitFormat = { system: 'metric', fractionDenom: 16, mmDecimals: 0 };
const mm1: UnitFormat = { system: 'metric', fractionDenom: 16, mmDecimals: 1 };
const mm2: UnitFormat = { system: 'metric', fractionDenom: 16, mmDecimals: 2 };

describe('formatLength: imperial', () => {
  it.each([
    [0, '0"'],
    [0.5, '1/2"'],
    [0.75, '3/4"'],
    [1, '1"'],
    [23.25, '23 1/4"'],
    [23.0625, '23 1/16"'],
    [34.5, '34 1/2"'],
    [96, '96"'],
    [-0.25, '-1/4"'],
    [-23.25, '-23 1/4"'],
    [15 / 16, '15/16"'],
  ])('%f in → %s at 1/16', (inches, text) => {
    expect(formatLength(inch(inches), in16)).toBe(text);
  });

  it.each([
    [23 + 15 / 32, '23 15/32"'],
    [1 / 32, '1/32"'],
    [0.5, '1/2"'],
    [31 / 32, '31/32"'],
  ])('%f in → %s at 1/32', (inches, text) => {
    expect(formatLength(inch(inches), in32)).toBe(text);
  });

  it('marks values that are off the precision grid', () => {
    expect(formatLength(inch(23 + 15 / 32), in16)).toBe('≈23 1/2"'); // rounds half up
    expect(formatLength(inch(23 + 1 / 64), in32)).toBe('≈23 1/32"');
    expect(formatLength(inch(0.709), in16)).toBe('≈11/16"'); // 3/4 ply actual thickness
    expect(formatLength(inch(0.709), in32)).toBe('≈23/32"');
    expect(formatLength(inch(1 / 3), in16)).toBe('≈5/16"');
  });

  it('rounds up into the next whole inch', () => {
    expect(formatLength(inch(23.999), in16)).toBe('≈24"');
  });

  it('can omit the unit and the approx mark', () => {
    expect(formatLength(inch(23.25), in16, { unit: false })).toBe('23 1/4');
    expect(formatLength(inch(23 + 15 / 32), in16, { approxMark: false })).toBe('23 1/2"');
  });

  it('reports exactness separately from text', () => {
    expect(roundLength(inch(0.709), in16)).toEqual({ text: '11/16"', exact: false });
    expect(roundLength(inch(0.75), in16)).toEqual({ text: '3/4"', exact: true });
  });

  it('never prints negative zero', () => {
    expect(formatLength(inch(-0.001), in16)).toBe('≈0"');
  });
});

describe('formatLength: metric', () => {
  it.each([
    [mm0, 590, '590 mm'],
    [mm1, 590, '590.0 mm'],
    [mm2, 590.55, '590.55 mm'],
    [mm1, 590.55, '≈590.6 mm'],
    [mm0, 590.55, '≈591 mm'],
    [mm1, 18, '18.0 mm'],
    [mm0, -3, '-3 mm'],
    [mm1, -0.01, '≈0.0 mm'],
    [mm1, inch(0.75), '≈19.1 mm'],
    [mm1, inch(0.25), '≈6.4 mm'],
  ] as [UnitFormat, number, string][])('%o: %f mm → %s', (units, mm, text) => {
    expect(formatLength(mm, units)).toBe(text);
  });

  it('can omit the unit', () => {
    expect(formatLength(590, mm0, { unit: false })).toBe('590');
  });
});

describe('round trips', () => {
  // Cabinet-scale lengths: 0 to 120" (10 ft) on the 1/32" grid.
  const ticks32 = fc.integer({ min: 0, max: 120 * 32 });

  it('format → parse is exact for every on-grid imperial length', () => {
    fc.assert(
      fc.property(ticks32, fc.constantFrom(in16, in32), (ticks, units) => {
        const value = inch(ticks / 32);
        const { text, exact } = roundLength(value, units);
        const parsed = parseLength(text, 'in');
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        if (exact) expect(parsed.value).toBe(value);
        else expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(inch(1 / 32) + 1e-6);
      }),
      { numRuns: 2000 },
    );
  });

  it('rounding error never exceeds half a precision step', () => {
    fc.assert(
      fc.property(fc.double({ min: -3000, max: 3000, noNaN: true }), (raw) => {
        const value = quantize(raw);
        for (const units of [in16, in32]) {
          const parsed = parseLength(roundLength(value, units).text, 'in');
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            const halfStep = 25.4 / units.fractionDenom / 2;
            expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(halfStep + 1e-6);
          }
        }
        for (const units of [mm0, mm1, mm2]) {
          const parsed = parseLength(roundLength(value, units).text, 'in');
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            const halfStep = 10 ** -units.mmDecimals / 2;
            expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(halfStep + 1e-6);
          }
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('an exact mark is only given when the parsed text equals the stored value', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3000, noNaN: true }), (raw) => {
        const value = quantize(raw);
        for (const units of [in16, in32, mm0, mm1, mm2]) {
          const { text, exact } = roundLength(value, units);
          const parsed = parseLength(text, 'in');
          if (parsed.ok && exact) expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(1e-6);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe('quantize', () => {
  it('snaps to 1 nm and normalises negative zero', () => {
    expect(quantize(1.0000004)).toBe(1);
    expect(quantize(1.0000006)).toBe(1.000001);
    expect(Object.is(quantize(-0.0000001), 0)).toBe(true);
  });

  it('makes float-drifted sums compare equal', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(quantize(0.1 + 0.2)).toBe(quantize(0.3));
  });
});
